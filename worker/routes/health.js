/**
 * GET /api/health — public on purpose.
 *
 * There is nothing sensitive here, and an engineering director poking /api/health and
 * finding a real answer is a cheap, high-value win (PRD Q11).
 */

import { providerHealth } from '../providers/chain.js';
import { getQuotas } from '../store/d1.js';
import { getKillSwitch } from '../store/kv.js';
import { CONTENT_VERSION, GENERATED_AT, APPROX_TOKENS, NODE_IDS } from '../grounding/corpus.generated.js';
import { LIMITS } from '../constants.js';

export async function handleHealth(request, env) {
  const [providers, quotas, kill] = await Promise.all([
    providerHealth(env),
    getQuotas(env),
    getKillSwitch(env),
  ]);

  const ageDays = Math.floor((Date.now() - Date.parse(GENERATED_AT)) / 86400000);

  return Response.json({
    status: kill.mode === 'static_only' ? 'degraded' : 'ok',
    mode: kill.mode ?? 'normal',
    build: env.BUILD_SHA ?? 'dev',
    content: {
      version: CONTENT_VERSION,
      generated_at: GENERATED_AT,
      age_days: Number.isFinite(ageDays) ? ageDays : null,
      approx_tokens: APPROX_TOKENS,
      node_count: NODE_IDS.size,
      // Stated plainly because it is the most interesting architectural fact about this
      // service, and someone reading /api/health is exactly the audience for it.
      retrieval: 'none — full corpus in prompt (see docs/why-no-vector-db.md)',
    },
    providers,
    quota_today: Object.entries(LIMITS.dailyBudget).map(([id, budget]) => ({
      provider: id,
      used: quotas[id] ?? 0,
      budget,
      headroom_pct: Math.max(0, Math.round((1 - (quotas[id] ?? 0) / budget) * 100)),
    })),
    bindings: { kv: Boolean(env.TOKENS), d1: Boolean(env.DB), workers_ai: Boolean(env.AI) },
  }, { headers: { 'cache-control': 'no-store' } });
}
