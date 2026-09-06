---
description: Full pre-deploy gate — lint, test, evals, budget, grounding audit — then deploy the Worker and static site.
argument-hint: [--worker-only]
allowed-tools: Bash(npm run *), Bash(npx wrangler *), Bash(git *), Read, Edit, Agent
disable-model-invocation: true
---

# Ship

Working tree:
!`git status --short`

Diff about to ship:
!`git diff --stat HEAD`

## Gate — run in order, stop at the first failure

1. `npm run lint`
2. `npm test`
3. `npm run check:budget`
4. `npm run evals` — full run, not offline. Apply the release rule from
   `/run-agent-evals`: **any adversarial failure blocks absolutely**; golden grounding
   below 95% blocks; a provider 429 marks cases skipped and does **not** block, but a
   skipped case means this cannot be tagged as a release.
5. **If the diff touches `worker/grounding/`, `worker/providers/`, `worker/routes/ask.js`
   or `content/`** — run the `grounding-auditor` subagent on the diff. A `FAIL` verdict
   blocks the deploy.
6. Confirm `IMPLEMENTATION_PROGRESS.md` and (if the change is user-visible)
   `CHANGE_LOG.md` are updated in this commit. If not, update them now.

## Deploy

```bash
npm run build
npm run deploy          # or deploy:worker with --worker-only
```

## Verify — on a real phone, not just desktop Chrome

1. `curl -s https://<host>/api/health` — providers healthy, snapshot age sane, build SHA matches.
2. Open a real minted `/hi/<token>` link **on a phone, on mobile data**. Name and company
   appear in the first paint.
3. Ask one question. Answer streams, carries citations, and is true.
4. Tap "Just show me the text". The text path is complete without audio.

If any verification fails, roll back immediately: `npx wrangler rollback`. Do not debug
forward on a live URL a recruiter might be holding.
