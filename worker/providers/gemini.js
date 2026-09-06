/**
 * Gemini adapter. Emits the normalised chunk shape every provider shares:
 *   { type: 'delta', text } | { type: 'end' }
 *
 * No provider conditionals may leak outside this directory.
 */

/**
 * @param {{system: string, user: string, history: Array<{role: string, text: string}>}} prompt
 * @returns {AsyncGenerator<{type: 'delta'|'end', text?: string}>}
 */
export async function* stream(prompt, { model, apiKey, endpoint, signal }) {
  const contents = [];
  for (const turn of prompt.history) {
    contents.push({ role: turn.role === 'assistant' ? 'model' : 'user', parts: [{ text: turn.text }] });
  }
  contents.push({ role: 'user', parts: [{ text: prompt.user }] });

  const res = await fetch(endpoint(model), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
    signal,
    body: JSON.stringify({
      contents,
      systemInstruction: { parts: [{ text: prompt.system }] },
      generationConfig: { temperature: 0.3, maxOutputTokens: 400 },
      // The corpus is the only source of truth; safety blocks here would surface as an
      // empty answer, which the verifier would then treat as a refusal anyway.
      safetySettings: [],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw Object.assign(new Error(`gemini ${res.status}: ${body.slice(0, 200)}`), {
      status: res.status,
      retryable: res.status === 429 || res.status >= 500,
      modelMissing: res.status === 404 || /not found|not supported/i.test(body),
    });
  }

  for await (const evt of sseLines(res.body)) {
    let parsed;
    try {
      parsed = JSON.parse(evt);
    } catch {
      continue;
    }
    const text = parsed?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    if (text) yield { type: 'delta', text };
  }
  yield { type: 'end' };
}

/** Yields the `data:` payload of each SSE event. Shared shape with the Groq adapter. */
export async function* sseLines(body) {
  const reader = body.getReader();
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
      if (line.startsWith('data:')) {
        const payload = line.slice(5).trim();
        if (payload && payload !== '[DONE]') yield payload;
      }
    }
  }
}
