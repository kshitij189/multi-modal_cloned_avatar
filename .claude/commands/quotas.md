---
description: Report free-tier usage against every ceiling, verify model IDs are still live, and confirm no payment method is on file.
allowed-tools: Bash(node scripts/*), Bash(npx wrangler *), Bash(npm run *), Read, Edit, WebFetch
---

Invoke the `check-free-quotas` skill.

Then update the **Free-tier quota watch** table in `IMPLEMENTATION_PROGRESS.md` with the
observed numbers and today's date.

Flag immediately, before anything else in the report:
- Any service under **50% headroom**
- **KV writes above 50% used** — that is an architecture bug (a request-path write), not
  a quota event
- **Workers AI usage above zero** — it is the third fallback; non-zero means Gemini and
  Groq are failing
- Any model ID that no longer resolves
- **Any payment method found on file** — P0
