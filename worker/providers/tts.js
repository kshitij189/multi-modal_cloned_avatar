/**
 * Text-to-speech.
 *
 * Every line the avatar speaks is generated fresh — there are no pre-rendered clips — so
 * this runs on the request path and its cost is the binding constraint on the whole
 * design. See TTS in constants.js for the verified neuron economics.
 *
 * Two things this module is careful about:
 *
 *  1. It prices a request in neurons BEFORE spending them, and refuses rather than
 *     silently burning the daily allowance. When the budget is gone the caller falls back
 *     to the browser's own speech synthesis, which is free and always available.
 *  2. It never throws at the caller. A TTS failure must degrade to "the recruiter reads
 *     the text instead", never to a broken page.
 */

import { TTS, LIMITS } from '../constants.js';

/**
 * MeloTTS bills per audio minute, so cost depends on how long the speech will be, not
 * how many characters were sent. Estimate duration from length at a natural speaking
 * rate. Deliberately rounds up — under-estimating is what would overrun the allowance.
 */
export function estimateNeurons(text, voiceId = TTS.primary) {
  const voice = TTS.voices[voiceId];
  if (!voice) return Infinity;
  if (voice.neuronsPer1kChars) {
    return Math.ceil((text.length / 1000) * voice.neuronsPer1kChars);
  }
  const seconds = text.length / TTS.charsPerSecond;
  return Math.ceil((seconds / 60) * voice.neuronsPerAudioMinute);
}

/**
 * Splits text into speakable chunks on sentence boundaries.
 *
 * Chunking is what makes the avatar start talking in about a second instead of after the
 * whole monologue has been synthesised: the client plays chunk 1 while chunk 2 is still
 * being generated. Splitting mid-sentence would be audible, so boundaries are respected
 * even when that leaves a chunk short.
 */
export function splitForSpeech(text, maxChars = TTS.maxCharsPerCall) {
  const sentences = text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);

  const chunks = [];
  let current = '';
  for (const s of sentences) {
    if (current && (current + ' ' + s).length > maxChars) {
      chunks.push(current);
      current = s;
    } else {
      current = current ? `${current} ${s}` : s;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/**
 * Synthesises one chunk.
 *
 * @returns {Promise<{ok: true, audio: ArrayBuffer, neurons: number, voice: string}
 *                 | {ok: false, reason: string}>}
 */
export async function speak(text, env, { voiceId = TTS.primary, spent = 0 } = {}) {
  const clean = (text ?? '').trim();
  if (!clean) return { ok: false, reason: 'empty' };
  if (!env.AI) return { ok: false, reason: 'no_ai_binding' };

  const voice = TTS.voices[voiceId];
  if (!voice) return { ok: false, reason: `unknown_voice:${voiceId}` };

  const neurons = estimateNeurons(clean, voiceId);
  if (spent + neurons > LIMITS.ttsNeuronBudget) {
    // Refuse rather than overrun. The client speaks it with the browser voice instead —
    // worse-sounding, but free and unlimited, and far better than silence.
    return { ok: false, reason: 'neuron_budget_exhausted' };
  }

  const input = voice.neuronsPer1kChars
    ? { text: clean, speaker: voice.speaker }
    : { prompt: clean, lang: voice.lang };

  try {
    const res = await env.AI.run(voice.model, input);
    // The binding returns either a ReadableStream or a buffer depending on the model.
    const audio = res instanceof ReadableStream ? await new Response(res).arrayBuffer()
      : res instanceof ArrayBuffer ? res
        : res?.audio ? Uint8Array.from(atob(res.audio), (c) => c.charCodeAt(0)).buffer
          : await new Response(res).arrayBuffer();

    if (!audio || audio.byteLength === 0) return { ok: false, reason: 'empty_audio' };
    return { ok: true, audio, neurons, voice: voiceId };
  } catch (err) {
    console.error(JSON.stringify({
      ts: Date.now(), level: 'error', event: 'tts_failed',
      voice: voiceId, message: String(err?.message ?? err),
    }));
    return { ok: false, reason: 'tts_error' };
  }
}
