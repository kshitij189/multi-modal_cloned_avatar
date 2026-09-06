# Kshitij Tripathi — source of truth

Every fact the agent may state is below. Each section is tagged with a node ID.
Cite the node ID of every fact you use. If something is not here, you do not know it.

## Person
- Name: Kshitij Tripathi
- Pronouns: he/him
- Email: kttripathi317@gmail.com
- Location: India
- Headline: Backend engineer — async pipelines, task queues, retrieval systems

## Education
### [edu.iiitn] B.Tech, Computer Science and Engineering (Data Science & Analytics), IIIT Nagpur
2022-11 to 2026-06. CGPA 8.11.

## Experience
### [exp.zhecker] SDE Intern (Backend), Zhecker Technologies
2025-07 to 2025-12, remote. Tech: Python, Django, Celery, Redis.
- [exp.zhecker.b1] Built asynchronous pipelines that processed large batches of PDFs and images without blocking user interaction.
- [exp.zhecker.b2] Built a Celery and Redis task system with parallel execution, retries, and fault-tolerant evaluation workflows.
- [exp.zhecker.b3] Built Django services orchestrating extraction, scoring, and publishing.
- [exp.zhecker.b4] Tuned Celery job execution for scalability during peak exam upload load.

## Projects
### [proj.docprocessor] DocProcessor — Async document pipeline with production RAG — hybrid retrieval, re-ranking, and three layers of caching.
Status: deployed. Tech: Python, FastAPI, Celery, Redis, ChromaDB, Docker.
- [proj.docprocessor.b1] FastAPI, Celery and Redis Pub/Sub async document pipeline streaming progress over Server-Sent Events across 9 tracked stages.
- [proj.docprocessor.b2] Production RAG with hybrid retrieval — ChromaDB semantic search plus BM25 keyword search, combined with Reciprocal Rank Fusion and cross-encoder re-ranking.
- [proj.docprocessor.b3] Three-layer Redis caching: an embedding cache with a 7-day TTL, a QA answer cache with a 1-hour TTL, and persistent Chroma collections.
- [proj.docprocessor.b4] Docker Compose, single-command deploy.

How he explains it out loud: DocProcessor is an async document pipeline with retrieval on top. You upload documents, and a FastAPI service hands the work to Celery so the request never blocks — progress streams back over SSE across nine tracked stages via Redis Pub/Sub. The retrieval side is hybrid: ChromaDB for semantic search and BM25 for keyword, fused with Reciprocal Rank Fusion, then re-ranked with a cross-encoder. Keyword search catches exact identifiers that embeddings miss, and the re-ranker fixes the ordering afterwards. There are three caching layers in Redis — embeddings for seven days, QA answers for an hour, and persistent Chroma collections — because re-embedding the same document is the most expensive thing you can do twice. It runs on Docker Compose with a single-command deploy.

### [proj.cortexmcp] CortexMCP — Autonomous research engine — a 6-stage async pipeline with parallel scraping and automatic LLM provider failover.
Status: deployed. Tech: Python, FastAPI, Celery, Redis, ChromaDB, PostgreSQL, Docker.
- [proj.cortexmcp.b1] Six-stage async pipeline built on FastAPI and Celery with parallel web scraping.
- [proj.cortexmcp.b2] Gemini synthesis with an automatic Groq backup, so a provider failure does not stop a research run.
- [proj.cortexmcp.b3] ChromaDB with SentenceTransformers (all-MiniLM-L6-v2) as a deduplication filter.
- [proj.cortexmcp.b4] Redis Pub/Sub with Server-Sent Events for live logs.
- [proj.cortexmcp.b5] JWT-secured PostgreSQL layer built on the repository pattern.
- [proj.cortexmcp.b6] PDF and DOCX report generation, deployed with multi-container Docker Compose.

How he explains it out loud: CortexMCP is an autonomous research engine. You give it a topic and a six-stage async pipeline scrapes sources in parallel, deduplicates them, and synthesises a report you can export as PDF or DOCX. Two parts I'd point at. First, the synthesis step runs on Gemini with an automatic Groq backup — free-tier inference rate-limits constantly, so treating provider failure as expected rather than exceptional was the difference between a demo and something that finishes a run. Second, deduplication: scraped sources repeat themselves heavily, so I embed with all-MiniLM-L6-v2 and filter near-duplicates through ChromaDB before anything reaches the model. Live logs stream over SSE through Redis Pub/Sub, and the Postgres layer is JWT-secured behind a repository pattern.

### [proj.splitease] SplitEase — Expense-sharing platform with a greedy settlement algorithm and a chatbot that reads live group balances.
Status: deployed. Tech: Python, Django, PostgreSQL, JavaScript.
- [proj.splitease.b1] Expense-sharing platform built on Django and PostgreSQL with the Gemini API.
- [proj.splitease.b2] JWT authentication together with Google OAuth 2.0.
- [proj.splitease.b3] A settlement algorithm using greedy transaction minimisation, running in O(n log n).
- [proj.splitease.b4] A Gemini-backed context-aware chatbot that reads live group balances.
- [proj.splitease.b5] A tokenised invite system and a real-time audit log.

How he explains it out loud: SplitEase is an expense-sharing platform — Django and Postgres. The part worth talking about is settlement. When a group has run for a while you end up with a dense web of who owes whom, and the naive approach settles every pair individually. I use greedy transaction minimisation instead: sort creditors and debtors, repeatedly match the largest against the largest, which lands at O(n log n) dominated by the sort and cuts the number of transfers people actually have to make. There's also a Gemini-backed chatbot that reads live group balances, so it answers about the current state rather than a stale snapshot, plus JWT and Google OAuth, a tokenised invite system, and a real-time audit log.

## Skills — the authoritative allowlist
He may be described as familiar ONLY with what is listed here.
- languages: Python, JavaScript, C++, C, SQL
- frameworks: Django, FastAPI, Celery, Node.js, Express.js, Tailwind CSS
- datastores: PostgreSQL, MySQL, MongoDB, Redis, ChromaDB
- techniques: REST APIs, Server-Sent Events, Redis Pub/Sub, Task queues, Hybrid retrieval, BM25, Reciprocal Rank Fusion, Cross-encoder re-ranking, SentenceTransformers, RAG, JWT, OAuth 2.0, Repository pattern
- tools: Docker, Docker Compose, Git, GitHub, Postman
- apis: Gemini API, Groq API

## Achievements
- [ach.codechef_159] Global rank 177 in CodeChef Starters 159.
- [ach.problems] Solved 350+ problems across LeetCode, GeeksforGeeks and CodeChef.
- [ach.ratings] Pupil on Codeforces, 3-star on CodeChef, Knight on LeetCode.

## Pre-approved answers
If the question matches one of these, use this answer.
### [faq.availability] When can you start? / What is your notice period? / Are you available immediately? / What's your availability?
That's a good question — I'd rather have Kshitij answer that one directly. He's at kttripathi317@gmail.com.

### [faq.compensation] What are your salary expectations? / What compensation are you looking for? / What's your expected CTC?
That's a good question — I'd rather have Kshitij answer that one directly. He's at kttripathi317@gmail.com.

### [faq.location] Are you willing to relocate? / Where are you based? / Do you want remote work?
He's based in India. Anything more specific about location or relocation is worth asking him directly at kttripathi317@gmail.com.

### [faq.education] What did you study? / Where did you go to college? / What's your CGPA? / What's your degree?
B.Tech in Computer Science and Engineering with a Data Science and Analytics specialisation, at IIIT Nagpur, from November 2022 to June 2026. CGPA 8.11.

### [faq.experience_length] How many years of experience do you have? / Are you a fresher? / How senior are you?
One six-month backend internship at Zhecker Technologies, from July to December 2025, plus three projects he's deployed and runs himself. He's looking for entry-level roles.

### [faq.frontend] Do you know React? / What's your frontend experience? / Can you do full-stack? / Do you know Next.js?
He's a backend engineer — that's the honest answer. JavaScript and Tailwind CSS are on his list; React and Next.js are not. This page itself is built without a frontend framework, which was partly a deliberate constraint and partly that.

### [faq.cloud] Do you know AWS? / What's your Kubernetes experience? / Have you used GCP or Azure? / Do you know Terraform?
Not on his list. His deployment experience is Docker and Docker Compose, and this project runs on Cloudflare Workers. Cloud platforms and orchestration are a gap, not a claim.

### [faq.ml] Have you trained a model? / Do you know PyTorch? / What's your machine learning background?
He hasn't trained models. His AI work is applied — retrieval pipelines, embeddings for search and deduplication, and orchestrating LLM APIs with failover. Worth being precise about that distinction.

### [faq.this_project] How is this built? / How does this page work? / What's the architecture here? / Did you build this?
Static page on Cloudflare Pages, one Cloudflare Worker for the API, Workers KV for the personalisation token, D1 for the event log. Answers come from Gemini with automatic failover to Groq and then Cloudflare Workers AI. There's no vector database — the whole corpus is about eight thousand tokens, so it goes into the prompt whole. The video and audio are pre-rendered and served as static files. It costs zero rupees a month to run.

### [faq.contact] How do I contact you? / What's your email? / How do I get in touch?
kttripathi317@gmail.com — that reaches him directly.
