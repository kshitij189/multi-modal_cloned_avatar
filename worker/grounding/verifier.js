/**
 * Post-generation verifier. Fails closed.
 *
 * A refusal is always safe. A hallucination is not. Those two facts are not symmetric
 * and this file is written accordingly: every ambiguous case rejects.
 *
 * Runs on buffered sentences inside the Worker's 10ms CPU budget — regex scans over a
 * few hundred bytes, no allocation of consequence.
 */

import { BANNED_TECH_RE } from './banned.generated.js';
import { NODE_IDS } from './corpus.generated.js';
import { LIMITS, REFUSAL } from '../constants.js';

const CITE_RE = /CITE:\s*\[([^\]]*)\]\s*$/im;

/** Phrases that mean the model is inventing a quantity of experience. */
const INVENTED_EXPERIENCE_RE =
  /\b(\d+\+?\s*(?:years?|yrs?)\s+(?:of\s+)?experience|years of experience with|extensive experience (?:in|with)|expert(?:ise)? (?:in|with)|deep experience)\b/i;

/** Commitments he has not authorised the agent to make. */
const COMMITMENT_RE =
  /\b(?:i can (?:start|join)|available (?:from|immediately|to start)|my notice period|i(?:'m| am) (?:expecting|looking for)\s*(?:₹|\$|inr|usd|\d)|lpa\b|ctc\b|salary expectation)/i;

/** Attempts to make the agent leak its own instructions. */
const PROMPT_LEAK_RE = /(ABSOLUTE RULES|--- CONTENT|<<<QUESTION|system prompt|my instructions are)/i;

/**
 * @param {string} text  The complete generated answer.
 * @returns {{ok: boolean, reason?: string, answer: string, cited: string[]}}
 */
export function verifyAnswer(text) {
  const raw = (text ?? '').trim();

  if (!raw) {
    return { ok: false, reason: 'empty', answer: REFUSAL, cited: [] };
  }

  // An exact refusal is always allowed through, uncited.
  if (raw === REFUSAL || raw.startsWith(REFUSAL)) {
    return { ok: true, answer: REFUSAL, cited: [] };
  }

  if (PROMPT_LEAK_RE.test(raw)) {
    return { ok: false, reason: 'prompt_leak', answer: REFUSAL, cited: [] };
  }

  const banned = BANNED_TECH_RE.exec(raw);
  if (banned) {
    return { ok: false, reason: `banned_tech:${banned[0]}`, answer: REFUSAL, cited: [] };
  }

  if (INVENTED_EXPERIENCE_RE.test(raw)) {
    return { ok: false, reason: 'invented_experience', answer: REFUSAL, cited: [] };
  }

  if (COMMITMENT_RE.test(raw)) {
    return { ok: false, reason: 'unauthorised_commitment', answer: REFUSAL, cited: [] };
  }

  const m = CITE_RE.exec(raw);
  if (!m) {
    // A factual answer with no citation line cannot be checked, so it does not ship.
    return { ok: false, reason: 'no_citation', answer: REFUSAL, cited: [] };
  }

  const cited = m[1]
    .split(',')
    .map((s) => s.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);

  if (cited.length === 0) {
    return { ok: false, reason: 'empty_citation', answer: REFUSAL, cited: [] };
  }

  const invalid = cited.filter((id) => !NODE_IDS.has(id));
  if (invalid.length) {
    // A cited node that does not exist means the model invented a source.
    return { ok: false, reason: `invalid_citation:${invalid.join('|')}`, answer: REFUSAL, cited: [] };
  }

  const answer = raw.slice(0, m.index).trim();
  if (!answer) {
    return { ok: false, reason: 'citation_only', answer: REFUSAL, cited: [] };
  }

  const words = answer.split(/\s+/).length;
  if (words > LIMITS.maxAnswerWords * 1.5) {
    // Hard cap. A long answer is a symptom — usually the model wandering off the corpus.
    return { ok: false, reason: `too_long:${words}`, answer: REFUSAL, cited: [] };
  }

  return { ok: true, answer, cited };
}

/**
 * Streaming guard. The client must never see text the verifier has not cleared, so the
 * answer path buffers and calls verifyAnswer() at the end rather than forwarding raw
 * deltas. This runs on partial text to abort EARLY on an obvious violation — it is an
 * optimisation, not the guarantee.
 */
export function earlyReject(partial) {
  if (PROMPT_LEAK_RE.test(partial)) return 'prompt_leak';
  const banned = BANNED_TECH_RE.exec(partial);
  if (banned) return `banned_tech:${banned[0]}`;
  if (COMMITMENT_RE.test(partial)) return 'unauthorised_commitment';
  return null;
}
