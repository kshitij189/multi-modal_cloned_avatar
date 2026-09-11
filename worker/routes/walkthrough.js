/**
 * POST /api/walkthrough  →  text/event-stream
 *
 * The ~90 seconds the avatar speaks on arrival. Generated fresh every visit — there are
 * no scripted lines anywhere in this system.
 *
 * Emits the monologue already split into speakable chunks, so the client can request
 * audio for chunk 1 and start talking while chunk 2 is still being synthesised. That is
 * what gets the avatar speaking in about a second rather than after the whole monologue
 * has been rendered.
 *
 * Spoken text is verified exactly as strictly as written text. A recruiter who only hears
 * a claim cannot re-read it or check its citation, so if anything the bar is higher.
 */

import { streamAnswer } from '../providers/chain.js';
import { buildWalkthroughPrompt } from '../grounding/prompt.js';
import { verifyAnswer } from '../grounding/verifier.js';
import { splitForSpeech } from '../providers/tts.js';
import { getToken, getKillSwitch } from '../store/kv.js';
import { bumpQuota, logAsk } from '../store/d1.js';
import { LIMITS } from '../constants.js';
import { PERSON, PROJECTS } from '../grounding/corpus.generated.js';

const enc = new TextEncoder();
const sse = (type, data) => enc.encode(`data: ${JSON.stringify({ type, ...data })}\n\n`);

/**
 * Last-resort monologue, assembled from the corpus with no model involved.
 *
 * Used when every provider is down. It is dull, but it is TRUE — assembled from the same
 * verified nodes everything else cites — and the recruiter still hears a coherent
 * introduction rather than silence.
 */
function fallbackWalkthrough() {
  const names = PROJECTS.map((p) => p.name);
  const list = names.length > 1
    ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
    : names[0];
  return (
    `Hi, I'm ${PERSON.name}. ${PERSON.headline} ` +
    `I've built and deployed ${names.length} projects — ${list}. ` +
    `My model backend is unavailable right now, so I can't talk you through them properly. ` +
    `Everything is on the page, and you can reach me directly at ${PERSON.email}.`
  );
}

export async function handleWalkthrough(request, env, ctx) {
  const started = Date.now();
  let body = {};
  try {
    body = await request.json();
  } catch { /* a walkthrough needs no input; defaults are fine */ }

  const tokenId = typeof body.token === 'string' ? body.token : null;
  const sid = typeof body.sid === 'string' ? body.sid.slice(0, 64) : null;

  const kill = await getKillSwitch(env);
  const payload = tokenId ? await getToken(env, tokenId) : null;
  const session = payload
    ? {
        personalised: true,
        recruiter: { name: payload.name, company: payload.company, role: payload.role },
        lead_project: payload.lead_project,
        jd_points: payload.jd_points,
      }
    : null;

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (text, source, cited = []) => {
        const chunks = splitForSpeech(text);
        controller.enqueue(sse('script', { text, chunks, source, cited }));
        controller.enqueue(sse('done', { source, latency_ms: Date.now() - started }));
      };

      if (kill.mode === 'static_only') {
        emit(fallbackWalkthrough(), 'fallback');
        controller.close();
        return;
      }

      let buffered = '';
      let provider = null;
      try {
        for await (const chunk of streamAnswer(buildWalkthroughPrompt(session), env)) {
          if (chunk.type === 'meta') provider = chunk.provider;
          else if (chunk.type === 'delta') buffered += chunk.text;
        }

        const result = verifyAnswer(buffered, { maxWords: LIMITS.maxWalkthroughWords });

        if (!result.ok) {
          // A walkthrough that fails verification is not spoken. The corpus-assembled
          // fallback is used instead — duller, but every word of it is true.
          console.error(JSON.stringify({
            ts: Date.now(), level: 'error', event: 'walkthrough_refused',
            sid, reason: result.reason, provider,
          }));
          emit(fallbackWalkthrough(), 'fallback');
        } else {
          emit(result.answer, provider ?? 'unknown', result.cited);
        }

        ctx.waitUntil(Promise.all([
          bumpQuota(env, provider ?? 'unknown'),
          logAsk(env, {
            tokenId, sid, provider: provider ?? 'none',
            latencyMs: Date.now() - started,
            refused: !result.ok,
            citedNodes: result.cited,
            qClass: 'walkthrough',
          }),
        ]));
      } catch (err) {
        console.error(JSON.stringify({
          ts: Date.now(), level: 'error', event: 'walkthrough_chain_exhausted',
          sid, message: String(err?.message ?? err),
        }));
        emit(fallbackWalkthrough(), 'fallback');
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
    },
  });
}
