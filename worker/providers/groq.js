/**
 * Groq adapter (OpenAI-compatible chat completions).
 *
 * Groq rate limits are ORG-WIDE, not per-key. Creating more keys does not raise them.
 */

import { sseLines } from './gemini.js';

export async function* stream(prompt, { model, apiKey, endpoint, signal }) {
  const messages = [{ role: 'system', content: prompt.system }];
  for (const turn of prompt.history) {
    messages.push({ role: turn.role === 'assistant' ? 'assistant' : 'user', content: turn.text });
  }
  messages.push({ role: 'user', content: prompt.user });

  const res = await fetch(endpoint(model), {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    signal,
    body: JSON.stringify({ model, messages, stream: true, temperature: 0.3, max_tokens: 400 }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw Object.assign(new Error(`groq ${res.status}: ${body.slice(0, 200)}`), {
      status: res.status,
      retryable: res.status === 429 || res.status >= 500,
      modelMissing: res.status === 404 || /decommissioned|does not exist|deprecated/i.test(body),
    });
  }

  for await (const evt of sseLines(res.body)) {
    let parsed;
    try {
      parsed = JSON.parse(evt);
    } catch {
      continue;
    }
    const text = parsed?.choices?.[0]?.delta?.content ?? '';
    if (text) yield { type: 'delta', text };
  }
  yield { type: 'end' };
}
