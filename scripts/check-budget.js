/**
 * Payload budget enforcement (PRD §11.2). The build FAILS on a breach.
 *
 * A budget that only warns is a budget that gets ignored. The recruiter is on a phone on
 * mobile data with about eight seconds of attention — bytes are the product.
 */

import { readdirSync, statSync, existsSync, readFileSync } from 'node:fs';
import { resolve, dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'dist');
const MEDIA = resolve(ROOT, 'public/media');

const KB = 1024;
const BUDGETS = {
  html: 8 * KB,
  css: 12 * KB,
  js: 100 * KB,
  initialTotal: 120 * KB, // gzipped, everything needed for first meaningful frame
};
const MEDIA_BUDGETS = {
  'poster.webp': 40 * KB,
  'idle.webm': 400 * KB,
  'idle.mp4': 500 * KB,
  'intro.mp4': 1200 * KB,
};

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const fmt = (n) => `${(n / KB).toFixed(1)} KB`;
let failed = false;
const rows = [];

if (!existsSync(DIST)) {
  console.error('  skip  dist/ not found — run `npm run build` first.');
  process.exit(0);
}

const byType = { html: 0, css: 0, js: 0 };
for (const file of walk(DIST)) {
  const ext = extname(file).slice(1);
  if (!['html', 'css', 'js'].includes(ext)) continue;
  const gz = gzipSync(readFileSync(file)).length;
  byType[ext] += gz;
}

for (const [type, budget] of Object.entries(BUDGETS)) {
  if (type === 'initialTotal') continue;
  const used = byType[type];
  const ok = used <= budget;
  if (!ok) failed = true;
  rows.push([`${type} (gz)`, fmt(used), fmt(budget), ok ? 'ok' : 'OVER']);
}

const total = byType.html + byType.css + byType.js;
const totalOk = total <= BUDGETS.initialTotal;
if (!totalOk) failed = true;
rows.push(['initial total (gz)', fmt(total), fmt(BUDGETS.initialTotal), totalOk ? 'ok' : 'OVER']);

for (const [name, budget] of Object.entries(MEDIA_BUDGETS)) {
  const p = join(MEDIA, name);
  if (!existsSync(p)) {
    rows.push([name, '—', fmt(budget), 'missing (T-1.19)']);
    continue;
  }
  const size = statSync(p).size;
  const ok = size <= budget;
  if (!ok) failed = true;
  rows.push([name, fmt(size), fmt(budget), ok ? 'ok' : 'OVER']);
}

const w = [22, 12, 12, 16];
console.log('\nPAYLOAD BUDGET');
for (const r of rows) {
  console.log('  ' + r.map((c, i) => String(c).padEnd(w[i])).join(''));
}

if (failed) {
  console.error(
    '\n  FAIL  over budget. Do not raise the budget — reduce the payload.\n' +
    '        A recruiter on 4G with 8 seconds of attention is the constraint (PRD §11.2).\n'
  );
  process.exit(1);
}
console.log('\n  ok    within budget\n');
