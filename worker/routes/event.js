/**
 * POST /api/event — fire-and-forget instrumentation.
 *
 * Returns 204 immediately; the D1 write is waitUntil-ed. Nothing a recruiter does should
 * ever wait on analytics.
 */

import { logEvent } from '../store/d1.js';

const ALLOWED = new Set([
  'start', 'text_mode', 'mic_grant', 'mic_deny', 'repo_click', 'q_asked', 'exit',
  'video_error', 'caption_toggle',
]);

export async function handleEvent(request, env, ctx) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 204 });
  }

  // Unknown event types are ignored rather than errored — the client and the Worker must
  // stay independently deployable.
  if (ALLOWED.has(body?.type)) {
    ctx.waitUntil(logEvent(env, {
      tokenId: typeof body.token === 'string' ? body.token.slice(0, 32) : null,
      sid: typeof body.sid === 'string' ? body.sid.slice(0, 64) : null,
      type: body.type,
    }));
  }

  return new Response(null, { status: 204 });
}
