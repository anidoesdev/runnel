/** Key names treated as secret-shaped wherever a value is redacted before it's allowed into the assistant transcript or a get_node_output sample — Part 5 Safety's "credential values never enter the transcript". Matched case-insensitively as a substring, not just an exact key name, since a real API's field naming varies (`apiKey`, `api_key`, `Authorization`, ...). */
const SECRET_KEY_PATTERN = /password|secret|token|apikey|api_key|authorization|credential/i;

/**
 * Recursively replaces any object key matching SECRET_KEY_PATTERN with a fixed placeholder,
 * anywhere in an arbitrary JSON-shaped value — objects, arrays, and everything nested inside
 * them. The one generic redaction pass every tool result is put through before it can enter
 * `session.messages` (see agent-loop.ts) or a live SSE event, so a future tool that happens to
 * echo back something secret-shaped (a credential id's containing object, an API response that
 * mirrors the auth header it received) is caught here rather than relying on every individual
 * tool handler to remember to scrub itself.
 */
export function redactDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => redactDeep(entry)) as T;
  }
  if (value !== null && typeof value === 'object') {
    const redacted: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      redacted[key] = SECRET_KEY_PATTERN.test(key) ? '[redacted]' : redactDeep(entry);
    }
    return redacted as T;
  }
  return value;
}
