/**
 * Cloudflare Workers AI adapter — the third tier.
 *
 * Uses the `AI` binding rather than fetch, so it needs no API key and adds no new
 * failure domain to configure. 10,000 neurons/day free. Non-zero usage here means
 * Gemini and Groq are both failing.
 */

export async function* stream(prompt, { model, ai, signal: _signal }) {
  const messages = [{ role: 'system', content: prompt.system }];
  for (const turn of prompt.history) {
    messages.push({ role: turn.role === 'assistant' ? 'assistant' : 'user', content: turn.text });
  }
  messages.push({ role: 'user', content: prompt.user });

  if (!ai) {
    throw Object.assign(new Error('workers-ai: AI binding not configured'), { retryable: false });
  }

  const res = await ai.run(model, { messages, stream: true, max_tokens: 400, temperature: 0.3 });

  // The binding returns a ReadableStream of SSE when stream:true.
  const reader = res.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const parsed = JSON.parse(payload);
        if (parsed.response) yield { type: 'delta', text: parsed.response };
      } catch {
        /* partial frame; wait for more */
      }
    }
  }
  yield { type: 'end' };
}
