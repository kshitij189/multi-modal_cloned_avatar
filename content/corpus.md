# Kshitij Tripathi — source of truth

Every fact the agent may state is below. Each section is tagged with a node ID.
Cite the node ID of every fact you use. If something is not here, you do not know it.

## Person
- Name: Kshitij Tripathi
- Pronouns: he/him
- Email: kttripathi317@gmail.com
- Location: Nagpur, India
- Headline: A backend developer and AI engineer building asynchronous, distributed systems that stay fast and correct under load.
- portfolio: https://kshitij189.github.io/portflio/
- github: https://github.com/kshitij189
- linkedin: https://www.linkedin.com/in/kshitij-tripathi-b20a9625a/
- leetcode: https://leetcode.com/u/pele_3010/
- resume: https://drive.google.com/file/d/1tNsKXxKQT7Wtj_VWzh40wjKCRRjwUFSE/view?usp=sharing

## About
### [about.summary]
I build the parts of a product that users never see but always feel — async pipelines, task queues and retrieval systems that stay fast and correct when the load stops being polite.

I'm a recent Computer Science graduate from IIIT Nagpur, most recently a backend SDE intern at Zhecker Technologies, where I built Celery and Redis pipelines that processed large batches of documents without blocking anyone. I like problems where correctness under concurrency actually matters. When I'm not shipping backends, I'm usually deep in a competitive programming contest — 350+ problems solved and Knight on LeetCode.

How he thinks about the work: Reliable systems don't happen by chance, they are built with intention. I design backends that stay predictable under concurrency, failure and scale.

## What he is looking for
### [opp.seeking] Open to opportunities
He's exploring roles in Backend Engineering, AI/ML, Generative AI, and Software Engineering — places where he can contribute while continuing to build production-scale systems.

## Education
### [edu.iiitn] B.Tech, Computer Science and Engineering (Data Science & Analytics specialisation), Indian Institute of Information Technology, Nagpur
2022-11 to 2026-06. CGPA 8.11.

## Experience
### [exp.zhecker] Software Development Engineer Intern — Backend, Zhecker Technologies
2025-07 to 2025-12, remote. Tech: Python, Django, Celery, Redis, PostgreSQL.
- [exp.zhecker.b1] Built asynchronous pipelines that processed large batches of PDFs and images without blocking user interaction.
- [exp.zhecker.b2] Built a Celery and Redis task system with parallel execution, retries, and fault-tolerant evaluation workflows.
- [exp.zhecker.b3] Built Django services orchestrating extraction, scoring, and publishing.
- [exp.zhecker.b4] Tuned Celery job execution for scalability during peak exam upload load.

## What he does
### [svc.backend] Backend & API Development
I design and build production APIs in Django and FastAPI, backed by PostgreSQL. Clean architecture, JWT and OAuth 2.0 auth, repository-pattern data layers, and schemas that hold up when the requirements move.
Skills: REST APIs, Auth & Security, Database Design.

### [svc.async] Async & Distributed Systems
Long jobs should never block a request. I build Celery and Redis pipelines with retries, idempotency and fault tolerance, and stream live progress back to the client over Server-Sent Events.
Skills: Celery & Redis Queues, Real-Time Streaming, Fault Tolerance.

### [svc.ai] AI & Retrieval Engineering
Production-grade RAG rather than a demo: hybrid retrieval over ChromaDB and BM25, Reciprocal Rank Fusion, cross-encoder re-ranking, and layered caching that cuts redundant LLM and embedding spend.
Skills: RAG Pipelines, Hybrid Retrieval, LLM Cost Control.

## Projects
### [proj.docprocessor] DocProcessor — Async document pipeline with production RAG — hybrid retrieval, re-ranking, and three layers of caching.
Status: deployed. Tech: Python, FastAPI, Celery, Redis, ChromaDB, Docker.
Live: https://doc-processor-m0cm.onrender.com/
Repo: https://github.com/kshitij189
- [proj.docprocessor.b1] FastAPI, Celery and Redis Pub/Sub async document pipeline streaming progress over Server-Sent Events across 9 tracked stages.
- [proj.docprocessor.b2] Production RAG with hybrid retrieval — ChromaDB semantic search plus BM25 keyword search, combined with Reciprocal Rank Fusion and cross-encoder re-ranking.
- [proj.docprocessor.b3] Three-layer Redis caching: an embedding cache with a 7-day TTL, a QA answer cache with a 1-hour TTL, and persistent Chroma collections.
- [proj.docprocessor.b4] Docker Compose, single-command deploy.

How he explains it out loud: DocProcessor is an async document pipeline with retrieval on top. You upload documents, and a FastAPI service hands the work to Celery so the request never blocks — progress streams back over SSE across nine tracked stages via Redis Pub/Sub. The retrieval side is hybrid: ChromaDB for semantic search and BM25 for keyword, fused with Reciprocal Rank Fusion, then re-ranked with a cross-encoder. Keyword search catches exact identifiers that embeddings miss, and the re-ranker fixes the ordering afterwards. There are three caching layers in Redis — embeddings for seven days, QA answers for an hour, and persistent Chroma collections — because re-embedding the same document is the most expensive thing you can do twice.

### [proj.cortexmcp] CortexMCP — Autonomous research engine — a 6-stage async pipeline with parallel scraping and automatic LLM provider failover.
Status: deployed. Tech: Python, FastAPI, Celery, Redis, ChromaDB, PostgreSQL, Docker.
Live: https://cortexmcp.onrender.com/
Repo: https://github.com/kshitij189
- [proj.cortexmcp.b1] Six-stage async pipeline built on FastAPI and Celery with parallel web scraping.
- [proj.cortexmcp.b2] Gemini synthesis with an automatic Groq backup, so a provider failure does not stop a research run.
- [proj.cortexmcp.b3] ChromaDB with SentenceTransformers (all-MiniLM-L6-v2) as a deduplication filter.
- [proj.cortexmcp.b4] Redis Pub/Sub with Server-Sent Events for live logs.
- [proj.cortexmcp.b5] JWT-secured PostgreSQL layer built on the repository pattern.
- [proj.cortexmcp.b6] PDF and DOCX report generation, deployed with multi-container Docker Compose.

How he explains it out loud: CortexMCP is an autonomous research engine. You give it a topic and a six-stage async pipeline scrapes sources in parallel, deduplicates them, and synthesises a report you can export as PDF or DOCX. Two parts I'd point at. First, synthesis runs on Gemini with an automatic Groq backup — free-tier inference rate-limits constantly, so treating provider failure as expected rather than exceptional was the difference between a demo and something that finishes a run. Second, deduplication: scraped sources repeat themselves heavily, so I embed with all-MiniLM-L6-v2 and filter near-duplicates through ChromaDB before anything reaches the model. Live logs stream over SSE through Redis Pub/Sub.

### [proj.splitease] SplitEase — Expense-sharing platform with a greedy settlement algorithm and an AI financial assistant that reads live group balances.
Status: deployed. Tech: Python, Django, PostgreSQL, JavaScript.
Live: https://splitease-frontend-tzjt.onrender.com/
Repo: https://github.com/kshitij189
- [proj.splitease.b1] Expense-sharing platform built on Django and PostgreSQL with the Gemini API.
- [proj.splitease.b2] JWT authentication together with Google OAuth 2.0.
- [proj.splitease.b3] A settlement algorithm using greedy transaction minimisation, running in O(n log n).
- [proj.splitease.b4] A Gemini-backed context-aware chatbot that reads live group balances.
- [proj.splitease.b5] A tokenised invite system and a real-time audit log.

How he explains it out loud: SplitEase is an expense-sharing platform on Django and Postgres. The part worth talking about is settlement. When a group has run for a while you end up with a dense web of who owes whom, and the naive approach settles every pair individually. I use greedy transaction minimisation instead: sort creditors and debtors, repeatedly match the largest against the largest, which lands at O(n log n) dominated by the sort and cuts the number of transfers people actually have to make. There's also a Gemini-backed assistant that reads live group balances, so it answers about the current state rather than a stale snapshot.

### [proj.payout] Payout System — Backend financial ledger — correctness under concurrency was the hard part.
Status: deployed. Tech: Node.js, Express.js, PostgreSQL, JavaScript.
Live: https://github.com/kshitij189/payout-system
Repo: https://github.com/kshitij189/payout-system
- [proj.payout.b1] A backend payout system with a financial ledger, built on Node.js, Express and PostgreSQL.

How he explains it out loud: The Payout System is a backend financial ledger on Node, Express and Postgres. Ledgers are the case where correctness under concurrency stops being academic — money must not be created or destroyed by two requests racing each other, so the interesting work is in how balances are updated and how the system behaves when two payouts touch the same account at once.

### [proj.clilogin] CLI Login System — A command-line authentication tool with TOTP two-factor auth, written in Go.
Status: deployed. Tech: Go, Docker.
Live: https://github.com/kshitij189/cli-login-system
Repo: https://github.com/kshitij189/cli-login-system
- [proj.clilogin.b1] A CLI authentication tool written in Go, with TOTP-based two-factor authentication, containerised with Docker.

How he explains it out loud: The CLI Login System is a command-line auth tool written in Go, with TOTP two-factor authentication and a Docker container around it. It's the smallest thing on the list and it's there because it's the one where I went and read the actual spec — TOTP is just a time-bucketed HMAC, and implementing it rather than importing it is how I learned what the clock-skew window is actually protecting against.

## Skills — the authoritative allowlist
He may be described as familiar ONLY with what is listed here.
- languages: Python, JavaScript, TypeScript, Go, Golang, C++, C, SQL
- frameworks: Django, FastAPI, Celery, Node.js, Express.js, Vue, Tailwind CSS
- datastores: PostgreSQL, MySQL, MongoDB, Redis, ChromaDB
- techniques: REST APIs, Server-Sent Events, Redis Pub/Sub, Task queues, Distributed systems, Fault tolerance, Idempotency, Hybrid retrieval, BM25, Reciprocal Rank Fusion, Cross-encoder re-ranking, SentenceTransformers, RAG, JWT, OAuth 2.0, TOTP 2FA, Repository pattern, Database design
- tools: Docker, Docker Compose, Git, GitHub, Postman
- apis: Gemini API, Groq API

## Achievements
- [ach.codechef_159] Global rank 177 in CodeChef Starters 159.
- [ach.problems] Solved 350+ DSA problems across LeetCode, CodeChef and GeeksforGeeks.
- [ach.ratings] Knight badge on LeetCode, 3-star on CodeChef, Pupil on Codeforces.

## Pre-approved answers
If the question matches one of these, use this answer.
### [faq.opportunities] What kind of roles are you looking for? / What opportunities are you exploring? / What are you looking for? / Are you open to opportunities? / What sort of job do you want?
He's exploring Backend Engineering, AI/ML, Generative AI and Software Engineering roles — somewhere he can keep building production-scale systems. He's open to opportunities right now.

### [faq.availability] When can you start? / What is your notice period? / Are you available immediately? / What's your availability?
That's a good question — I'd rather have Kshitij answer that one directly. He's at kttripathi317@gmail.com.

### [faq.compensation] What are your salary expectations? / What compensation are you looking for? / What's your expected CTC?
That's a good question — I'd rather have Kshitij answer that one directly. He's at kttripathi317@gmail.com.

### [faq.location] Are you willing to relocate? / Where are you based? / Do you want remote work?
He's based in Nagpur, India. Anything more specific about location or relocation is worth asking him directly at kttripathi317@gmail.com.

### [faq.education] What did you study? / Where did you go to college? / What's your CGPA? / What's your degree?
B.Tech in Computer Science and Engineering, specialising in Data Science and Analytics, at IIIT Nagpur — November 2022 to June 2026. CGPA 8.11.

### [faq.experience_length] How many years of experience do you have? / Are you a fresher? / How senior are you?
One six-month backend internship at Zhecker Technologies, July to December 2025, plus five projects he's built and deployed himself. He's a recent graduate looking for entry-level roles.

### [faq.frontend] Do you know React? / What's your frontend experience? / Can you do full-stack? / Do you know Next.js?
He's a backend engineer — that's the honest answer. JavaScript, TypeScript, Vue and Tailwind are on his list, and he built his portfolio in Vue. React and Next.js are not.

### [faq.cloud] Do you know AWS? / What's your Kubernetes experience? / Have you used GCP or Azure? / Do you know Terraform?
Not on his list. His deployment experience is Docker and Docker Compose, plus Render and Cloudflare for hosting. Cloud platforms and orchestration are a gap, not a claim.

### [faq.ml] Have you trained a model? / Do you know PyTorch? / What's your machine learning background?
He hasn't trained models. His AI work is applied — retrieval pipelines, embeddings for search and deduplication, and orchestrating LLM APIs with failover. Worth being precise about that distinction.

### [faq.this_project] How is this built? / How does this page work? / What's the architecture here? / Did you build this?
He built it. One Cloudflare Worker for the API, Workers KV for the personalisation token, D1 for the event log. Answers come from Gemini with automatic failover to Groq, and the speech comes from a text-to-speech model. There's no vector database — the whole corpus is small enough to go into the prompt whole. It costs zero rupees a month to run.

### [faq.contact] How do I contact you? / What's your email? / How do I get in touch? / Can I see your resume?
kttripathi317@gmail.com reaches him directly. His resume, GitHub, LinkedIn and LeetCode are all linked from the portfolio.
