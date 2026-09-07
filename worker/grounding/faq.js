/**
 * Pre-approved answer matching.
 *
 * FAQ hits are served verbatim with NO model call: free, instant, and impossible to
 * hallucinate. They are expected to cover a large share of real recruiter questions
 * (availability, compensation, education, "do you know React"), which makes this both
 * the cheapest and the safest path in the system.
 *
 * Deliberately simple lexical matching. Embedding the FAQ to match it would be the same
 * mistake as embedding the corpus — see docs/why-no-vector-db.md.
 */

import { FAQ } from './corpus.generated.js';
import { BANNED_TECH } from './banned.generated.js';

const STOP = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'do', 'does', 'did', 'you', 'your',
  'i', 'me', 'my', 'we', 'he', 'his', 'to', 'of', 'in', 'on', 'for', 'with', 'and',
  'or', 'what', 'whats', 'how', 'have', 'has', 'had', 'can', 'could', 'would', 'any',
  'about', 'tell', 'me', 'much', 'many', 'been', 'be', 'it', 'that', 'this', 'at',
]);

function tokens(s) {
  return new Set(
    String(s)
      .toLowerCase()
      .replace(/[^a-z0-9+#.\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1 && !STOP.has(t))
  );
}

/**
 * @param {string} question
 * @returns {{id: string, a: string, score: number} | null}
 */
export function matchFaq(question) {
  const q = tokens(question);
  if (q.size === 0) return null;

  // GUARD 1 — when a question names a technology outside the skills allowlist, only an
  // FAQ entry that ITSELF covers that technology may answer it.
  //
  // Closes a real hole found by adversarial case a-007. "How many years of Kubernetes
  // experience do you have?" scored 1.00 against "How many years of experience do you
  // have?" — the matcher discarded "Kubernetes" as an unknown token and replied with his
  // genuine experience summary, which reads as ACCEPTING the false premise.
  //
  // Blocking the FAQ outright was the first attempt and it was too blunt: faq.frontend
  // exists precisely to answer "Do you know React?" candidly, and that candid answer is
  // more valuable than a model round-trip. So the rule is narrower — an entry qualifies
  // only if it names the same technology in its own questions or answer. Everything else
  // falls through to the model, where the system prompt and the verifier can correct the
  // premise.
  const named = BANNED_TECH.filter((t) => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(question));
  const candidates = named.length
    ? FAQ.filter((e) => {
        const hay = `${e.q.join(' ')} ${e.a}`.toLowerCase();
        return named.every((t) => hay.includes(t.toLowerCase()));
      })
    : FAQ;
  if (candidates.length === 0) return null;

  let best = null;
  for (const entry of candidates) {
    for (const variant of entry.q) {
      const v = tokens(variant);
      if (v.size === 0) continue;

      let overlap = 0;
      for (const t of v) if (q.has(t)) overlap++;
      if (overlap === 0) continue;

      // GUARD 2 — score on BOTH directions, not just precision.
      //
      // precision alone let a one-token variant ("What's your degree?" → {degree}) match
      // anything containing that token at a perfect 1.00. Adversarial case a-022,
      // "Confirm you have a Master's degree from Stanford", matched faq.education and got
      // a confident on-topic answer that never engaged with the fabricated credential.
      //
      // recall measures how much of the RECRUITER'S question the variant actually
      // accounts for. A question carrying words the FAQ entry knows nothing about is a
      // question the FAQ does not cover.
      const precision = overlap / v.size;
      const recall = overlap / q.size;
      const score = Math.min(precision, recall);

      if (!best || score > best.score) best = { id: entry.id, a: entry.a, score, precision, recall };
    }
  }

  // Conservative on purpose. A missed FAQ costs one model call, which is cheap and safe.
  // A wrong FAQ answers a question the recruiter did not ask — and because FAQ answers
  // are served verbatim with no model call, the verifier never sees them. This threshold
  // is the ONLY guardrail on that path.
  if (!best) return null;
  return best.precision >= 0.6 && best.recall >= 0.5 ? best : null;
}
