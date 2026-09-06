# Why there is no vector database in this project

Short version: the corpus is about 8,000 tokens. It fits in the prompt. Retrieving from
it would reduce answer quality, not improve it.

This document exists because the absence of a retrieval layer is a **decision**, and a
decision nobody can see is indistinguishable from an oversight. Anyone reading this repo
who has built RAG systems will notice the gap and reasonably wonder whether it was
considered. It was.

## The corpus

Everything the agent knows about Kshitij: a resume, three project write-ups, a skills
list, an achievements list, and a pre-approved FAQ. Rendered to Markdown, that is roughly
6,000–10,000 tokens — call it 100 chunks if you insisted on chunking it, which you should
not.

Gemini Flash's context window holds it many times over. The free tier caps **requests per
day, not tokens per day**, so a 10,000-token prompt and a 1,000-token prompt consume
exactly the same quota. The corpus is free to include in full, on every single call.

## What each retrieval layer would actually buy

**A vector database** would select the ~5 most similar chunks out of 100 and hide the
other 95 from the model. When a recruiter asks "have you worked with queues?", the honest
answer draws on the Zhecker internship *and* CortexMCP *and* DocProcessor — three
documents that a top-5 similarity search may well not return together. Every "the agent
didn't mention the internship" bug for the next six months would be a retrieval bug,
introduced to solve a context-window problem that does not exist.

**Hybrid retrieval with BM25, Reciprocal Rank Fusion and a cross-encoder re-ranker** —
the stack in DocProcessor — would add three tunable components and an offline index
build. It is also structurally impossible here: a Cloudflare Worker on the free plan gets
**10ms of CPU per request**, and a cross-encoder re-ranker does not run in 10ms.
DocProcessor's stack was correct for DocProcessor, where the corpus was arbitrary
user-uploaded documents of unbounded size. It is not correct for a two-page resume.

**Build-time embeddings shipped as a static JSON file with in-process cosine similarity
in the Worker** is the genuinely good middle answer. It needs no database, no service and
no runtime embedding call. It is still wrong *today*: it is real code, a real build step
and a real index-staleness bug class, bought to solve a problem that will not exist until
the corpus roughly doubles. It is scheduled as task T-3.03 with an explicit trigger —
**corpus exceeds ~15,000 tokens** — and `rebuild-knowledge-index` prints the token count
on every run so the trigger is measured rather than guessed.

## What stuffing the corpus buys instead

- **Perfect recall.** The model is never asked to remember anything. Every fact it could
  need is in front of it.
- **Zero retrieval code**, and therefore zero retrieval bugs.
- **Zero index staleness.** The corpus and the snapshot are the same artifact.
- **Better grounding.** The output verifier checks that cited node IDs exist in the
  snapshot. When the whole snapshot is in context, "the model cited something it wasn't
  shown" is not a reachable state.
- **Zero marginal cost**, per the request-capped free tier.

The only cost is roughly 200ms of additional time-to-first-token from the larger prompt,
which sits inside the latency budget in PRD §11.3.

## Where the retrieval and evaluation experience went instead

It was not discarded. It was pointed at the parts of this system that are actually hard:

1. **The grounding verifier** — every factual sentence must map to a node ID in the
   content contract, validated after generation, failing closed. This is a harder problem
   than retrieval and it is the layer that protects a real person's reputation.
2. **The eval harness** — a golden set with per-claim grounding assertions, an adversarial
   set covering prompt injection and credential invention, and an LLM judge running on a
   *different provider* than the generator. This is where evaluation instincts genuinely
   transfer.
3. **The provider-abstraction layer** — a three-deep fallback chain with circuit breaking
   and normalised streaming across two vendors.

## The general principle

The interesting engineering decision is rarely which retrieval architecture to use. It is
whether the problem needs one. Reaching for a familiar stack because it is familiar is
the most common way a small system becomes a large one, and a resume-sized corpus behind
a vector database would be a clear signal of exactly that.

Revisit this document if the corpus passes 15,000 tokens. Not before.
