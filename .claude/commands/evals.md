---
description: Run the golden and adversarial eval sets and apply the release rule.
argument-hint: [--offline]
allowed-tools: Bash(npm run *), Bash(node evals/*), Read, Write, Edit
---

Invoke the `run-agent-evals` skill. With `--offline`, run `npm run evals:offline`
(mechanical assertions only, no network, no quota); otherwise run the full `npm run evals`.

Report the table, then state the release verdict explicitly: **SHIP** or **BLOCKED**, with
the specific rule that decided it.

For any failure, state whether the *agent* is wrong or the *assertion* is wrong, and why.
Never propose loosening an assertion or the verifier to get green.
