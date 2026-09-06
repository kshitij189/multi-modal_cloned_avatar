/**
 * Workers KV access — token payloads and kill-switch state.
 *
 * KV allows 1,000 WRITES PER DAY. Nothing on a request path may write here. Counters and
 * the event log live in D1 (100,000 writes/day). Getting this backwards silently breaks
 * link-minting after a busy day, which is the worst time for it to break.
 *
 * KV reads are eventually consistent (up to ~60s globally). Fine for token payloads,
 * never used for read-after-write.
 */

export async function getToken(env, id) {
  if (!env.TOKENS || !id) return null;
  if (!/^[A-Za-z0-9_-]{6,32}$/.test(id)) return null; // reject before spending a read
  try {
    const raw = await env.TOKENS.get(`tok:${id}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function getKillSwitch(env) {
  if (!env.TOKENS) return { mode: 'normal' };
  try {
    const raw = await env.TOKENS.get('kill:global');
    return raw ? JSON.parse(raw) : { mode: 'normal' };
  } catch {
    return { mode: 'normal' };
  }
}
