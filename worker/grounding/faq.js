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

  let best = null;
  for (const entry of FAQ) {
    for (const variant of entry.q) {
      const v = tokens(variant);
      if (v.size === 0) continue;
      let overlap = 0;
      for (const t of v) if (q.has(t)) overlap++;
      // Normalise by the FAQ variant's length: a short, specific variant matching fully
      // is a stronger signal than a long one matching partially.
      const score = overlap / v.size;
      if (!best || score > best.score) best = { id: entry.id, a: entry.a, score };
    }
  }

  // Threshold chosen to be conservative. A missed FAQ costs one model call; a wrong FAQ
  // answers a question the recruiter did not ask, which reads as broken.
  return best && best.score >= 0.6 ? best : null;
}
