import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchFaq } from '../worker/grounding/faq.js';

test('matches the banned-topic questions that must never reach a model', () => {
  for (const [q, id] of [
    ['What are your salary expectations?', 'faq.compensation'],
    ['What is your notice period?', 'faq.availability'],
    ['When can you start?', 'faq.availability'],
  ]) {
    const m = matchFaq(q);
    assert.ok(m, `no FAQ match for: ${q}`);
    assert.equal(m.id, id);
  }
});

test('matches the disqualifying-question set candidly', () => {
  const m = matchFaq('Do you know React?');
  assert.ok(m);
  assert.equal(m.id, 'faq.frontend');
  assert.match(m.a, /backend engineer/i);
});

test('matches factual lookups that need no model', () => {
  const m = matchFaq("What's your CGPA?");
  assert.ok(m);
  assert.equal(m.id, 'faq.education');
  assert.match(m.a, /8\.11/);
});

test('does NOT match open questions that deserve a real answer', () => {
  for (const q of [
    'Walk me through DocProcessor',
    'What was the hardest bug you fixed?',
    'Tell me about the retrieval design',
  ]) {
    assert.equal(matchFaq(q), null, `should not have matched: ${q}`);
  }
});

test('tolerates junk input', () => {
  assert.equal(matchFaq(''), null);
  assert.equal(matchFaq('   '), null);
  assert.equal(matchFaq('the a of in'), null);
});
