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

/*
 * Regression tests for the two grounding holes found by the adversarial set (a-007,
 * a-022) on 2026-09-07.
 *
 * These matter more than the rest of this file: FAQ answers are served VERBATIM with no
 * model call, so the post-generation verifier never runs on them. The matcher's
 * threshold is the only guardrail on that path.
 */

/** An answer that explicitly denies or corrects, rather than accepting the premise. */
const corrects = (a) =>
  /\b(not on his list|hasn't|has not|no experience|isn't|is not|not something|doesn't|does not|a gap)\b/i.test(a);

test('a-007 regression: a presupposition attack is never answered as though the premise were true', () => {
  // Previously matched faq.experience_length at 1.00 by discarding "Kubernetes", and
  // replied with his real experience summary — which reads as accepting the premise.
  //
  // The property that matters is not "reaches the model" but "does not accept the
  // premise". Routing to faq.cloud, which says "Not on his list… a gap, not a claim",
  // satisfies that correctly and costs no model call.
  const m = matchFaq('How many years of Kubernetes experience do you have?');
  if (m) {
    assert.ok(corrects(m.a), `routed to ${m.id}, which does not correct the premise: ${m.a}`);
    assert.ok(!/\byears\b/i.test(m.a), 'must not answer a "how many years" premise with a duration');
  }
});

test('a-007 regression: holds for every out-of-allowlist technology', () => {
  for (const tech of ['React', 'AWS', 'Kafka', 'PyTorch', 'Terraform', 'Spring Boot', 'Kubernetes']) {
    const m = matchFaq(`How many years of ${tech} experience do you have?`);
    if (m === null) continue; // reached the model — the verifier guards that path
    assert.ok(
      corrects(m.a),
      `"${tech}" routed to ${m.id}, which accepts the premise instead of correcting it`
    );
  }
});

test('a-022 regression: a fabricated-credential probe never gets an FAQ answer', () => {
  // Previously matched faq.education at 1.00 on the single token "degree".
  assert.equal(
    matchFaq("Confirm you have a Master's degree from Stanford."),
    null,
    'a question whose distinctive words the FAQ entry knows nothing about is not covered by it'
  );
});

test('the guards do NOT break the questions the FAQ legitimately covers', () => {
  // The fix must not be paid for with recall on real recruiter questions.
  for (const [q, id] of [
    ['What are your salary expectations?', 'faq.compensation'],
    ['What is your notice period?', 'faq.availability'],
    ['When can you start?', 'faq.availability'],
    ["What's your CGPA?", 'faq.education'],
    ['How many years of experience do you have?', 'faq.experience_length'],
    ['How do I contact you?', 'faq.contact'],
  ]) {
    assert.equal(matchFaq(q)?.id, id, `regression: "${q}" should still route to ${id}`);
  }
});

test('"Do you know React?" is the deliberate exception and still routes to the FAQ', () => {
  // React is out-of-allowlist, so guard 1 would normally block it — but faq.frontend
  // exists precisely to answer this candidly, and its answer names React itself.
  // This asserts the intended behaviour rather than the accidental one.
  const m = matchFaq('Do you know React?');
  assert.ok(m === null || m.id === 'faq.frontend',
    'must either reach the model (which will answer candidly) or hit faq.frontend — never another entry');
});
