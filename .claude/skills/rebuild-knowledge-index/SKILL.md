---
name: rebuild-knowledge-index
description: Fetch the portfolio's content contract, validate it against the schema, and rebuild the agent's committed knowledge snapshot. Use whenever the portfolio content changed, a new project or achievement was added, the agent is saying something outdated, or content.json's schema_version moved. Triggers on "rebuild the index", "update the agent's knowledge", "I updated my portfolio", "the agent doesn't know about X".
allowed-tools: Bash(node scripts/*), Bash(npm run *), Bash(git *), Read, Write, Edit, WebFetch
---

# Rebuild the knowledge index

The agent's brain is `content/content.snapshot.json` — a **committed file**, never a
runtime fetch. This procedure updates it. Nothing else may write that file.

**There is no embedding step and no vector index.** The "index" is the snapshot plus a
rendered `corpus.md` that goes into the prompt whole. If you find yourself reaching for
ChromaDB, read `docs/why-no-vector-db.md` first — the corpus is ~6–10k tokens and
retrieval over it would reduce recall, not improve it.

## Step 1 — Fetch

```bash
node scripts/fetch-content.js --url https://kshitij.dev/content.json --out /tmp/content.fetched.json
```

**If the fetch fails** (network, 404, 5xx, timeout):

Do **not** fail. Print `stale-content: using committed snapshot, age N days` and stop.
The agent keeps serving the existing snapshot and stays fully functional. This is the
whole point of build-time-only consumption: a broken portfolio deploy can never take the
agent down. Report the failure and the snapshot age, then exit 0.

## Step 2 — Validate

```bash
node scripts/validate-content.js /tmp/content.fetched.json content/schema.json
```

Checks, in order:

1. **JSON Schema** conformance against `content/schema.json`.
2. **Node ID stability** — every `id` present in the current snapshot must still exist in
   the fetched file. This is the check that matters most; see Step 3.
3. **Node ID uniqueness** — no duplicates anywhere in the document.
4. **`skills` completeness** — non-empty, and every technology named in any `tech` array
   appears in the `skills` object. A project claiming a technology the skills list omits
   is a grounding hole: the verifier would reject an honest answer about it.
5. **`faq` sanity** — every entry has at least one `q` and a non-empty `a`.
6. **`banned_topics`** present and non-empty.

Any failure → **stop, do not write the snapshot, open a GitHub issue with the validator
output.** The deployed agent is unaffected.

## Step 3 — The schema-version procedure

Compare `schema_version` in the fetched file against the committed snapshot.

| Change | Action |
|---|---|
| **Identical** | Proceed silently. |
| **PATCH** (`1.0.0` → `1.0.1`) | Proceed. Note the bump in the commit message. |
| **MINOR** (`1.0.0` → `1.1.0`) | Proceed. Log every field present in the fetched file that the schema does not know about. Additive changes must never break the build. List the new fields in the commit body so a human can decide whether to surface them. |
| **MAJOR** (`1.0.0` → `2.0.0`) | **STOP.** Do not write the snapshot. Do not attempt an automatic migration — a wrong guess about a renamed field puts a false claim in the agent's mouth. Open a GitHub issue titled `Content contract MAJOR bump: 1.x → 2.0` containing a field-level diff, the current schema, and the fetched document. A human writes the mapping and updates `content/schema.json` in the same PR. The deployed agent keeps serving the old snapshot throughout. |

**Node ID renames are a MAJOR change even inside a MINOR bump.** If validation step 2
fails, treat it as MAJOR regardless of what the version string says, and say so in the
issue. Node IDs are what generated answers cite; renaming one silently invalidates every
citation pointing at it and every eval assertion that uses it.

## Step 4 — Chunk and render

```bash
node scripts/build-corpus.js /tmp/content.fetched.json \
  --out-snapshot content/content.snapshot.json \
  --out-corpus content/corpus.md \
  --out-banned worker/grounding/banned.generated.js
```

Produces three artifacts:

- **`content.snapshot.json`** — the validated document, key-sorted for a stable diff.
- **`corpus.md`** — the whole document rendered as compact Markdown, one section per
  node, each prefixed with its node ID so the model can cite it. This string goes into
  the system prompt in full. "Chunking" here means readable section boundaries for the
  model, not retrieval units. There is no retrieval.
- **`banned.generated.js`** — the compiled banned-technology regex: a denylist of common
  technology names **minus** everything in `content.skills`. This is what stops the agent
  claiming React or Kubernetes. It is generated, never hand-edited.

**Check the corpus size.** The script prints an estimated token count.

| Size | Action |
|---|---|
| < 12k tokens | Fine. Proceed. |
| 12k–15k tokens | Warn. Trim `talk_track` fields, which are the most compressible. |
| **> 15k tokens** | **Stop and escalate.** This is the documented trigger for revisiting T-3.03 (build-time embeddings + static index + in-Worker cosine). Do not silently truncate the corpus — a silently truncated corpus is a silent hallucination source. |

## Step 5 — Verify before committing

```bash
npm run evals:offline     # mechanical assertions, no network, no quota
npm run evals             # full run — requires provider keys
```

Every eval case asserts against node IDs. If the content changed meaningfully, some
golden cases will legitimately need updating — **update the assertion, never the
verifier.** If an eval fails because the agent can no longer support a claim, that is the
system working: the claim left the corpus and the agent correctly stopped making it.

Then check the diff by hand:

```bash
git diff --stat content/
git diff content/content.snapshot.json | head -100
```

**Read what changed.** This is the file that determines what the agent says about a real
person to people deciding whether to hire him. An unreviewed diff here is the single
highest-consequence unreviewed diff in the repo.

## Step 6 — Commit

```bash
git add content/ worker/grounding/banned.generated.js
git commit -m "content: rebuild snapshot from contract v<version>

<one line per meaningful change>

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

Then update `CHANGE_LOG.md` **if the agent's answers will change** — new project, changed
facts, a new banned claim. A whitespace-only or reformatting rebuild earns no entry.

## Rules

- **Never hand-edit `content.snapshot.json`.** It is generated. A hand edit survives
  until the next rebuild silently overwrites it, which is the worst possible failure
  mode: it works, then stops working, with no error.
- **Never fetch the portfolio from the Worker.** Build time only. The two repos must stay
  independently deployable.
- **Never auto-migrate a MAJOR schema change.** A human maps the fields.
- **Never truncate the corpus to fit a budget.** Escalate instead.
- If the portfolio is down, the agent stays up on the old snapshot. That is correct
  behaviour, not a degraded state to be fixed urgently.
