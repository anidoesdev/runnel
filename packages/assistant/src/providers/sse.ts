/**
 * Parses a `text/event-stream` response body into individual `data:` payloads, one string per
 * SSE event (OpenAI sends one JSON object per event, terminated by a literal `data: [DONE]`).
 * Deliberately minimal — no `event:`/`id:`/retry handling, since the OpenAI chat-completions
 * stream never uses them.
 */
export async function* parseSseDataLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';

      for (const event of events) {
        for (const line of event.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const data = line.slice('data:'.length).trim();
          if (data === '[DONE]') return;
          if (data.length > 0) yield data;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
