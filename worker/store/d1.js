/**
 * D1 access — event log, quota counters, rate limits.
 *
 * Two standing rules:
 *  1. Never block a user request on an analytics write. Everything non-essential goes
 *     through ctx.waitUntil(). Losing an event row is fine; adding 40ms to an answer is not.
 *  2. NEVER store the recruiter's question text (PRD §12.3). Only a coarse category.
 *     Someone typing into a candidate's demo has not consented to being logged.
 */

const today = () => new Date().toISOString().slice(0, 10);

/** Fire-and-forget. Swallows errors on purpose — analytics must never break a request. */
export async function logVisit(env, { tokenId, sid, country, uaClass }) {
  if (!env.DB) return;
  try {
    await env.DB.prepare(
      'INSERT INTO visit (token_id, sid, ts, country, ua_class) VALUES (?, ?, ?, ?, ?)'
    ).bind(tokenId ?? null, sid ?? null, Date.now(), country ?? null, uaClass ?? null).run();
  } catch { /* analytics is not load-bearing */ }
}

export async function logEvent(env, { tokenId, sid, type }) {
  if (!env.DB) return;
  try {
    await env.DB.prepare('INSERT INTO event (token_id, sid, ts, type) VALUES (?, ?, ?, ?)')
      .bind(tokenId ?? null, sid ?? null, Date.now(), String(type).slice(0, 32)).run();
  } catch { /* analytics is not load-bearing */ }
}

export async function logAsk(env, { tokenId, sid, provider, latencyMs, refused, citedNodes, qClass }) {
  if (!env.DB) return;
  try {
    await env.DB.prepare(
      'INSERT INTO ask (token_id, sid, ts, provider, latency_ms, refused, cited_nodes, q_class) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      tokenId ?? null, sid ?? null, Date.now(), provider ?? null,
      latencyMs ?? null, refused ? 1 : 0, JSON.stringify(citedNodes ?? []), qClass ?? 'other'
    ).run();
  } catch { /* analytics is not load-bearing */ }
}

/** Increments and returns today's call count for a provider. On the request path — must be cheap. */
export async function bumpQuota(env, provider) {
  if (!env.DB) return 0;
  try {
    await env.DB.prepare(
      'INSERT INTO quota_day (day, provider, calls) VALUES (?, ?, 1) ' +
      'ON CONFLICT(day, provider) DO UPDATE SET calls = calls + 1'
    ).bind(today(), provider).run();
    const row = await env.DB.prepare('SELECT calls FROM quota_day WHERE day = ? AND provider = ?')
      .bind(today(), provider).first();
    return row?.calls ?? 0;
  } catch {
    return 0;
  }
}

export async function getQuotas(env) {
  if (!env.DB) return {};
  try {
    const { results } = await env.DB.prepare('SELECT provider, calls FROM quota_day WHERE day = ?')
      .bind(today()).all();
    return Object.fromEntries((results ?? []).map((r) => [r.provider, r.calls]));
  } catch {
    return {};
  }
}

/**
 * Rate limit check. Counts today's asks for a token and a session.
 * Returns {allowed, reason}.
 */
export async function checkRateLimit(env, { tokenId, sid, limits }) {
  if (!env.DB) return { allowed: true };
  try {
    const since = Date.now() - 24 * 60 * 60 * 1000;

    if (tokenId) {
      const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM ask WHERE token_id = ? AND ts > ?')
        .bind(tokenId, since).first();
      if ((row?.n ?? 0) >= limits.perTokenCallsPerDay) {
        return { allowed: false, reason: 'token_daily_limit' };
      }
    }

    if (sid) {
      const row = await env.DB.prepare(
        'SELECT COUNT(*) AS n, MAX(ts) AS last FROM ask WHERE sid = ? AND ts > ?'
      ).bind(sid, since).first();
      if ((row?.n ?? 0) >= limits.perSessionCalls) {
        return { allowed: false, reason: 'session_limit' };
      }
      if (row?.last && Date.now() - row.last < limits.minMsBetweenCalls) {
        return { allowed: false, reason: 'too_fast' };
      }
    }

    return { allowed: true };
  } catch {
    // Fail OPEN on infrastructure, fail CLOSED on grounding. A D1 hiccup must not stop a
    // recruiter asking a question; the per-provider daily budget is the real backstop.
    return { allowed: true };
  }
}
