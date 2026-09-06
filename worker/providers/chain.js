/**
 * The provider chain: ordered fallback with a KV-backed circuit breaker.
 *
 * Generalises the Gemini→Groq pattern from CortexMCP. Two changes worth knowing:
 *
 *  - Three tiers across two vendors. Two free tiers that 429 for the same reason at the
 *    same time are one tier with extra steps.
 *  - A breaker in KV, so a provider that is rate-limited is SKIPPED for 60 seconds
 *    rather than probed on every request. The breaker is per-provider and time-windowed
 *    specifically because opening it costs a KV write, and KV allows 1,000 writes/day.
 *
 * Provider failure here is expected, not exceptional. It is handled in the chain, never
 * in a catch block that logs and dies.
 */

import { PROVIDERS, BREAKER } from '../constants.js';
import * as gemini from './gemini.js';
import * as groq from './groq.js';
import * as workersAi from './workers-ai.js';

const ADAPTERS = { gemini, groq, 'workers-ai': workersAi };

async function breakerOpen(env, id) {
  if (!env.TOKENS) return false;
  const raw = await env.TOKENS.get(`${BREAKER.kvPrefix}${id}`);
  if (!raw) return false;
  try {
    const { opened_at } = JSON.parse(raw);
    return Date.now() - opened_at < BREAKER.openSeconds * 1000;
  } catch {
    return false;
  }
}

async function recordFailure(env, id) {
  if (!env.TOKENS) return;
  const key = `${BREAKER.kvPrefix}${id}`;
  let state = { failures: 0, opened_at: 0 };
  try {
    state = JSON.parse((await env.TOKENS.get(key)) ?? 'null') ?? state;
  } catch { /* start fresh */ }

  state.failures = (state.failures ?? 0) + 1;
  if (state.failures >= BREAKER.failureThreshold) {
    state.opened_at = Date.now();
    state.failures = 0;
    // One write per breaker trip, not per failure. See the KV write budget above.
    await env.TOKENS.put(key, JSON.stringify(state), { expirationTtl: BREAKER.openSeconds * 2 });
  }
}

async function clearBreaker(env, id) {
  if (!env.TOKENS) return;
  // Only write when there is something to clear — avoids a KV write on every success.
  const raw = await env.TOKENS.get(`${BREAKER.kvPrefix}${id}`);
  if (raw) await env.TOKENS.delete(`${BREAKER.kvPrefix}${id}`);
}

/**
 * Streams an answer, walking the chain until one provider produces tokens.
 *
 * @param {{system: string, user: string, history: Array}} prompt
 * @param {object} env  Worker env (secrets + bindings)
 * @param {{skip?: string[], signal?: AbortSignal}} [opts]
 * @yields {{type: 'delta'|'end'|'meta', text?: string, provider?: string, model?: string}}
 */
export async function* streamAnswer(prompt, env, opts = {}) {
  const skip = new Set(opts.skip ?? []);
  const attempts = [];

  for (const provider of PROVIDERS) {
    if (skip.has(provider.id)) continue;

    const apiKey = provider.keyBinding ? env[provider.keyBinding] : null;
    if (provider.keyBinding && !apiKey) {
      attempts.push({ provider: provider.id, error: 'no key configured' });
      continue;
    }
    if (await breakerOpen(env, provider.id)) {
      attempts.push({ provider: provider.id, error: 'breaker open' });
      continue;
    }

    const adapter = ADAPTERS[provider.id];

    for (const model of provider.models) {
      try {
        const iter = adapter.stream(prompt, {
          model,
          apiKey,
          endpoint: provider.endpoint,
          ai: env.AI,
          signal: opts.signal,
        });

        // Pull the first chunk before declaring success — an HTTP 200 that immediately
        // errors mid-stream must still fall through to the next provider.
        const first = await iter.next();
        if (first.done) throw Object.assign(new Error('empty stream'), { retryable: true });

        yield { type: 'meta', provider: provider.id, model };
        await clearBreaker(env, provider.id);

        if (first.value.type === 'delta') yield first.value;
        for await (const chunk of iter) yield chunk;
        return;
      } catch (err) {
        attempts.push({ provider: provider.id, model, error: String(err.message ?? err) });
        // A missing/deprecated model is a config problem, not a provider outage — try the
        // next model on the same provider without penalising it in the breaker.
        if (err.modelMissing) continue;
        await recordFailure(env, provider.id);
        break;
      }
    }
  }

  const err = new Error('all providers unavailable');
  err.attempts = attempts;
  throw err;
}

/** Breaker state for /api/health. */
export async function providerHealth(env) {
  const out = [];
  for (const p of PROVIDERS) {
    const configured = !p.keyBinding || Boolean(env[p.keyBinding]) || (p.id === 'workers-ai' && Boolean(env.AI));
    out.push({
      id: p.id,
      label: p.label,
      configured,
      models: p.models,
      breaker: (await breakerOpen(env, p.id)) ? 'open' : 'closed',
    });
  }
  return out;
}
