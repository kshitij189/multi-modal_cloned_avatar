/**
 * Session bootstrap and instrumentation.
 *
 * The token comes from the path (/hi/<token>). Everything about the visitor that the
 * page knows comes from /api/session — the client holds no facts of its own.
 */

const API = '/api';

export function tokenFromPath() {
  const m = /^\/hi\/([A-Za-z0-9_-]{6,32})\/?$/.exec(window.location.pathname);
  return m ? m[1] : null;
}

/** Ephemeral, per-tab, never persisted. Used only for rate limiting. */
export function sessionId() {
  let sid = sessionStorage.getItem('sid');
  if (!sid) {
    sid = crypto.randomUUID();
    try {
      sessionStorage.setItem('sid', sid);
    } catch {
      /* private mode; a per-load id is fine */
    }
  }
  return sid;
}

/**
 * Never throws. A failed session fetch degrades to the generic experience rather than a
 * blank page — the static content is still worth the recruiter's time.
 */
export async function fetchSession(token, sid) {
  const qs = new URLSearchParams();
  if (token) qs.set('token', token);
  if (sid) qs.set('sid', sid);
  try {
    const res = await fetch(`${API}/session?${qs}`, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(String(res.status));
    return await res.json();
  } catch {
    return {
      personalised: false,
      recruiter: null,
      opening_line: "Hi — I'm Kshitij, and this is an AI version of me built to walk you through my work.",
      suggested_questions: ['How is this thing built?', 'What have you actually shipped?', 'What are you looking for?'],
      person: { name: 'Kshitij Tripathi', email: 'kttripathi317@gmail.com', links: {} },
      features: { mic: false, tts: false, video: true, llm: false },
      degraded: true,
      offline: true,
    };
  }
}

/** Fire-and-forget. Uses sendBeacon so an exit event survives the page unloading. */
export function track(type, token, sid) {
  const body = JSON.stringify({ type, token, sid });
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(`${API}/event`, new Blob([body], { type: 'application/json' }));
      return;
    }
    fetch(`${API}/event`, { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: true });
  } catch {
    /* instrumentation must never affect the experience */
  }
}
