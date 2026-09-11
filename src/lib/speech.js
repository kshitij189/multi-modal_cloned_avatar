/**
 * Speech playback.
 *
 * Fetches audio for each chunk, plays them back to back, and exposes an AnalyserNode so
 * the avatar's mouth can be driven by the waveform actually coming out of the speaker.
 *
 * Two constraints shape all of this:
 *
 *  1. **Audio needs a user gesture.** Browsers refuse to start an AudioContext without
 *     one, and iOS Safari only honours the gesture INSIDE the handler — any await before
 *     resuming the context loses it. So `unlock()` is called synchronously on the click
 *     and everything async happens afterwards.
 *  2. **Chunk N+1 is fetched while chunk N plays.** Synthesising the whole monologue
 *     before saying a word would mean ten seconds of silence. Prefetching one ahead gets
 *     the avatar talking in about a second and keeps the gap between chunks inaudible.
 */

import { API } from './api-base.js';

/**
 * Splits text on sentence boundaries for chunked playback.
 *
 * Mirrors splitForSpeech in worker/providers/tts.js. Duplicated rather than shared
 * because the Worker and the browser are separate bundles with no common module, and a
 * twelve-line function is a better trade than a shared-code build step. Keep them in
 * step: a mismatch shows up as captions drifting out of sync with the audio.
 */
export function splitForSpeech(text, maxChars = 700) {
  const sentences = String(text ?? '').replace(/\s+/g, ' ').trim()
    .split(/(?<=[.!?])\s+/).filter(Boolean);
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

export class SpeechQueue {
  constructor({ onChunkStart, onEnd, onCaption } = {}) {
    this.onChunkStart = onChunkStart ?? (() => {});
    this.onEnd = onEnd ?? (() => {});
    this.onCaption = onCaption ?? (() => {});
    this.ctx = null;
    this.analyser = null;
    this.stopped = false;
    this.usingBrowserVoice = false;
  }

  /** MUST be called synchronously inside a click handler. No awaits before this. */
  unlock() {
    if (this.ctx) return this.analyser;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    this.ctx = new AC();
    // Older Safari starts suspended; resume() inside the gesture is what unlocks it.
    this.ctx.resume?.();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.6;
    this.analyser.connect(this.ctx.destination);
    return this.analyser;
  }

  stop() {
    this.stopped = true;
    try { this.source?.stop(); } catch { /* already stopped */ }
    window.speechSynthesis?.cancel();
  }

  /**
   * Speaks an array of text chunks in order.
   * @param {string[]} chunks
   * @param {{token: string|null, sid: string, serverTts: boolean}} opts
   */
  async speak(chunks, opts) {
    this.stopped = false;
    let prefetch = opts.serverTts ? this.#fetchAudio(chunks[0], opts) : null;

    for (let i = 0; i < chunks.length; i++) {
      if (this.stopped) break;

      this.onChunkStart(i, chunks[i]);
      this.onCaption(chunks[i]);

      const current = prefetch;
      // Start the next fetch BEFORE awaiting this one, so synthesis overlaps playback.
      prefetch = opts.serverTts && i + 1 < chunks.length
        ? this.#fetchAudio(chunks[i + 1], opts)
        : null;

      const buf = current ? await current : null;

      if (buf) {
        await this.#playBuffer(buf);
      } else {
        // Server speech unavailable — the browser's own voice carries it. Less good,
        // free, unlimited, and far better than the avatar going silent mid-sentence.
        this.usingBrowserVoice = true;
        await this.#playBrowser(chunks[i]);
      }
    }

    this.onEnd();
  }

  async #fetchAudio(text, opts) {
    try {
      const res = await fetch(`${API}/speak`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, token: opts.token, sid: opts.sid }),
      });
      if (!res.ok) return null; // 429 = budget gone, 403 = refused. Both fall back.
      const bytes = await res.arrayBuffer();
      return await this.ctx.decodeAudioData(bytes);
    } catch {
      return null;
    }
  }

  #playBuffer(audioBuffer) {
    return new Promise((resolve) => {
      if (this.stopped) return resolve();
      const src = this.ctx.createBufferSource();
      src.buffer = audioBuffer;
      src.connect(this.analyser);
      src.onended = resolve;
      this.source = src;
      src.start();
    });
  }

  #playBrowser(text) {
    return new Promise((resolve) => {
      const synth = window.speechSynthesis;
      if (!synth) return resolve();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.02;
      u.pitch = 1.0;
      // Prefer a local high-quality English voice where one exists. Modern OS voices are
      // neural and markedly better than the old robotic defaults.
      const voice = synth.getVoices().find((v) => /en-(GB|US|IN)/.test(v.lang) && v.localService)
        ?? synth.getVoices().find((v) => v.lang?.startsWith('en'));
      if (voice) u.voice = voice;
      u.onend = resolve;
      u.onerror = resolve;
      synth.speak(u);
    });
  }
}

/**
 * Requests the generated walkthrough. Returns its text and speakable chunks.
 * Never throws — a failure here must still leave something to show and say.
 */
export async function fetchWalkthrough(token, sid) {
  try {
    const res = await fetch(`${API}/walkthrough`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, sid }),
    });
    const text = await res.text();
    for (const frame of text.split('\n\n')) {
      const line = frame.split('\n').find((l) => l.startsWith('data:'));
      if (!line) continue;
      const evt = JSON.parse(line.slice(5).trim());
      if (evt.type === 'script') return evt;
    }
  } catch { /* fall through */ }
  return null;
}
