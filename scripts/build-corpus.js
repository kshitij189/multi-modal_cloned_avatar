/**
 * Builds the three artifacts the agent's answer path depends on:
 *
 *   content/corpus.md                     the whole corpus as Markdown, node-ID tagged.
 *                                         Goes into the system prompt IN FULL. There is
 *                                         no retrieval — see docs/why-no-vector-db.md.
 *   worker/grounding/banned.generated.js  the banned-technology regex, derived as
 *                                         (known tech terms) MINUS (his skills allowlist).
 *   worker/grounding/corpus.generated.js  corpus.md as an importable string, plus the
 *                                         valid node-ID set the verifier checks citations
 *                                         against.
 *
 * "Chunking" here means readable section boundaries for the model, not retrieval units.
 *
 * Usage: node scripts/build-corpus.js [source.json]
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateContent } from './validate-content.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Technologies a recruiter might plausibly ask about. Anything here that is NOT in the
 * skills allowlist becomes a banned claim.
 *
 * This list only needs to cover what someone would actually ask a backend candidate. It
 * is a safety net, not the primary defence — the primary defence is that the corpus is
 * fully in context and the system prompt forbids unlisted technologies. Growing this
 * list is cheap and safe; shrinking it is not.
 */
const KNOWN_TECH = [
  // Frontend — the highest-risk category for this candidate specifically.
  'React', 'React Native', 'Next.js', 'Nuxt', 'Vue', 'Vue.js', 'Angular', 'Svelte',
  'SvelteKit', 'Solid.js', 'Ember', 'jQuery', 'Redux', 'Remix', 'Astro', 'Gatsby',
  'Webpack', 'Babel', 'Storybook', 'Three.js', 'D3.js', 'Bootstrap', 'Material UI',
  // Cloud and orchestration.
  'AWS', 'Amazon Web Services', 'EC2', 'S3', 'Lambda', 'GCP', 'Google Cloud', 'Azure',
  'Kubernetes', 'K8s', 'Helm', 'Terraform', 'Ansible', 'Pulumi', 'OpenShift', 'Nomad',
  'CloudFormation', 'Vagrant', 'Chef', 'Puppet',
  // Data and streaming.
  'Kafka', 'RabbitMQ', 'Pulsar', 'Flink', 'Spark', 'Hadoop', 'Airflow', 'dbt',
  'Snowflake', 'BigQuery', 'Redshift', 'Databricks', 'Cassandra', 'DynamoDB',
  'Elasticsearch', 'Neo4j', 'ClickHouse', 'DuckDB', 'CockroachDB',
  // ML — he does applied LLM work, not training. The distinction matters.
  'PyTorch', 'TensorFlow', 'Keras', 'JAX', 'scikit-learn', 'XGBoost', 'LightGBM',
  'Hugging Face Transformers', 'CUDA', 'MLflow', 'Kubeflow', 'Weights & Biases',
  'LangChain', 'LlamaIndex', 'Pinecone', 'Weaviate', 'Qdrant', 'Milvus',
  // Languages.
  'Java', 'Go', 'Golang', 'Rust', 'Ruby', 'PHP', 'Scala', 'Kotlin', 'Swift', 'Elixir',
  'Haskell', 'Perl', 'R', 'MATLAB', 'TypeScript', 'C#', '.NET',
  // Backend frameworks he has not used.
  'Spring', 'Spring Boot', 'Rails', 'Ruby on Rails', 'Laravel', 'Flask', 'NestJS',
  'Phoenix', 'Gin', 'Actix', 'ASP.NET',
  // Ops and tooling.
  'Jenkins', 'CircleCI', 'Travis CI', 'ArgoCD', 'Prometheus', 'Grafana', 'Datadog',
  'New Relic', 'Splunk', 'Nginx', 'Apache Kafka', 'HAProxy', 'Consul', 'Vault',
  'GraphQL', 'gRPC', 'Protobuf', 'WebRTC', 'Kubernetes Operators',
];

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function renderCorpus(doc) {
  const L = [];
  const p = doc.person;

  L.push('# Kshitij Tripathi — source of truth');
  L.push('');
  L.push('Every fact the agent may state is below. Each section is tagged with a node ID.');
  L.push('Cite the node ID of every fact you use. If something is not here, you do not know it.');
  L.push('');

  L.push('## Person');
  L.push(`- Name: ${p.name}`);
  L.push(`- Pronouns: ${p.pronouns}`);
  L.push(`- Email: ${p.email}`);
  if (p.location) L.push(`- Location: ${p.location}`);
  L.push(`- Headline: ${p.headline}`);
  for (const [k, v] of Object.entries(p.links ?? {})) {
    if (v) L.push(`- ${k}: ${v}`);
  }
  L.push('');

  L.push('## Education');
  for (const e of doc.education) {
    L.push(`### [${e.id}] ${e.degree}, ${e.institution}`);
    L.push(`${e.start} to ${e.end}${e.score ? `. ${e.score.type} ${e.score.value}` : ''}.`);
    L.push('');
  }

  L.push('## Experience');
  for (const x of doc.experience) {
    L.push(`### [${x.id}] ${x.role}, ${x.company}`);
    L.push(`${x.start} to ${x.end}${x.mode ? `, ${x.mode}` : ''}. Tech: ${(x.tech ?? []).join(', ')}.`);
    for (const b of x.bullets) L.push(`- [${b.id}] ${b.text}`);
    L.push('');
  }

  L.push('## Projects');
  for (const pr of doc.projects) {
    L.push(`### [${pr.id}] ${pr.name} — ${pr.one_liner}`);
    L.push(`Status: ${pr.status}. Tech: ${(pr.tech ?? []).join(', ')}.`);
    if (pr.url) L.push(`Live: ${pr.url}`);
    if (pr.repo) L.push(`Repo: ${pr.repo}`);
    for (const b of pr.bullets) L.push(`- [${b.id}] ${b.text}`);
    L.push('');
    L.push(`How he explains it out loud: ${pr.talk_track}`);
    L.push('');
  }

  L.push('## Skills — the authoritative allowlist');
  L.push('He may be described as familiar ONLY with what is listed here.');
  for (const [group, items] of Object.entries(doc.skills)) {
    L.push(`- ${group}: ${items.join(', ')}`);
  }
  L.push('');

  L.push('## Achievements');
  for (const a of doc.achievements) L.push(`- [${a.id}] ${a.text}`);
  L.push('');

  L.push('## Pre-approved answers');
  L.push('If the question matches one of these, use this answer.');
  for (const f of doc.faq) {
    L.push(`### [${f.id}] ${f.q.join(' / ')}`);
    L.push(f.a);
    L.push('');
  }

  return L.join('\n');
}

export function build(sourcePath) {
  const src = sourcePath ?? resolve(ROOT, 'content/content.snapshot.json');
  const doc = JSON.parse(readFileSync(src, 'utf8'));

  const { errors, warnings, nodeIds } = validateContent(doc);
  for (const w of warnings) console.log(`  warn  ${w}`);
  if (errors.length) {
    for (const e of errors) console.error(`  FAIL  ${e}`);
    throw new Error(`content validation failed with ${errors.length} error(s)`);
  }

  const corpus = renderCorpus(doc);

  // Rough token estimate. Deliberately conservative — chars/3.6 rather than /4, because
  // under-estimating here is what would let the corpus quietly outgrow the design.
  const approxTokens = Math.round(corpus.length / 3.6);

  const skillSet = new Set(Object.values(doc.skills).flat().map((s) => s.toLowerCase()));
  const banned = KNOWN_TECH.filter((t) => !skillSet.has(t.toLowerCase()));

  mkdirSync(resolve(ROOT, 'worker/grounding'), { recursive: true });
  writeFileSync(resolve(ROOT, 'content/corpus.md'), corpus, 'utf8');

  writeFileSync(
    resolve(ROOT, 'worker/grounding/banned.generated.js'),
    `// GENERATED by scripts/build-corpus.js — do not edit.\n` +
      `// Source: content/content.snapshot.json (schema_version ${doc.schema_version})\n` +
      `// Known technology terms MINUS the skills allowlist. Naming one of these in an\n` +
      `// answer means claiming experience Kshitij does not have.\n\n` +
      `export const BANNED_TECH = ${JSON.stringify(banned, null, 2)};\n\n` +
      `export const BANNED_TECH_RE = /\\b(?:${banned.map(escapeRegex).join('|')})\\b/i;\n\n` +
      `export const BANNED_TOPICS = ${JSON.stringify(doc.banned_topics, null, 2)};\n`,
    'utf8'
  );

  writeFileSync(
    resolve(ROOT, 'worker/grounding/corpus.generated.js'),
    `// GENERATED by scripts/build-corpus.js — do not edit.\n` +
      `// The ENTIRE corpus. It goes into the system prompt in full; there is no retrieval\n` +
      `// step. See docs/why-no-vector-db.md.\n\n` +
      `export const CORPUS = ${JSON.stringify(corpus)};\n\n` +
      `export const NODE_IDS = new Set(${JSON.stringify([...nodeIds].sort(), null, 2)});\n\n` +
      `export const CONTENT_VERSION = ${JSON.stringify(doc.schema_version)};\n` +
      `export const GENERATED_AT = ${JSON.stringify(doc.generated_at)};\n` +
      `export const APPROX_TOKENS = ${approxTokens};\n` +
      `export const FAQ = ${JSON.stringify(doc.faq.map((f) => ({ id: f.id, q: f.q, a: f.a })), null, 2)};\n` +
      `export const PROJECTS = ${JSON.stringify(
        doc.projects.map((p) => ({ id: p.id, name: p.name, one_liner: p.one_liner })), null, 2
      )};\n` +
      `export const PERSON = ${JSON.stringify(doc.person, null, 2)};\n`,
    'utf8'
  );

  return { approxTokens, nodeCount: nodeIds.size, bannedCount: banned.length, version: doc.schema_version };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const r = build(process.argv[2]);
  console.log(`  ok    corpus built — ${r.nodeCount} nodes, ~${r.approxTokens} tokens, ${r.bannedCount} banned terms, v${r.version}`);

  // The documented trigger for revisiting T-3.03 (build-time embeddings). Measured, not
  // guessed — see docs/why-no-vector-db.md.
  if (r.approxTokens > 15000) {
    console.error(
      `\n  STOP  corpus is ~${r.approxTokens} tokens, over the 15,000 threshold.\n` +
      '        Do NOT truncate it — a silently truncated corpus is a silent hallucination\n' +
      '        source. This is the documented trigger for task T-3.03.\n'
    );
    process.exit(1);
  }
  if (r.approxTokens > 12000) {
    console.log(`  warn  corpus is ~${r.approxTokens} tokens. Trim talk_track fields before it passes 15,000.`);
  }
}
