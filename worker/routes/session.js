/**
 * GET /api/session?token=<id>
 *
 * ALWAYS returns 200. An unknown or expired token gets the generic payload, never an
 * error page — a forwarded link that 404s is worse than one that is impersonal, and
 * forwarding is a success signal, not an abuse case.
 */

import { getToken, getKillSwitch } from '../store/kv.js';
import { logVisit } from '../store/d1.js';
import { getQuotas } from '../store/d1.js';
import { CONTENT_VERSION, GENERATED_AT, PROJECTS, PERSON } from '../grounding/corpus.generated.js';
import { LIMITS } from '../constants.js';

const GENERIC_QUESTIONS = [
  'How is this thing built?',
  'What have you actually shipped?',
  'What are you looking for?',
];

function suggestedFor(leadProjectId) {
  const lead = PROJECTS.find((p) => p.id === leadProjectId);
  if (!lead) return GENERIC_QUESTIONS;
  return [`Walk me through ${lead.name}`, 'How is this thing built?', 'What have you actually shipped?'];
}

function snapshotAgeDays() {
  const t = Date.parse(GENERATED_AT);
  return Number.isFinite(t) ? Math.floor((Date.now() - t) / 86400000) : null;
}

export async function handleSession(request, env, ctx) {
  const url = new URL(request.url);
  const tokenId = url.searchParams.get('token');
  const sid = url.searchParams.get('sid');

  const [payload, kill, quotas] = await Promise.all([
    getToken(env, tokenId),
    getKillSwitch(env),
    getQuotas(env),
  ]);

  // Analytics never blocks the response.
  ctx.waitUntil(
    logVisit(env, {
      tokenId: payload ? tokenId : null,
      sid,
      country: request.headers.get('CF-IPCountry'),
      uaClass: /mobile|android|iphone/i.test(request.headers.get('user-agent') ?? '') ? 'mobile' : 'desktop',
    })
  );

  // Server-driven kill switches. Better to never render a mic button than to render one
  // that fails when the recruiter taps it.
  const totalCalls = Object.values(quotas).reduce((a, b) => a + b, 0);
  const budget = Object.values(LIMITS.dailyBudget).reduce((a, b) => a + b, 0);
  const llmAvailable = kill.mode !== 'static_only' && totalCalls < budget * LIMITS.faqOnlyAt;

  const personalised = Boolean(payload);

  const body = {
    personalised,
    recruiter: personalised
      ? { name: payload.name, company: payload.company, role: payload.role }
      : null,
    opening_line: personalised
      ? payload.opening_line
      : `Hi — I'm ${PERSON.name}, and this is an AI version of me built to walk you through my work.`,
    opening_audio: personalised ? (payload.opening_audio_b64 ?? null) : null,
    lead_project: personalised ? (payload.lead_project ?? null) : null,
    suggested_questions: suggestedFor(personalised ? payload.lead_project : null),
    content_version: CONTENT_VERSION,
    snapshot_age_days: snapshotAgeDays(),
    person: { name: PERSON.name, email: PERSON.email, links: PERSON.links },
    features: {
      // v0: no microphone, no cloned-voice TTS. Both are v1 (PRD §5).
      mic: false,
      tts: false,
      video: true,
      llm: llmAvailable,
    },
    degraded: !llmAvailable,
  };

  return Response.json(body, {
    headers: { 'cache-control': 'no-store' },
  });
}
