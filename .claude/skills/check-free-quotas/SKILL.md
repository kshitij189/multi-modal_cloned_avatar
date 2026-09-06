---
name: check-free-quotas
description: Report current usage against every free-tier ceiling the project depends on, verify that provider model IDs are still live, and name the service nearest its limit. Use weekly, before a big outreach batch, when a 429 appears in the logs, or when anything suggests a provider changed its terms. Triggers on "check quotas", "how much quota is left", "are we near a limit", "am I going to get charged".
allowed-tools: Bash(node scripts/*), Bash(npx wrangler *), Bash(npm run *), Read, Edit, WebFetch
---

# Check free quotas

The project's headline claim is **₹0/month**. This procedure verifies that claim is still
true and warns before a ceiling is hit rather than after.

**Honest framing:** this is a ~60-line script with a report format. It is a skill because
the *interpretation* — which number means "act now" versus "note it" — is the part worth
writing down, and because it must still be runnable in six months.

## Run

```bash
npm run check:quotas
```

`scripts/check-quotas.js` gathers, in one pass:

1. **D1 counters** — `SELECT day, provider, calls FROM quota_day WHERE day >= date('now','-7 days')`. This is the project's own measurement of what it actually used, and it is more trustworthy than any published limit.
2. **Cloudflare usage** — Workers requests, KV reads/writes, D1 rows, Pages builds, via `npx wrangler` and the Cloudflare API with a read-only token.
3. **Provider model IDs** — hits each provider's models endpoint and checks every ID in `worker/constants.js` is still listed.
4. **Breaker state** — reads `cb:*` from KV. A breaker that has been open for hours is a quota problem wearing a different hat.

## Report

```
FREE-TIER STATUS — 2026-09-13

SERVICE                LIMIT            USED (24h)   HEADROOM   STATUS
Workers requests       100,000/day             412      99.6%   ok
Workers KV reads       100,000/day             388      99.6%   ok
Workers KV writes        1,000/day              19      98.1%   ok
D1 rows written        100,000/day           1,204      98.8%   ok
D1 rows read         5,000,000/day           8,110      99.8%   ok
Pages builds               500/mo               31      93.8%   ok
Workers AI              10,000 neu/day           0     100.0%   ok
Gemini requests     ~1,500/day (UNVERIFIED)     289      80.7%   ⚠ WATCH
Groq chat requests  ~14,400/day (2nd source)     14      99.9%   ok
Groq Whisper             ~2,000/day               0     100.0%   ok

NEAREST CEILING: Gemini — 80.7% headroom, ~4 days at current rate

MODEL IDS
  gemini-3-flash             ✓ live
  openai/gpt-oss-120b        ✓ live
  @cf/meta/llama-3.1-8b      ✓ live

BREAKERS: all closed
BILLING:  no payment method on file for any provider  ✓
```

## Interpreting it

| Headroom | Meaning | Action |
|---|---|---|
| > 70% | Normal | Nothing |
| 50–70% | Watch | Note it in `IMPLEMENTATION_PROGRESS.md`'s quota table |
| 30–50% | Act | Move the affected component to its fallback **now**, before it fails on a recruiter |
| < 30% | Urgent | Enable the degraded mode for that component. Investigate whether it is real traffic or abuse. |

**Special cases that mean something different from the raw number:**

- **KV writes above 50% used is a bug, not a quota event.** The write path is minting
  links — roughly 20/day. A number in the hundreds means something writes to KV on a
  request path, which is an architecture violation (CLAUDE.md, stack rule). Find it and
  move it to D1. Do not raise the limit; there is no limit to raise.
- **Workers AI above 20% used means tiers 1 and 2 are failing.** It is the third
  fallback. It should normally sit at zero. Non-zero usage is a signal about Gemini and
  Groq, not about Workers AI.
- **A breaker open for more than an hour** is a provider that is not coming back. Reorder
  the chain in `worker/constants.js` rather than waiting.
- **Quota consumed without matching `visit` rows in D1** is abuse. Check Turnstile pass
  rates and the per-token counters (PRD §12.5).
- **Any model ID reported missing** — fix it immediately. Groq deprecated
  `llama-3.3-70b-versatile` and `llama-3.1-8b-instant` on 2026-06-17; a stale ID produces
  a 400 that looks like an outage. This check exists because that already happened once.

## Quarterly — re-verify the limits themselves

Numbers in this project's documentation carry a verification date because **free tiers
change and published numbers go stale.** Every quarter, or whenever a number looks wrong,
re-check the primary sources with WebFetch:

| Service | Source |
|---|---|
| Workers | `developers.cloudflare.com/workers/platform/limits/` |
| KV | `developers.cloudflare.com/kv/platform/limits/` |
| D1 | `developers.cloudflare.com/d1/platform/pricing/` |
| Pages | `developers.cloudflare.com/pages/platform/limits/` |
| Gemini | `aistudio.google.com/rate-limit` — **the docs page no longer publishes per-model numbers**, so the dashboard is the only authority |
| Groq | `console.groq.com/settings/limits` and `console.groq.com/docs/deprecations` |
| Workers AI | `developers.cloudflare.com/workers-ai/platform/pricing/` |

When a number changes, update **all three** places it appears — PRD §8.0, the quota-watch
table in `IMPLEMENTATION_PROGRESS.md`, and `scripts/check-quotas.js` — with a new
verification date. A number without a date is not a fact.

## Billing check — the one that actually matters

```bash
node scripts/check-quotas.js --billing
```

Asserts that **no payment method is on file** with Cloudflare, Google AI Studio or Groq.
This is the real guarantee. Rate limits protect against a slow drift into cost; the
absence of a card makes overspend structurally impossible.

**If a billing email ever arrives from any provider, that is a P0 incident.** Stop, find
the source, remove it. A single charge invalidates the project's central claim, and the
central claim is the portfolio value.
