import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyAnswer, earlyReject } from '../worker/grounding/verifier.js';
import { REFUSAL } from '../worker/constants.js';

const cited = (body, ids) => `${body}\nCITE: [${ids.join(', ')}]`;

test('accepts a grounded, cited answer', () => {
  const r = verifyAnswer(cited('He built async pipelines at Zhecker using Celery and Redis.', ['exp.zhecker.b2']));
  assert.equal(r.ok, true);
  assert.deepEqual(r.cited, ['exp.zhecker.b2']);
  assert.ok(!r.answer.includes('CITE:'), 'citation line must be stripped from the shown answer');
});

test('accepts multiple valid citations', () => {
  const r = verifyAnswer(cited('Hybrid retrieval with BM25 and re-ranking.', ['proj.docprocessor.b2', 'proj.docprocessor.b3']));
  assert.equal(r.ok, true);
  assert.equal(r.cited.length, 2);
});

test('accepts the refusal line uncited', () => {
  const r = verifyAnswer(REFUSAL);
  assert.equal(r.ok, true);
  assert.equal(r.answer, REFUSAL);
});

test('REJECTS a claim of a technology outside the skills allowlist', () => {
  for (const tech of ['React', 'Kubernetes', 'AWS', 'Next.js', 'PyTorch', 'Kafka', 'Terraform']) {
    const r = verifyAnswer(cited(`He has worked with ${tech} on several projects.`, ['exp.zhecker.b1']));
    assert.equal(r.ok, false, `${tech} must be rejected`);
    assert.equal(r.answer, REFUSAL);
  }
});

test('ACCEPTS technologies that ARE on the allowlist', () => {
  for (const tech of ['Celery', 'Redis', 'FastAPI', 'Django', 'PostgreSQL', 'ChromaDB', 'Docker']) {
    const r = verifyAnswer(cited(`He used ${tech} in production.`, ['exp.zhecker.b2']));
    assert.equal(r.ok, true, `${tech} must be accepted — it is on his skills list`);
  }
});

test('REJECTS an answer with no citation line', () => {
  const r = verifyAnswer('He is an excellent engineer with a strong background.');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'no_citation');
});

test('REJECTS a citation to a node that does not exist', () => {
  const r = verifyAnswer(cited('He led a team of twelve.', ['exp.fabricated.b9']));
  assert.equal(r.ok, false);
  assert.match(r.reason, /^invalid_citation/);
});

test('REJECTS invented quantities of experience', () => {
  for (const claim of [
    'He has 5 years of experience with backend systems.',
    'He has extensive experience in distributed systems.',
    'He is an expert in async architecture.',
  ]) {
    const r = verifyAnswer(cited(claim, ['exp.zhecker.b1']));
    assert.equal(r.ok, false, `must reject: ${claim}`);
  }
});

test('REJECTS unauthorised commitments', () => {
  for (const claim of [
    'I can start immediately.',
    'My notice period is 30 days.',
    'I am expecting 12 LPA.',
  ]) {
    const r = verifyAnswer(cited(claim, ['exp.zhecker.b1']));
    assert.equal(r.ok, false, `must reject: ${claim}`);
  }
});

test('REJECTS attempts to leak the system prompt', () => {
  const r = verifyAnswer(cited('ABSOLUTE RULES: every factual claim must come from...', ['exp.zhecker.b1']));
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'prompt_leak');
});

test('REJECTS empty and citation-only output', () => {
  assert.equal(verifyAnswer('').ok, false);
  assert.equal(verifyAnswer('   ').ok, false);
  assert.equal(verifyAnswer('CITE: [exp.zhecker.b1]').ok, false);
});

test('REJECTS an over-long answer', () => {
  const r = verifyAnswer(cited('word '.repeat(200), ['exp.zhecker.b1']));
  assert.equal(r.ok, false);
  assert.match(r.reason, /^too_long/);
});

test('every rejection returns the refusal text, never partial output', () => {
  const bad = [
    'no citation here',
    cited('He knows React.', ['exp.zhecker.b1']),
    cited('x', ['nope.nope']),
    '',
  ];
  for (const b of bad) {
    const r = verifyAnswer(b);
    assert.equal(r.ok, false);
    assert.equal(r.answer, REFUSAL, 'a rejected answer must never leak its own text');
    assert.deepEqual(r.cited, []);
  }
});

test('earlyReject catches violations mid-stream', () => {
  assert.ok(earlyReject('He has worked extensively with Kubernetes'));
  assert.ok(earlyReject('ABSOLUTE RULES'));
  assert.equal(earlyReject('He built async pipelines with Celery'), null);
});
