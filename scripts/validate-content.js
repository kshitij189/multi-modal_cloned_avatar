/**
 * Validates a content-contract document.
 *
 * This is not a full JSON Schema engine — content/schema.json remains the documented
 * contract, and a general engine would be a dependency for no benefit. The checks that
 * actually protect the agent are semantic (node-ID stability, skills completeness) and
 * JSON Schema cannot express them anyway.
 *
 * Usage: node scripts/validate-content.js <fetched.json> [--against <current-snapshot.json>]
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const NODE_ID = /^[a-z]+\.[a-z0-9_]+(\.[a-z0-9_]+)*$/;
const YEAR_MONTH = /^\d{4}-\d{2}$/;
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

/** @returns {{errors: string[], warnings: string[], nodeIds: Set<string>}} */
export function validateContent(doc, previous = null) {
  const errors = [];
  const warnings = [];
  const nodeIds = new Set();

  const req = (obj, keys, where) => {
    for (const k of keys) {
      if (obj?.[k] === undefined || obj?.[k] === null) errors.push(`${where}: missing required "${k}"`);
    }
  };

  // --- top level
  req(doc, ['schema_version', 'generated_at', 'person', 'education', 'experience',
    'projects', 'skills', 'achievements', 'faq', 'banned_topics'], 'root');
  if (doc.schema_version && !SEMVER.test(doc.schema_version)) {
    errors.push(`root: schema_version "${doc.schema_version}" is not semver`);
  }

  // --- person
  req(doc.person, ['name', 'email', 'pronouns', 'headline'], 'person');
  if (doc.person?.email && !doc.person.email.includes('@')) errors.push('person.email is not an email');

  // --- node-bearing collections
  const collectNode = (node, where) => {
    if (!node?.id) { errors.push(`${where}: missing id`); return; }
    if (!NODE_ID.test(node.id)) errors.push(`${where}: id "${node.id}" does not match the node-ID pattern`);
    if (nodeIds.has(node.id)) errors.push(`${where}: duplicate node id "${node.id}"`);
    nodeIds.add(node.id);
  };

  for (const [i, e] of (doc.education ?? []).entries()) {
    collectNode(e, `education[${i}]`);
    req(e, ['institution', 'degree', 'start', 'end'], `education[${i}]`);
    for (const f of ['start', 'end']) {
      if (e[f] && !YEAR_MONTH.test(e[f])) errors.push(`education[${i}].${f} must be YYYY-MM`);
    }
  }

  for (const [i, x] of (doc.experience ?? []).entries()) {
    collectNode(x, `experience[${i}]`);
    req(x, ['company', 'role', 'start', 'end', 'bullets'], `experience[${i}]`);
    for (const [j, b] of (x.bullets ?? []).entries()) {
      collectNode(b, `experience[${i}].bullets[${j}]`);
      if (!b.text) errors.push(`experience[${i}].bullets[${j}]: empty text`);
    }
    if ((x.bullets ?? []).length === 0) errors.push(`experience[${i}]: needs at least one bullet`);
  }

  for (const [i, p] of (doc.projects ?? []).entries()) {
    collectNode(p, `projects[${i}]`);
    req(p, ['name', 'one_liner', 'status', 'bullets', 'tech', 'talk_track'], `projects[${i}]`);
    if (p.talk_track && p.talk_track.length > 900) {
      errors.push(`projects[${i}].talk_track is ${p.talk_track.length} chars (max 900)`);
    }
    for (const [j, b] of (p.bullets ?? []).entries()) {
      collectNode(b, `projects[${i}].bullets[${j}]`);
    }
  }

  for (const [i, a] of (doc.achievements ?? []).entries()) {
    collectNode(a, `achievements[${i}]`);
    if (!a.text) errors.push(`achievements[${i}]: empty text`);
  }

  for (const [i, f] of (doc.faq ?? []).entries()) {
    collectNode(f, `faq[${i}]`);
    if (!Array.isArray(f.q) || f.q.length === 0) errors.push(`faq[${i}]: needs at least one question form`);
    if (!f.a) errors.push(`faq[${i}]: empty answer`);
  }

  // --- skills allowlist completeness
  // A project claiming a technology the skills list omits is a GROUNDING HOLE: the
  // verifier would reject an honest answer about that project's own stack.
  const skillSet = new Set(
    Object.values(doc.skills ?? {}).flat().map((s) => String(s).toLowerCase())
  );
  if (skillSet.size === 0) errors.push('skills: allowlist is empty');

  const techUsers = [...(doc.experience ?? []), ...(doc.projects ?? [])];
  for (const item of techUsers) {
    for (const t of item.tech ?? []) {
      if (!skillSet.has(String(t).toLowerCase())) {
        errors.push(`${item.id}: tech "${t}" is not in the skills allowlist — the verifier would refuse to discuss it`);
      }
    }
  }

  if (!Array.isArray(doc.banned_topics) || doc.banned_topics.length === 0) {
    errors.push('banned_topics: must be a non-empty array');
  }

  // --- node-ID stability against the current snapshot
  if (previous) {
    const prevIds = new Set();
    const walk = (n) => {
      if (Array.isArray(n)) return n.forEach(walk);
      if (n && typeof n === 'object') {
        if (typeof n.id === 'string' && NODE_ID.test(n.id)) prevIds.add(n.id);
        Object.values(n).forEach(walk);
      }
    };
    walk(previous);
    for (const id of prevIds) {
      if (!nodeIds.has(id)) {
        errors.push(
          `NODE ID REMOVED: "${id}" existed in the current snapshot and is gone. ` +
          'Answers cite node IDs — this invalidates every citation pointing at it. ' +
          'Treat as a MAJOR change regardless of the version string (see rebuild-knowledge-index).'
        );
      }
    }
    const added = [...nodeIds].filter((id) => !prevIds.has(id));
    if (added.length) warnings.push(`${added.length} new node id(s): ${added.slice(0, 8).join(', ')}${added.length > 8 ? '…' : ''}`);
  }

  return { errors, warnings, nodeIds };
}

/** Compares two semver strings. @returns {'same'|'patch'|'minor'|'major'|'unknown'} */
export function versionChange(from, to) {
  const a = SEMVER.exec(from ?? '');
  const b = SEMVER.exec(to ?? '');
  if (!a || !b) return 'unknown';
  if (a[0] === b[0]) return 'same';
  if (a[1] !== b[1]) return 'major';
  if (a[2] !== b[2]) return 'minor';
  return 'patch';
}

// --- CLI
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: node scripts/validate-content.js <file.json> [--against <snapshot.json>]');
    process.exit(2);
  }
  const doc = JSON.parse(readFileSync(file, 'utf8'));

  const againstIdx = process.argv.indexOf('--against');
  let previous = null;
  if (againstIdx > -1 && process.argv[againstIdx + 1] && existsSync(process.argv[againstIdx + 1])) {
    previous = JSON.parse(readFileSync(process.argv[againstIdx + 1], 'utf8'));
  }

  const { errors, warnings, nodeIds } = validateContent(doc, previous);
  for (const w of warnings) console.log(`  warn  ${w}`);
  for (const e of errors) console.error(`  FAIL  ${e}`);

  if (errors.length) {
    console.error(`\n${errors.length} error(s). Snapshot NOT written.`);
    process.exit(1);
  }
  console.log(`  ok    ${nodeIds.size} node ids, schema_version ${doc.schema_version}`);
}
