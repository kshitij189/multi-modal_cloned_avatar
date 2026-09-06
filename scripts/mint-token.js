/**
 * Mints a personalised recruiter token.
 *
 * Budget: 30 seconds of Kshitij's attention. He is mid-email. This script asks nothing
 * and prints one URL.
 *
 * Usage:
 *   node scripts/mint-token.js --name Neha --company Northbound \
 *     --role "Platform Engineer" --lead-project proj.docprocessor \
 *     --opening-line "Hi Neha — thanks for opening this..." \
 *     [--jd-point "..."] [--host https://kshitij-agent.pages.dev] [--dry-run]
 */

import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOKEN_TTL_SECONDS } from '../worker/constants.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function args() {
  const out = { jdPoints: [] };
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    const k = a[i];
    if (k === '--jd-point') out.jdPoints.push(a[++i]);
    else if (k === '--dry-run') out.dryRun = true;
    else if (k.startsWith('--')) out[k.slice(2).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = a[++i];
  }
  return out;
}

/**
 * URL-safe, non-sequential, and NOT derived from the recruiter's name — a token
 * containing their name would leak it in the URL bar and in link previews.
 */
function mintId() {
  return randomBytes(8).toString('base64url').replace(/[-_]/g, 'A').slice(0, 10);
}

const a = args();
for (const req of ['name', 'company', 'role']) {
  if (!a[req]) {
    console.error(`missing --${req}\n\nusage: node scripts/mint-token.js --name Neha --company Northbound --role "Platform Engineer"`);
    process.exit(2);
  }
}

const id = mintId();
const now = Math.floor(Date.now() / 1000);
const host = a.host ?? 'https://kshitij-agent.pages.dev';

const openingLine =
  a.openingLine ??
  `Hi ${a.name} — thanks for opening this. I'm Kshitij, and this is an AI version of me built to walk you through my work for the ${a.role} role at ${a.company}.`;

const words = openingLine.split(/\s+/).length;
if (words > 22) {
  console.error(`  warn  opening line is ${words} words. It is spoken in the first 8 seconds — trim it.`);
}

const payload = {
  v: 1,
  name: a.name,
  company: a.company,
  role: a.role,
  jd_points: a.jdPoints.slice(0, 5),
  lead_project: a.leadProject ?? 'proj.docprocessor',
  opening_line: openingLine,
  opening_audio_b64: null, // v1: Chatterbox renders the ~2s greeting fragment here
  created_at: now,
  expires_at: now + TOKEN_TTL_SECONDS,
};

// jd_points are HIS private notes about their role. A forwarded link exposes them to
// whoever receives it — worth one warning, every time.
if (payload.jd_points.length) {
  console.error('  note  jd_points are visible to anyone the link is forwarded to. Keep them factual.');
}

if (a.dryRun) {
  console.log(JSON.stringify(payload, null, 2));
  console.log(`\n${host}/hi/${id}   (dry run — nothing written)`);
  process.exit(0);
}

try {
  execFileSync(
    'npx',
    ['wrangler', 'kv', 'key', 'put', '--binding=TOKENS', `tok:${id}`, JSON.stringify(payload),
      '--expiration-ttl', String(TOKEN_TTL_SECONDS), '--remote'],
    { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'], shell: process.platform === 'win32' }
  );
} catch {
  console.error('\nKV write failed. Check `npx wrangler login`, and that TOKENS is set in wrangler.toml.');
  console.error('If this is a quota error: KV allows 1,000 writes/day. Something writing to KV on a');
  console.error('request path would be a bug, not a quota problem — investigate before retrying.');
  process.exit(1);
}

// Local-only outreach log. Gitignored — it holds recruiter names.
const csv = resolve(ROOT, 'outreach.csv');
if (!existsSync(csv)) writeFileSync(csv, 'date,token,name,company,role,replied\n', 'utf8');
appendFileSync(csv, `${new Date().toISOString().slice(0, 10)},${id},"${a.name}","${a.company}","${a.role}",\n`, 'utf8');

const url = `${host}/hi/${id}`;
console.log(`
${url}

Suggested email line:
I built a zero-cost realtime multimodal agent that walks through my work —
architecture writeup in the repo. Here's a version set up for you: ${url}

Token: ${id}   Expires: ${new Date(payload.expires_at * 1000).toISOString().slice(0, 10)}   Leading with: ${payload.lead_project}
`);
