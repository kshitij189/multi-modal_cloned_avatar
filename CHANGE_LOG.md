# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## Conventions

### What earns an entry

A change earns an entry if **a recruiter using the agent, or Kshitij operating it, would
notice it.** Concretely:

- New or changed UI, copy, or interaction
- A new or changed failure behaviour (what happens when the mic is denied, quota runs
  out, a provider is down)
- A latency or payload change large enough to feel
- A change to what the agent will or will not say — new banned claims, a changed refusal
  line, a new grounding rule
- A new skill, slash command, or operator-facing procedure
- A change to the `/api` response shape or the content-contract schema
- A new or removed third-party dependency, service, or model
- Anything that changes the free-tier posture (a new provider, a changed fallback order)

### What does not

- Refactors with no behaviour change
- Internal renames, file moves, comment edits
- Test or eval-case additions that do not change agent behaviour
  *(a change to the **release rule** does earn an entry — that changes what ships)*
- Formatting, lint fixes, dependency bumps with no behaviour change
- Anything under `notebooks/` that does not change a committed artifact

### Versioning

- **MAJOR** — a breaking change to the content-contract schema, or to the `/api` surface
  the portfolio embed depends on.
- **MINOR** — a new user-visible capability. Phase completions land here: v0 → `0.1.0`,
  v1 → `0.2.0`.
- **PATCH** — fixes and copy changes that add no capability.

The content contract carries **its own independent `schema_version`** (see PRD §9.1). It
does not track this file's version. Do not conflate them.

### Entry style

One line, present tense, written from the reader's point of view — what changed for them,
not which file was edited. Reference a task ID from `IMPLEMENTATION_PROGRESS.md` where one
exists.

Good: `Mic button no longer renders on Firefox, where the Web Speech API is unavailable; the text box is focused instead. (T-1.04)`
Bad: `Refactored ask-box.js to feature-detect.`

---

## [Unreleased]

### Added
- Pre-start screen showing the recruiter's name, company and role in the first paint,
  with two equally-sized entry points — **Start** and **Just show me the text**. (T-1.13)
- Transcript panel as the primary UI: complete without audio or video, `aria-live` so
  answers are announced as they arrive, and citation chips on every grounded answer. (T-1.15)
- Text question box with three suggested-question chips drawn from the session payload,
  and an honest disabled state when model quota is exhausted. (T-1.16)
- Video stage with `preload="none"` and a poster, so a visitor who never taps Start costs
  zero media bytes; falls back to a message pointing at the transcript if the video fails. (T-1.14)
- Always-visible AI disclosure, before any content and on every screen. (T-1.13)
- `POST /api/ask` — grounded answers over SSE, with pre-approved FAQ answers served
  instantly and with no model call. (T-1.10)
- `GET /api/session` — personalisation lookup that always returns 200; an unknown or
  expired token gets the generic experience rather than an error page. (T-1.11)
- `GET /api/health` — public provider status, quota headroom, and content snapshot age. (T-1.12)
- Provider chain: Gemini → Groq → Cloudflare Workers AI, with a KV circuit breaker. (T-1.06, T-1.07)
- Grounding verifier: rejects claims about technologies outside the skills allowlist,
  invented quantities of experience, unauthorised commitments, prompt-leak attempts, and
  any answer whose citations do not resolve to real corpus nodes. Fails closed. (T-1.09)
- Eval suite: 30 golden cases and 22 adversarial cases, with an offline mode that runs
  the mechanical assertions with no network and no quota. (T-1.20)
- `<noscript>` path rendering the disclosure, his full background and his email as plain
  HTML, so a JS-blocked recruiter still gets the substance. (T-1.18)
- CI on GitHub Actions: lint, tests, offline evals, corpus-drift check and payload-budget
  enforcement on every PR; full evals on `main`. (T-1.21)
- `scripts/mint-token.js` — mints a personalised recruiter link and prints the URL.

### Changed
- Nothing yet.

### Deprecated
- Nothing yet.

### Removed
- Nothing yet.

### Fixed
- Nothing yet.

### Security
- CORS on `/api/*` is an explicit origin allowlist, never `*`.
- Client-supplied conversation history is role-validated, turn-capped and
  length-capped before it reaches a prompt — it is the most direct injection route in
  the design.
- The event log deliberately has no column for the recruiter's question text.

---

## [0.1.0] — 2026-09-06

Project initialisation. Planning package only — no product code yet.

### Added
- `PRD.md` — problem statement, non-goals, phased scope (v0/v1/v2), full architecture
  with sequence diagrams, component-by-component technology decisions with alternatives,
  data model, API surface, two-repo content contract, eval and observability plan,
  security and privacy stance, risk register, and open-questions register.
- `CLAUDE.md` — operating instructions for the implementing agent: repo layout, exact
  commands, the four non-negotiable rules (cost, truthfulness, stack, two-repo boundary),
  code and logging conventions, definition of done, and a seeded gotchas list.
- `IMPLEMENTATION_PROGRESS.md` — task breakdown for all three phases with IDs,
  dependencies, estimates and acceptance criteria; decisions log; blockers table;
  free-tier quota watch table.
- `CHANGE_LOG.md` — this file.
- `.claude/skills/mint-recruiter-link/` — mint a personalised recruiter token and URL in
  under 30 seconds.
- `.claude/skills/rebuild-knowledge-index/` — fetch, validate, and commit the portfolio
  content snapshot, including the schema-version mismatch procedure.
- `.claude/skills/render-voice-and-video/` — the offline free-GPU pipeline for voice and
  video artifacts, written to be re-runnable after six months away.
- `.claude/skills/run-agent-evals/` — run the golden and adversarial sets, interpret the
  report, apply the release rule.
- `.claude/skills/check-free-quotas/` — report usage against every free-tier ceiling and
  verify model IDs are still live.
- `.claude/agents/grounding-auditor.md` — subagent that reviews any diff touching prompt
  construction, retrieval or the answer path and fails it if an ungrounded claim could
  reach a recruiter.
- `.claude/agents/cost-sentinel.md` — subagent that audits new dependencies and services
  against the zero-budget rule.
- `.claude/commands/` — `ship.md`, `newlink.md`, `quotas.md`, `evals.md`, `progress.md`.
- `.claude/settings.json` — hooks wiring, including the pre-commit paid-service check.
- `.claude/hooks/check-no-paid-services.mjs` — blocks a commit that introduces a
  dependency or config referencing a paid or payment-method-required service.
- `.githooks/pre-commit` — the same check bound at the git level, so it applies to human
  commits as well as agent commits.

### Notes on decisions recorded at initialisation

- The in-Gmail overlay concept is **permanently out of scope**, with the technical reason
  recorded in PRD §2.1 so it is not re-litigated.
- **No vector database and no embeddings** at v0 — the corpus is ~6–10k tokens and goes
  into the prompt whole. Argument in PRD §8.3 and `docs/why-no-vector-db.md`.
- **No Celery, Redis, Postgres or Docker Compose** — none run on a zero-cost always-on
  tier. Replacements in PRD §7.
- v0 deliberately excludes **microphone, speech-to-text and voice cloning**. Those are
  the three highest-risk components and they are deferred to v1.
- Verified against provider documentation on 2026-09-06: Cloudflare Workers/KV/D1/Pages/
  Turnstile free limits; Groq's 2026-06-17 deprecation of the Llama models; that Google
  no longer publishes per-model free-tier numbers; Coqui XTTS-v2 (CPML) and F5-TTS
  (CC-BY-NC) are non-commercial while Chatterbox and OpenVoice V2 are MIT; Wav2Lip is
  non-commercial while SadTalker is now Apache-2.0.
