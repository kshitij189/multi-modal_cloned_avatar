# AI Kshitij

A personalised agent that greets a named recruiter, walks them through my work, and
answers grounded questions about it.

**Runs at ₹0/month.** No paid API, no subscription, no payment method on file anywhere.
That constraint drove the architecture rather than being worked around after the fact.

---

## The three decisions worth reading about

**No vector database. No embeddings.** The corpus — resume, three project write-ups,
skills, FAQ — is **~2,600 tokens**. It goes into the prompt whole, on every call. A
retrieval layer over 100 chunks would hide 95 of them from the model and add three
failure modes to solve a context-window problem that does not exist. The free tiers cap
requests per day, not tokens per day, so full recall is also free. Written up in
[docs/why-no-vector-db.md](docs/why-no-vector-db.md); the trigger to revisit is the corpus
passing 15,000 tokens, and the build measures it on every run.

**No Celery, no Redis, no Postgres, no Docker Compose.** Every previous project I shipped
used all four. None of them runs on a zero-cost always-on tier — persistent workers, a
persistent broker and a persistent database are precisely what free hosting withholds. So
the heavy work moved offline and the runtime collapsed to one stateless edge function.
The key fact that makes it work: **Cloudflare Workers meter CPU time (10ms on the free
plan), not wall time**, so a six-second streamed LLM response costs about 3ms of budget.
No queue needed. Reasoning in [PRD.md §7](PRD.md).

**The text path is a primary path, not a fallback.** Most recruiters open a link like this
on a phone in an open-plan office and will never enable audio. So the transcript is always
complete, `Start` and `Just show me the text` are the same size and sit side by side, and
muting the phone loses nothing.

## Architecture

```
Browser ──▶ Cloudflare Pages (static, unlimited bandwidth)
        └─▶ Cloudflare Worker /api/*   (100k req/day, 10ms CPU)
              ├── Workers KV   token payloads, circuit-breaker state
              ├── Cloudflare D1  event log, quota counters, rate limits
              └── Gemini ──429──▶ Groq ──▶ Workers AI ──▶ static refusal

Offline (Colab T4, free): voice + video rendered once, committed, served from CDN.
```

Full component decisions with rejected alternatives: [PRD.md §8](PRD.md).

## Truthfulness

The agent speaks as a real person to people deciding whether to employ him, so a
fabricated credential is a reputation failure rather than a bug. Four layers:

1. **Structural** — the whole corpus is in context, so the model is never asked to recall.
2. **Behavioural** — system-prompt rules with a hard deferral path.
3. **Mechanical** — a post-generation verifier that rejects claims about technologies
   outside the skills allowlist, invented quantities of experience, unauthorised
   commitments, and any answer whose citations do not resolve to real corpus nodes.
   **Fails closed** — a refusal is always safe, a hallucination is not.
4. **Regression** — 30 golden cases and 22 adversarial cases (prompt injection, invented
   experience, derailment, reputation attacks). **Any adversarial failure blocks a
   release, absolutely.**

## Privacy

A token holds a first name, company, role and any JD notes I typed, for 90 days. Visit
data is a token id, an ephemeral session id, a timestamp, a country code and
`mobile`/`desktop`. **No IP address, no raw user-agent, no cookies beyond a session id
used for rate limiting — and deliberately no record of the questions recruiters ask.**
Someone typing into a candidate's demo has not meaningfully consented to being logged.

## Run it locally

```bash
npm install
cp .dev.vars.example .dev.vars     # add free keys: aistudio.google.com/apikey, console.groq.com/keys
npm run dev:all                    # web :5173, worker :8787
```

Works with no keys at all — pre-approved FAQ answers still resolve, and every provider
failure degrades to something readable.

## First deploy

Needs a free Cloudflare account. No card.

```bash
npx wrangler login
npx wrangler kv namespace create TOKENS           # paste id into wrangler.toml
npx wrangler kv namespace create TOKENS --preview # paste preview_id
npx wrangler d1 create kshitij-agent-db           # paste database_id
npx wrangler d1 execute kshitij-agent-db --remote --file=./scripts/schema.sql
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put GROQ_API_KEY
npm run deploy
```

Then set the Worker route to **fail open** in the dashboard, so hitting the 100k/day
request limit serves the static site instead of a Cloudflare error page.

## Commands

```bash
npm run dev:all        # web + worker
npm test               # unit tests
npm run evals:offline  # mechanical grounding assertions — no network, no quota
npm run evals          # full suite against real providers
npm run lint
npm run build          # rebuild corpus, bundle, enforce payload budget
npm run check:quotas   # free-tier headroom + model-ID liveness
node scripts/mint-token.js --name Neha --company Northbound --role "Platform Engineer"
```

## Status

v0 in progress. Code complete and green locally — 40 unit tests, 43 offline eval checks,
**9.9 KB gzipped initial payload against a 120 KB budget**. Outstanding: Cloudflare
account setup and recording the video. Task-level detail in
[IMPLEMENTATION_PROGRESS.md](IMPLEMENTATION_PROGRESS.md).

The microphone, speech-to-text and cloned-voice greeting are **v1**, deliberately — they
are the three components with the most unknowns, and v0 has to ship first.

---

Kshitij Tripathi — kttripathi317@gmail.com
