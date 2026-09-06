/**
 * SSE consumption for /api/ask.
 *
 * The Worker buffers and verifies before emitting, so what arrives here is a single
 * cleared `answer` event rather than raw model deltas. The client is deliberately
 * incurious about that: it renders whatever text event it is given and never
 * reconstructs an answer from fragments.
 */

/**
 * @param {{token: string|null, sid: string, text: string, history: Array}} req
 * @param {{onAnswer: Function, onCitation: Function, onDone: Function, onError: Function}} handlers
 */
export async function ask(req, handlers, signal) {
  let res;
  try {
    res = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
      signal,
    });
  } catch {
    handlers.onError({ code: 'network', fallback_text: "I couldn't reach the server. Kshitij is at kttripathi317@gmail.com." });
    handlers.onDone({});
    return;
  }

  // 429 and friends arrive as JSON, not SSE. Both carry fallback_text.
  if (!res.ok && !res.headers.get('content-type')?.includes('event-stream')) {
    const j = await res.json().catch(() => ({}));
    handlers.onError({
      code: j.error ?? String(res.status),
      fallback_text: j.fallback_text ?? "Something went wrong. Kshitij is at kttripathi317@gmail.com.",
    });
    handlers.onDone({});
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const frame = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const line = frame.split('\n').find((l) => l.startsWith('data:'));
        if (!line) continue;

        let evt;
        try {
          evt = JSON.parse(line.slice(5).trim());
        } catch {
          continue;
        }

        if (evt.type === 'answer') handlers.onAnswer(evt.text);
        else if (evt.type === 'citation') handlers.onCitation(evt.nodes ?? []);
        else if (evt.type === 'error') handlers.onError(evt);
        else if (evt.type === 'done') handlers.onDone(evt);
      }
    }
  } catch (err) {
    if (err?.name === 'AbortError') return;
    // A mid-stream disconnect must never leave the panel empty.
    handlers.onError({ code: 'stream_broken', fallback_text: 'That answer got cut off. Try asking again.' });
    handlers.onDone({});
  }
}
