/**
 * POST /api/ask  →  text/event-stream
 *
 * The answer path. Three properties it must never lose:
 *
 *  1. The client never sees text the verifier has not cleared. Deltas are BUFFERED, not
 *     forwarded. Streaming raw model output to the browser would make every guardrail in
 *     this repo decorative.
 *  2. Every error path emits a usable `fallback_text`. The client is never left with
 *     nothing to show.
 *  3. This handler consumes almost no CPU. Awaiting an upstream fetch is free against the
 *     Worker's 10ms CPU budget, which is what lets a 6-second streamed answer run on the
 *     free plan with no queue and no long-lived process.
 */

import { streamAnswer } from '../providers/chain.js';
import { buildPrompt, sanitiseQuestion } from '../grounding/prompt.js';
import { verifyAnswer, earlyReject } from '../grounding/verifier.js';
import { matchFaq } from '../grounding/faq.js';
import { getToken, getKillSwitch } from '../store/kv.js';
import { checkRateLimit, bumpQuota, logAsk } from '../store/d1.js';
import { LIMITS, REFUSAL } from '../constants.js';
import { PERSON } from '../grounding/corpus.generated.js';

const enc = new TextEncoder();
const sse = (type, data) => enc.encode(`data: ${JSON.stringify({ type, ...data })}\n\n`);

/** Coarse bucket only. The question text itself is never stored (PRD §12.3). */
function classify(q) {
  const s = q.toLowerCase();
  if (/salary|ctc|notice|compensation|relocat|visa/.test(s)) return 'banned';
  if (/project|docprocessor|cortex|splitease|built|build/.test(s)) return 'project';
  if (/intern|zhecker|experience|work|job/.test(s)) return 'experience';
  if (/this page|this thing|architecture|how does this/.test(s)) return 'meta';
  return 'other';
}

export async function handleAsk(request, env, ctx) {
  const started = Date.now();
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'bad_json', fallback_text: REFUSAL }, { status: 400 });
  }

  const question = sanitiseQuestion(body.text);
  const tokenId = typeof body.token === 'string' ? body.token : null;
  const sid = typeof body.sid === 'string' ? body.sid.slice(0, 64) : null;

  if (!question) {
    return Response.json({ error: 'empty_question', fallback_text: 'Ask me something about his work.' }, { status: 400 });
  }

  const qClass = classify(question);

  // --- Free, instant, unhallucinatable. Try this before spending any quota.
  const faq = matchFaq(question);
  if (faq) {
    ctx.waitUntil(logAsk(env, { tokenId, sid, provider: 'faq', latencyMs: Date.now() - started, refused: false, citedNodes: [faq.id], qClass }));
    return streamStatic(faq.a, [faq.id], 'faq', Date.now() - started);
  }

  const kill = await getKillSwitch(env);
  if (kill.mode === 'static_only') {
    return streamStatic(
      `I'm running in reduced mode right now, so I can't answer freely — but ${PERSON.name} is at ${PERSON.email} and he'll answer directly.`,
      [], 'static', Date.now() - started
    );
  }

  const rate = await checkRateLimit(env, { tokenId, sid, limits: LIMITS });
  if (!rate.allowed) {
    const msg = rate.reason === 'too_fast'
      ? 'One at a time — give me a second.'
      : `I've hit my limit for today. ${PERSON.name} is at ${PERSON.email} and he'll answer directly.`;
    return Response.json({ error: rate.reason, fallback_text: msg }, { status: 429 });
  }

  const session = tokenId ? await tokenSession(env, tokenId) : null;
  const prompt = buildPrompt(question, body.history, session);

  const stream = new ReadableStream({
    async start(controller) {
      let buffered = '';
      let provider = null;
      let model = null;
      let rejected = null;

      try {
        for await (const chunk of streamAnswer(prompt, env)) {
          if (chunk.type === 'meta') {
            provider = chunk.provider;
            model = chunk.model;
            continue;
          }
          if (chunk.type === 'delta') {
            buffered += chunk.text;
            // Cheap early abort. An optimisation, not the guarantee — verifyAnswer()
            // below is what actually decides.
            rejected = earlyReject(buffered);
            if (rejected) break;
            continue;
          }
        }

        const result = rejected
          ? { ok: false, reason: rejected, answer: REFUSAL, cited: [] }
          : verifyAnswer(buffered);

        // Only now does anything reach the client.
        controller.enqueue(sse('answer', { text: result.answer }));
        if (result.cited.length) controller.enqueue(sse('citation', { nodes: result.cited }));
        controller.enqueue(sse('done', { provider: provider ?? 'none', latency_ms: Date.now() - started }));

        ctx.waitUntil(Promise.all([
          bumpQuota(env, provider ?? 'unknown'),
          logAsk(env, {
            tokenId, sid, provider: provider ?? 'none',
            latencyMs: Date.now() - started,
            refused: !result.ok,
            citedNodes: result.cited,
            qClass: result.ok ? qClass : `refused:${result.reason ?? 'unknown'}`.slice(0, 32),
          }),
        ]));

        if (!result.ok) {
          console.error(JSON.stringify({
            ts: Date.now(), level: 'error', event: 'grounding_refusal',
            sid, reason: result.reason, provider, model,
          }));
        }
      } catch (err) {
        // All providers down. Still emit something the client can render.
        console.error(JSON.stringify({
          ts: Date.now(), level: 'error', event: 'chain_exhausted', sid,
          attempts: err.attempts ?? null, message: String(err.message ?? err),
        }));
        controller.enqueue(sse('error', {
          code: 'providers_unavailable',
          fallback_text: `I can't reach my model right now. ${PERSON.name} is at ${PERSON.email} — that always works.`,
        }));
        controller.enqueue(sse('done', { provider: 'none', latency_ms: Date.now() - started }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    },
  });
}

async function tokenSession(env, tokenId) {
  const p = await getToken(env, tokenId);
  if (!p) return null;
  return {
    personalised: true,
    recruiter: { name: p.name, company: p.company, role: p.role },
    lead_project: p.lead_project,
    jd_points: p.jd_points,
  };
}

/** Emits a fixed answer in the same SSE shape, so the client has exactly one code path. */
function streamStatic(text, cited, provider, latencyMs) {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(sse('answer', { text }));
      if (cited.length) controller.enqueue(sse('citation', { nodes: cited }));
      controller.enqueue(sse('done', { provider, latency_ms: latencyMs }));
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' },
  });
}
