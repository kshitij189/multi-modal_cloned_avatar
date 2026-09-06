---
name: mint-recruiter-link
description: Mint a personalised recruiter link for the AI agent. Use whenever Kshitij is about to send a cold email and needs a URL for a specific person — triggers on "mint a link", "new recruiter link", "make a link for <name> at <company>", "I'm emailing <company>". Takes a name, company, role and optional job description, writes the token to Workers KV, and returns the final URL plus a suggested email line.
argument-hint: <first-name> <company> <role> [paste JD after]
allowed-tools: Bash(npx wrangler kv *), Bash(node scripts/*), Read, Write
---

# Mint a recruiter link

**Budget: 30 seconds of Kshitij's attention.** He is mid-email. Do not ask questions you
can answer yourself, do not offer options, do not explain what you are doing. Gather what
is missing in **one** message, then produce the URL.

## Inputs

| Field | Required | Source |
|---|---|---|
| `name` | Yes | First name only. "Neha", not "Neha Sharma". The greeting says it out loud. |
| `company` | Yes | As they write it. "Northbound", not "Northbound Technologies Pvt Ltd". |
| `role` | Yes | The role title from the posting. |
| `jd_points` | No | Up to 5 short bullets from the job description. |
| `lead_project` | No | Which project to lead with. **Infer it** — see below. |

If `name`, `company` or `role` is missing, ask for all missing fields in **one** message
and stop. Never ask for `jd_points` — if they were not supplied, proceed without them.

## Step 1 — Infer `lead_project`

Do not ask. Read the role title and JD and pick one:

| Signal in role/JD | `lead_project` |
|---|---|
| RAG, LLM, retrieval, search, embeddings, "AI engineer", vector | `proj.docprocessor` |
| Async, pipelines, workers, queues, distributed, scraping, "platform", "infra" | `proj.cortexmcp` |
| Full-stack, product, CRUD, payments, auth, "backend engineer" with a product focus | `proj.splitease` |
| Genuinely unclear | `proj.docprocessor` — it is the strongest all-round story |

## Step 2 — Write the opening line

**Rules, in order of importance:**

1. Under 18 words. It is spoken aloud in the first 8 seconds.
2. Names the person and the company. Both. In the first clause.
3. First person, as Kshitij, conversational — how he would actually greet someone.
4. **Contains no factual claim about him.** No years, no skills, no metrics. The greeting
   is a greeting; the grounded content comes after. A claim here bypasses the verifier.
5. No flattery about the company. It reads as filler and it costs a second of the eight.

Template: `Hi {name} — thanks for opening this. I'm Kshitij, and this is an AI version of me built to walk you through my work for the {role} role at {company}.`

Trim to fit 18 words if the role title is long. Show him the line before writing the
token; he can override it in a word.

## Step 3 — Generate the token

```bash
node scripts/mint-token.js \
  --name "Neha" \
  --company "Northbound" \
  --role "Platform Engineer" \
  --lead-project "proj.docprocessor" \
  --opening-line "Hi Neha — thanks for opening this..." \
  --jd-point "Owns the ingestion pipeline" \
  --jd-point "Python, async, queues"
```

The script:
1. Generates a 10-character URL-safe token (`crypto.randomBytes`, base64url, no
   ambiguous characters). Not sequential, not guessable, not derived from the name — a
   token containing the recruiter's name would leak it in the URL bar and in link
   previews.
2. Builds the payload:
   ```json
   { "v": 1, "name": "...", "company": "...", "role": "...",
     "jd_points": ["..."], "lead_project": "proj.docprocessor",
     "opening_line": "...", "opening_audio_b64": null,
     "created_at": 1757116800, "expires_at": 1764892800 }
   ```
3. Writes it to KV with a **90-day TTL**:
   ```bash
   npx wrangler kv key put --binding=TOKENS "tok:<id>" '<json>' --expiration-ttl 7776000 --remote
   ```
4. Appends a row to `outreach.csv` (git-ignored, local only): date, token, name, company,
   role, `replied` (blank — he fills it in). This is the manual reply tally from PRD §4.2
   and it is the only place reply attribution exists.

**v1 only — greeting audio.** If `features.tts` is enabled, render the ~2-second fragment
with Chatterbox before the KV write and inline it as base64 in `opening_audio_b64`.
**Hard budget: 30 seconds.** If the render has not finished by then, kill it, set the
field to `null`, and continue — the page falls back to on-screen text, which is a
perfectly good experience. Never make him wait on a TTS render while he is writing an
email.

## Step 4 — Verify

```bash
npx wrangler kv key get --binding=TOKENS "tok:<id>" --remote
curl -s "https://<host>/api/session?token=<id>" | head -c 400
```

Both must return the payload. If the KV write succeeded but `/api/session` returns the
generic payload, KV is still propagating — wait 60 seconds and re-check. **KV is
eventually consistent, up to about a minute globally.** Do not "fix" this; it resolves
itself.

## Step 5 — Return

Output exactly this and nothing else:

```
https://<host>/hi/<token>

Suggested email line:
I built a zero-cost realtime multimodal agent that walks through my work —
architecture writeup in the repo. Here's a version set up for you: <url>

Token: <id>   Expires: <date>   Leading with: <project name>
```

## Rules

- **Never put a factual claim about Kshitij in the opening line or `jd_points`.** Those
  fields bypass the grounding verifier because they are operator-authored, not generated.
  That is exactly why they must stay free of claims.
- **`jd_points` are his private notes about their role, and a forwarded link exposes them
  to whoever receives it.** If a point is anything he would not want the recruiter's
  colleague to read, drop it. Warn once if a point looks like a judgment about the
  company or the role rather than a fact from the posting.
- **Never mint in bulk.** One recruiter, one link, one deliberate act. Bulk minting is
  how this becomes spam, and it would also blow the KV write budget (1,000/day).
- Full name goes nowhere. First name only, in one field.
- If KV writes are near their daily cap (`/check-free-quotas`), say so before minting.

## If it fails

| Symptom | Cause | Do this |
|---|---|---|
| `wrangler` not authenticated | Session expired | `npx wrangler login` |
| KV write returns a quota error | 1,000 writes/day exhausted | Stop. Something is writing to KV on the request path — that is a bug, not a quota problem. Investigate before minting again. |
| `/api/session` shows generic payload | KV propagation | Wait 60s. If still wrong after 2 minutes, check the key has the `tok:` prefix. |
| Token works locally, not in production | Wrote to the local namespace | Re-run with `--remote`. |
