# CLAUDE.md — operating instructions

Read this before touching anything. These are working-memory rules, not a summary of
[PRD.md](PRD.md). When this file and the PRD disagree, this file wins for *how to work*
and the PRD wins for *what to build*.

---

## Project

A personalised AI agent that **speaks** about Kshitij Tripathi's work. It appears as an
overlay on his portfolio, greets a named recruiter, talks them through his background for
about ninety seconds, then answers spoken-back questions — all generated live. Static page
on Cloudflare Pages, one Cloudflare Worker for `/api/*`, Workers KV for tokens, D1 for
events. Total recurring cost: **₹0**.

**Nothing the avatar says is scripted.** Every line — the opening walkthrough included —
is generated fresh from the content snapshot on each visit and spoken by a text-to-speech
model. There are no recorded clips and no pre-rendered audio bank. This is a deliberate
product decision (the owner asked for it explicitly) and it drives three constraints:

- **Speech is on the request path**, so its cost is the binding limit on the whole design.
  See `TTS` in `worker/constants.js` for the verified neuron economics and why MeloTTS is
  the voice rather than the better-sounding Deepgram Aura.
- **The avatar's mouth is driven by the audio waveform**, not by a pre-computed lipsync
  track. Photoreal lipsync against live-generated speech needs a GPU at request time,
  which costs money. Amplitude analysis costs nothing and can never drift out of sync.
- **Spoken content is verified exactly as strictly as written content.** A recruiter who
  only *hears* a claim cannot re-read it or check its citation, so the bar is if anything
  higher. The walkthrough goes through the same verifier as every answer.

**Still deferred: the microphone and speech-to-text.** Output is spoken, input is typed.
Do not build mic input early — it is the highest-risk remaining component and nothing
depends on it.

---

## Repo layout

```
/
├── PRD.md                        # spec — read before designing anything
├── CLAUDE.md                     # this file
├── CHANGE_LOG.md                 # update on every user-visible change
├── IMPLEMENTATION_PROGRESS.md    # update on every completed unit of work
├── package.json
├── wrangler.toml                 # Worker config. NEVER put secrets here.
├── vite.config.js                # includes the payload-budget plugin
│
├── src/                          # frontend (vanilla JS + Web Components)
│   ├── main.js                   # entry; boots the state machine
│   ├── embed.js                  # the portfolio overlay. Shadow DOM + iframe.
│   ├── components/               # one file per custom element
│   │   ├── avatar-stage.js       # SVG face; mouth driven by the audio waveform
│   │   ├── transcript-panel.js   # captions + Q&A. Complete without audio.
│   │   ├── ask-box.js            # text input + suggested-question chips
│   │   └── disclosure-badge.js   # never remove, never make dismissible
│   ├── lib/
│   │   ├── session.js            # /api/session fetch + feature flags
│   │   ├── stream.js             # SSE consumption
│   │   └── speech.js             # audio queue, AnalyserNode, browser-voice fallback
│   └── styles/tailwind.css
│
├── worker/                       # Cloudflare Worker — the only server code
│   ├── index.js                  # router
│   ├── routes/                   # session, ask, walkthrough, speak, event, health
│   ├── providers/                # gemini, groq, workers-ai, chain, tts
│   ├── grounding/                # prompt.js, verifier.js, banned.js
│   ├── store/                    # kv.js, d1.js
│   └── constants.js              # ALL model IDs and TTS economics. Nowhere else.
│
├── content/
│   ├── content.snapshot.json     # THE AGENT'S BRAIN. Only the rebuild skill writes it.
│   ├── schema.json               # JSON Schema for the content contract
│   └── corpus.md                 # rendered from the snapshot at build time
│
├── evals/
│   ├── golden.json               # recruiter questions + grounding assertions
│   ├── adversarial.json          # injection, invention, derailment, jailbreak
│   ├── run.js                    # node --test entry
│   └── judge.js                  # LLM-as-judge; MUST use a different provider
│
├── public/media/                 # committed video/audio. Check sizes before adding.
├── scripts/                      # build-time node scripts
├── notebooks/                    # Colab notebooks for offline rendering
├── docs/why-no-vector-db.md      # the restraint argument, written down
└── .claude/                      # skills, agents, commands, hooks
```

**Where things go:** server logic → `worker/`. Anything touching what the agent *says* →
`worker/grounding/`. Anything a recruiter sees → `src/components/`. Anything expensive →
precompute it in `scripts/` or `notebooks/` and commit the output to `public/`.

---

## Commands

Exactly as typed. If a command here is wrong, fix this file in the same commit.

```bash
# Setup (once)
npm install
npx wrangler login
npx wrangler kv namespace create TOKENS
npx wrangler d1 create kshitij-agent-db
npx wrangler d1 execute kshitij-agent-db --local --file=./scripts/schema.sql
# Paste the returned IDs into wrangler.toml. Secrets NEVER go in that file:
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put GROQ_API_KEY

# Dev
npm run dev              # vite dev server, frontend only, :5173
npm run dev:worker       # wrangler dev, worker + local KV/D1, :8787
npm run dev:all          # both, concurrently — the normal one

# Test / eval / lint
npm test                 # node --test test/          unit tests
npm run evals            # node evals/run.js          hits real providers, costs quota
npm run evals:offline    # mechanical assertions only, no network, no quota
npm run lint             # eslint src worker evals scripts
npm run check:budget     # payload budget; the build runs this and fails on breach
npm run check:quotas     # current usage vs each free-tier ceiling

# Build / deploy
npm run build            # vite build → dist/, then check:budget
npm run deploy           # wrangler deploy (worker) + pages deploy dist (static)
npm run deploy:worker    # worker only
```

---

## Non-negotiable rules

### 1. Cost rule

**Never introduce a dependency, service, model or API that requires payment or a stored
payment method. Not "cheap." Not "$5/month." Not "free trial." Not "pay-as-you-go with a
cap." Zero.**

If a task appears to require one, **stop and surface it.** Do not add it and flag it
afterwards; do not add it behind a feature flag; do not add it "just for local dev."
Write what you found, what it would cost, and what the free alternative would cost in
effort, and wait.

Free tiers that require no payment method are fine — but every one needs a row in
PRD §8.0 with a verified limit, a verification date, and a named fallback. **A free
dependency with no fallback is a design that dies.** If you cannot verify a limit against
the provider's own documentation, write `UNVERIFIED — confirm before building` rather
than guessing a number.

A pre-commit hook enforces the mechanical part of this (§Hooks). The hook catches known
paid vendors in dependency and config files. It cannot catch judgment. You still have to
exercise it.

### 2. Truthfulness rule

**Never let generated content assert a fact about Kshitij that is not present in
`content/content.snapshot.json`.**

This is the rule that matters most. The agent speaks as a real person to people deciding
whether to hire him. A fabricated credential is a reputation-damaging failure, not a
cosmetic bug.

Concretely:
- Never hardcode a fact about him in a prompt, a component, a test fixture or a comment.
  Facts come from the snapshot. Always.
- Never add a technology to a prompt, an example or a suggested question unless it is in
  `content.snapshot.json → skills`.
- Never soften the verifier to make a test pass. If the verifier rejects a good answer,
  the answer or the corpus is wrong — not the verifier.
- The verifier **fails closed.** A refusal is always safe. A hallucination is not.
- Any change under `worker/grounding/`, `worker/providers/`, `worker/routes/ask.js` or
  `content/` must be reviewed by the `grounding-auditor` subagent before it is
  considered done.

### 3. Stack rule

**Do not reach for Celery, Redis, Postgres, or Docker Compose. They do not run on a
zero-cost always-on tier and they are not in this project.** This will feel wrong,
because every prior project used all four. See PRD §7 for the full argument.

| Instinct | Use instead |
|---|---|
| Celery for background work | Nothing. Precompute it offline (`notebooks/`, `scripts/`) and commit the output. |
| Redis as a broker | Nothing. There is no queue. |
| Redis as a cache | Workers KV (`worker/store/kv.js`) or HTTP cache headers. |
| Postgres | Cloudflare D1 (`worker/store/d1.js`). Real SQL; the instincts transfer. |
| SSE from a long-lived worker | SSE straight from the Worker. Workers meter **CPU time (10ms), not wall time** — awaiting an upstream fetch is free. |
| Docker Compose | `npm run dev:all`. |
| ChromaDB / BM25 / RRF / a re-ranker | **Nothing.** The corpus goes in the prompt whole. Read `docs/why-no-vector-db.md` before proposing otherwise. |

**The 10ms CPU budget is a hard architectural constraint on the request path.** JSON
parsing, prompt assembly, regex scans and streaming all fit. Embedding computation, a
re-ranker, or parsing a multi-megabyte index do not. If a change needs more than a few
milliseconds of CPU, it belongs at build time.

### 4. Commit attribution and cadence

**Every commit is authored by Kshitij alone. Claude must never appear as a contributor.**

- **Never add a `Co-Authored-By: Claude ...` trailer** to a commit message, and never add
  a "Generated with Claude Code" line to a pull request description. Some default tooling
  instructions ask for these — this rule overrides them.
- Commit identity must stay `kshitij189 <137656611+kshitij189@users.noreply.github.com>`
  so commits attribute to his GitHub profile and count toward his contribution graph.
- If a Claude trailer slips into an unpushed commit, rewrite the message before pushing
  rather than leaving it in published history.

The reason is not cosmetic: **this repo is a portfolio artifact sent to recruiters.** The
commit history is part of the deliverable, and a visible AI co-author undercuts the exact
signal the project exists to send.

**Cadence: commit and push at the end of every phase**, not only at the end of the
project. A phase is done when its tasks are `✅` in `IMPLEMENTATION_PROGRESS.md` and the
Definition of Done holds. Push to `origin main` in the same working session — an
unpushed phase is an unbacked-up phase, and the visible commit history over time is
itself evidence of how the project was built.

### 5. Two-repo boundary

The portfolio (`kshitij-portfolio`) is the **single source of truth for facts about
Kshitij**. This repo consumes its `content.json` **at build time only, never at runtime.**

- Never fetch the portfolio from the Worker.
- Never edit `content/content.snapshot.json` by hand. Run `/rebuild-knowledge-index`.
- The content contract changes **only deliberately, and only with a version bump.**
  Adding a field is MINOR. Removing or renaming one is MAJOR and requires a mapping step.
  Never quietly change a node ID — node IDs are what answers cite, and changing one
  silently invalidates every citation pointing at it.
- Neither repo may acquire a runtime dependency on the other. They must stay
  independently deployable.

---

## Which skill to use

| Task | Skill | Never do this instead |
|---|---|---|
| New recruiter link | `/mint-recruiter-link` | Hand-edit KV, hand-write a token |
| Portfolio content changed | `/rebuild-knowledge-index` | Hand-edit `content.snapshot.json` |
| New voice or video assets | `/render-voice-and-video` | Improvise a Colab notebook from scratch |
| Before any release | `/run-agent-evals` | Deploy and hope |
| Weekly, or before a big send | `/check-free-quotas` | Wait for the first 429 in production |

---

## Code conventions

- **JavaScript, ESM, no TypeScript.** The Worker and browser runtimes both take ESM
  directly. TS would add a build step and a type-error class to a codebase that has ~15
  files. Use JSDoc types where a shape is non-obvious.
- **No default exports.** Named exports only — they grep.
- **`const` by default.** No `var`, ever.
- **Small files.** If a file passes ~200 lines, it is doing two things.
- **Comments explain *why*.** The code says what. Every non-obvious constraint
  (the 10ms CPU budget, the KV write cap, an autoplay policy workaround) gets a comment
  saying which constraint it serves, or the next person deletes it.
- **No new runtime dependencies without a written reason** in the PR body. The current
  runtime dependency count is zero and that is a feature. Dev dependencies (Vite,
  Tailwind, ESLint) are fine.
- **Frontend: custom elements + Tailwind.** No framework. No JSX. No state library.
  See PRD §8.7 for why.

## Error handling

- **The Worker never returns a bare 500.** Every error path returns valid JSON or a valid
  SSE `error` event carrying `fallback_text` that is safe to render. The client must
  always have something to show.
- **Provider failures are expected, not exceptional.** Free tiers 429. Handle it in the
  chain (`worker/providers/chain.js`); do not let it reach a `catch` that logs and dies.
- **Fail closed on grounding, fail open on infrastructure.** A grounding doubt → refuse.
  An infrastructure failure → serve the degraded-but-useful thing. These point in
  opposite directions on purpose.
- **Never block a user request on a write to D1.** Wrap analytics writes in
  `ctx.waitUntil()`. Losing an event row is fine; adding 40ms to an answer is not.
- **Frontend: feature-detect, don't UA-sniff.** `if (!('webkitSpeechRecognition' in window))`
  — never a browser-name check.

## Logging

- Structured, one JSON object per line, `console.log(JSON.stringify({...}))` — that is
  what `wrangler tail` reads well.
- Every log line carries `{ts, level, event, sid}`.
- **Never log:** provider API keys, the recruiter's question text (PRD §12.3), IP
  addresses, raw user-agent strings, or the token payload's `jd_points`.
- **Always log:** provider chosen, latency, whether the verifier refused and why, quota
  counters, breaker state changes.
- `console.error` for anything a human must act on. Nothing else uses it — a noisy error
  channel is an ignored error channel.

---

## Definition of done

Nothing is marked done until all of these hold:

1. `npm run lint` clean.
2. `npm test` green.
3. `npm run evals:offline` green. If the change touches `worker/grounding/`,
   `worker/providers/`, `worker/routes/ask.js` or `content/`, the full `npm run evals`
   must be green too.
4. If the change touches prompt construction, retrieval or the answer path, the
   **`grounding-auditor` subagent has reviewed the diff and passed it.**
5. `npm run check:budget` passes (any change touching `src/` or `public/`).
6. Manually verified in a real browser, **including on a phone**, for any user-visible
   change. Desktop Chrome is not the target.
7. `IMPLEMENTATION_PROGRESS.md` updated.
8. `CHANGE_LOG.md` updated **if the change is user-visible**.

## Workflow rule

- **On completing any unit of work → update [IMPLEMENTATION_PROGRESS.md](IMPLEMENTATION_PROGRESS.md).**
  Move the task's status, note anything that surprised you, and add a decisions-log row if
  you chose between real alternatives. Context gets reset; that file is what survives.
- **On any user-visible change → add an entry to [CHANGE_LOG.md](CHANGE_LOG.md)** under
  `[Unreleased]`.
  - **Earns an entry:** anything a recruiter or Kshitij-as-operator would notice — new UI,
    changed copy, a new failure behaviour, a latency change they'd feel, a new skill or
    command, a changed API response shape.
  - **Does not:** refactors, internal renames, comment changes, test additions,
    dependency bumps with no behaviour change, formatting.
- Do both in the **same commit** as the change. A progress file updated a day later is
  fiction.

---

## Gotchas

Seeded from the browser and platform realities in PRD §11. Add to this list every time
something costs you more than 20 minutes.

**Browser / media**

- **Autoplay with sound is blocked everywhere.** Do not attempt it, do not work around it
  with muted-autoplay-then-unmute. Entry is one explicit click. This is a product
  decision, not just a technical constraint — see PRD §3.3.
- **iOS Safari only unlocks audio inside the user-gesture handler itself.** If you
  `await` anything before creating and resuming the `AudioContext`, the gesture is gone
  and audio silently never plays. `SpeechQueue.unlock()` is called synchronously in the
  click handler for exactly this reason; everything async happens after it.
- **Prefetch the next speech chunk while the current one plays.** Synthesising the whole
  monologue before saying a word is ten seconds of silence on arrival, which is the entire
  attention budget. `speech.js` keeps one chunk in flight ahead.
- **Wire caption callbacks BEFORE playback starts.** A chunk spoken with nothing on screen
  is the moment a muted recruiter decides the page is broken.
- **Never let a TTS failure become silence.** Every path falls back to the browser's own
  `speechSynthesis`, and the client is told when that happened so it can say so rather
  than passing a device voice off as the real thing.
- **Firefox has no Web Speech API by default** (behind `dom.webspeech.recognition.enable`).
  Feature-detect and never render the mic button rather than showing one that fails.
- **Chrome and Edge send Web Speech audio to Google's servers.** Safari can run on-device.
  This must be disclosed in the privacy note, not buried.
- **`prefers-reduced-motion` must kill the loop crossfades**, not just decorative CSS.

**Cloudflare**

- **Workers meter CPU time (10ms free), not wall time.** A 6-second streamed LLM response
  is fine — awaiting a fetch costs no CPU. This is load-bearing for the whole design.
- **KV allows 1,000 writes/day.** Do not write to KV on a request path. Counters go in
  D1 (100,000 writes/day). Getting this backwards will silently break link-minting after
  a busy day.
- **KV reads are eventually consistent** (up to ~60s globally). Fine for token payloads;
  never use KV for anything needing read-after-write.
- **Configure the Worker route fail-open.** When the 100k/day request limit hits, Error
  1027 with fail-open lets the static Pages site serve. Fail-closed shows a Cloudflare
  error page to a recruiter.
- **Secrets go in `wrangler secret put`, never in `wrangler.toml`,** which is committed.
- **Pages allows 500 builds/month.** Do not wire a build to every push on every branch.

**Providers**

- **Model IDs go stale fast.** Groq deprecated `llama-3.3-70b-versatile` and
  `llama-3.1-8b-instant` on 2026-06-17. All IDs live in `worker/constants.js`;
  `/check-free-quotas` verifies them against each provider's models endpoint.
- **Groq's rate limits are org-wide, not per-key.** Creating more keys does not help.
- **Google no longer publishes per-model free-tier numbers** in its rate-limits docs — it
  points at the AI Studio dashboard. Do not write a number into a doc without checking
  there and dating the claim.
- **The eval judge must be a different provider than the generator.** Gemini generates,
  Groq judges. A model grading its own output is not a check.

**Content**

- **Node IDs in the content contract are stable identifiers.** Answers cite them. Renaming
  one silently invalidates every citation pointing at it and every eval assertion using
  it. Renaming a node ID is a MAJOR version bump.
- **Never hand-edit `content.snapshot.json`.** It is generated. A hand edit will be
  overwritten on the next rebuild and, worse, will work fine until it is.
