/**
 * Free-tier status report.
 *
 * Verifies that the project's headline claim — ₹0/month — is still true, and warns
 * before a ceiling is hit rather than after.
 *
 * Usage:
 *   node scripts/check-quotas.js            report
 *   node scripts/check-quotas.js --models   verify every model ID is still live
 *   node scripts/check-quotas.js --billing  print the manual billing checklist
 */

import { PROVIDERS, LIMITS } from '../worker/constants.js';

const flag = (f) => process.argv.includes(f);

/** Limits verified 2026-09-06 against primary documentation. Re-verify quarterly. */
const CEILINGS = [
  ['Workers requests', '100,000/day', 'developers.cloudflare.com/workers/platform/limits/'],
  ['Workers KV reads', '100,000/day', 'developers.cloudflare.com/kv/platform/limits/'],
  ['Workers KV writes', '1,000/day', 'developers.cloudflare.com/kv/platform/limits/'],
  ['D1 rows read', '5,000,000/day', 'developers.cloudflare.com/d1/platform/pricing/'],
  ['D1 rows written', '100,000/day', 'developers.cloudflare.com/d1/platform/pricing/'],
  ['Pages builds', '500/month', 'developers.cloudflare.com/pages/platform/limits/'],
  ['Workers AI', '10,000 neurons/day', 'developers.cloudflare.com/workers-ai/platform/pricing/'],
  ['Gemini', 'UNVERIFIED — docs no longer publish per-model numbers', 'aistudio.google.com/rate-limit'],
  ['Groq chat', '~14,400/day, 30 RPM (org-wide)', 'console.groq.com/settings/limits'],
  ['Groq Whisper', '~2,000 req/day, 28,800 audio-sec/day', 'console.groq.com/settings/limits'],
];

async function checkModels() {
  console.log('\nMODEL IDS (verified against each provider\'s models endpoint)\n');

  // Groq exposes an OpenAI-compatible /models endpoint.
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { authorization: `Bearer ${groqKey}` },
      });
      const live = new Set(((await res.json()).data ?? []).map((m) => m.id));
      for (const m of PROVIDERS.find((p) => p.id === 'groq').models) {
        console.log(`  ${live.has(m) ? '✓ live  ' : '✗ MISSING'} ${m}`);
      }
    } catch (e) {
      console.log(`  ?  groq check failed: ${e.message}`);
    }
  } else {
    console.log('  -  GROQ_API_KEY not set, skipping');
  }

  const gemKey = process.env.GEMINI_API_KEY;
  if (gemKey) {
    try {
      const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
        headers: { 'x-goog-api-key': gemKey },
      });
      const live = new Set(((await res.json()).models ?? []).map((m) => m.name.replace('models/', '')));
      for (const m of PROVIDERS.find((p) => p.id === 'gemini').models) {
        console.log(`  ${live.has(m) ? '✓ live  ' : '✗ MISSING'} ${m}`);
      }
    } catch (e) {
      console.log(`  ?  gemini check failed: ${e.message}`);
    }
  } else {
    console.log('  -  GEMINI_API_KEY not set, skipping');
  }

  console.log(
    '\n  Groq deprecated llama-3.3-70b-versatile and llama-3.1-8b-instant on 2026-06-17.\n' +
    '  A stale model ID produces a 400 that looks like an outage. This check exists\n' +
    '  because that already happened once.\n'
  );
}

function report() {
  console.log(`\nFREE-TIER CEILINGS — ${new Date().toISOString().slice(0, 10)}`);
  console.log('(limits verified 2026-09-06; re-verify quarterly — free tiers change)\n');
  for (const [name, limit, source] of CEILINGS) {
    console.log(`  ${name.padEnd(20)} ${limit.padEnd(48)} ${source}`);
  }

  console.log('\nDAILY BUDGETS (this project\'s own guard, tighter than the ceilings)\n');
  for (const [p, b] of Object.entries(LIMITS.dailyBudget)) {
    console.log(`  ${p.padEnd(20)} ${String(b).padEnd(10)} demote at ${LIMITS.demoteAt * 100}%, FAQ-only at ${LIMITS.faqOnlyAt * 100}%`);
  }

  console.log(`
LIVE USAGE
  Live counters come from D1 and are only meaningful once deployed:
    npx wrangler d1 execute kshitij-agent-db --remote \\
      --command "SELECT day, provider, calls FROM quota_day ORDER BY day DESC LIMIT 20"
  Or just open /api/health, which reports the same numbers with headroom.

INTERPRETATION
  > 70% headroom   normal
  50-70%           note it in IMPLEMENTATION_PROGRESS.md
  30-50%           move that component to its fallback NOW, before it fails on a recruiter
  < 30%            enable degraded mode; check whether it is real traffic or abuse

  KV writes over 50% used is a BUG, not a quota event — the write path is link-minting
  (~20/day). Hundreds means something writes to KV on a request path.

  Workers AI over 20% used means Gemini and Groq are both failing. It is the third tier
  and should normally sit at zero.
`);
}

function billing() {
  console.log(`
BILLING CHECK — the guarantee that actually matters

Rate limits protect against a slow drift into cost. The ABSENCE OF A CARD makes
overspend structurally impossible. Confirm no payment method is on file:

  [ ] Cloudflare      dash.cloudflare.com  → Manage Account → Billing → Payment info
  [ ] Google AI Studio aistudio.google.com → Settings → Plan (must read "Free tier")
  [ ] Groq            console.groq.com     → Settings → Billing
  [ ] Domain registrar (the ONLY intentional cost, if a custom domain is in use)

If a billing email ever arrives from any provider, that is a P0 incident. Stop, find
the source, remove it. A single charge invalidates the project's central claim, and the
central claim is the portfolio value.
`);
}

if (flag('--billing')) billing();
else if (flag('--models')) await checkModels();
else {
  report();
  billing();
}
