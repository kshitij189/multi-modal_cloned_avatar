/**
 * Worker entry point — the only server code in the project.
 *
 * No queue, no broker, no database connection pool, no long-lived process. Cloudflare
 * meters CPU time (10ms on the free plan), not wall time, so awaiting an upstream LLM
 * stream costs almost nothing against the budget. That single fact is what replaces
 * Celery + Redis + a persistent SSE worker here. See PRD §7.
 */

import { handleSession } from './routes/session.js';
import { handleAsk } from './routes/ask.js';
import { handleEvent } from './routes/event.js';
import { handleHealth } from './routes/health.js';
import { handleWalkthrough } from './routes/walkthrough.js';
import { handleSpeak } from './routes/speak.js';
import { ALLOWED_ORIGINS } from './constants.js';

function corsHeaders(request) {
  const origin = request.headers.get('Origin');
  // Explicit allowlist, never "*". The embed path (v1) depends on this being correct.
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
}

const ROUTES = {
  'GET /api/session': handleSession,
  'POST /api/ask': handleAsk,
  'POST /api/walkthrough': handleWalkthrough,
  'POST /api/speak': handleSpeak,
  'POST /api/event': handleEvent,
  'GET /api/health': handleHealth,
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = corsHeaders(request);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const handler = ROUTES[`${request.method} ${url.pathname}`];
    if (!handler) {
      // Anything not /api/* is served by Pages, not here.
      return new Response('Not found', { status: 404, headers: cors });
    }

    try {
      const res = await handler(request, env, ctx);
      const headers = new Headers(res.headers);
      for (const [k, v] of Object.entries(cors)) headers.set(k, v);
      return new Response(res.body, { status: res.status, headers });
    } catch (err) {
      // The Worker never returns a bare 500. Every error path returns valid JSON
      // carrying fallback_text the client can render.
      console.error(JSON.stringify({
        ts: Date.now(), level: 'error', event: 'unhandled',
        path: url.pathname, message: String(err?.message ?? err),
      }));
      return Response.json(
        {
          error: 'internal',
          fallback_text:
            "Something broke on my side. Kshitij is at kttripathi317@gmail.com — that always works.",
        },
        { status: 500, headers: cors }
      );
    }
  },
};
