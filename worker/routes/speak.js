/**
 * POST /api/speak  →  audio/mpeg
 *
 * Synthesises one chunk of already-verified text.
 *
 * IMPORTANT: this endpoint speaks text the CLIENT sends back. That would be a hole big
 * enough to drive anything through — someone could POST arbitrary text and have the
 * avatar say it in Kshitij's voice — so the text is re-verified here before synthesis.
 * The client is not trusted to have sent back what the server gave it.
 *
 * On any refusal the response is 4xx with JSON, and the client simply does not play
 * audio for that chunk. It still shows the caption, so the recruiter loses nothing.
 */

import { speak, estimateNeurons } from '../providers/tts.js';
import { earlyReject } from '../grounding/verifier.js';
import { bumpQuota, getQuotas } from '../store/d1.js';
import { TTS, LIMITS } from '../constants.js';

export async function handleSpeak(request, env, ctx) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'bad_json' }, { status: 400 });
  }

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) return Response.json({ error: 'empty' }, { status: 400 });
  if (text.length > TTS.maxCharsPerCall) {
    return Response.json({ error: 'too_long', max: TTS.maxCharsPerCall }, { status: 413 });
  }

  // The client is untrusted. Re-scan before letting the avatar say it out loud.
  //
  // Note this deliberately uses earlyReject rather than the full verifyAnswer: the text
  // arriving here is a SENTENCE FRAGMENT of an already-verified monologue, so it has no
  // CITE line of its own and requiring one would reject every legitimate chunk. The
  // banned-technology, commitment and prompt-leak scans are what matter here, and those
  // are exactly what earlyReject runs.
  const rejected = earlyReject(text);
  if (rejected) {
    console.error(JSON.stringify({
      ts: Date.now(), level: 'error', event: 'speak_refused', reason: rejected,
    }));
    return Response.json({ error: 'refused', reason: rejected }, { status: 403 });
  }

  // Price the request before spending anything.
  const quotas = await getQuotas(env);
  const spent = quotas.tts ?? 0;
  const cost = estimateNeurons(text);
  if (spent + cost > LIMITS.ttsNeuronBudget) {
    // The client falls back to the browser's own speech synthesis — free, unlimited,
    // less good, and infinitely better than silence.
    return Response.json(
      { error: 'neuron_budget_exhausted', use_browser_tts: true },
      { status: 429 }
    );
  }

  const result = await speak(text, env, { spent });
  if (!result.ok) {
    return Response.json(
      { error: result.reason, use_browser_tts: true },
      { status: result.reason === 'neuron_budget_exhausted' ? 429 : 503 }
    );
  }

  // Neurons are charged per audio minute, so record the ESTIMATE we priced against
  // rather than a character count. Analytics must never delay the audio.
  ctx.waitUntil(bumpQuotaBy(env, 'tts', result.neurons));

  return new Response(result.audio, {
    headers: {
      'content-type': 'audio/mpeg',
      'cache-control': 'no-store',
      'x-tts-voice': result.voice,
      'x-tts-neurons': String(result.neurons),
    },
  });
}

/**
 * bumpQuota increments by one; TTS costs a variable number of neurons, so record the
 * real cost. Falls back to a single increment if the multi-bump fails — an inaccurate
 * counter is better than a failed request.
 */
async function bumpQuotaBy(env, provider, n) {
  if (!env.DB) return;
  const day = new Date().toISOString().slice(0, 10);
  try {
    await env.DB.prepare(
      'INSERT INTO quota_day (day, provider, calls) VALUES (?, ?, ?) ' +
      'ON CONFLICT(day, provider) DO UPDATE SET calls = calls + ?'
    ).bind(day, provider, n, n).run();
  } catch {
    await bumpQuota(env, provider).catch(() => {});
  }
}
