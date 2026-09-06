---
description: Mint a personalised recruiter link. Wraps the mint-recruiter-link skill for fast invocation mid-email.
argument-hint: <first-name> <company> <role> [paste the JD after]
allowed-tools: Bash(node scripts/*), Bash(npx wrangler kv *), Read, Write
disable-model-invocation: true
---

Invoke the `mint-recruiter-link` skill with: $ARGUMENTS

Budget is **30 seconds of attention** — he is mid-email. Infer `lead_project` from the
role and JD rather than asking. Ask only for `name`, `company` or `role` if genuinely
missing, and ask for all of them in one message.

Return the URL, the suggested email line, and nothing else.
