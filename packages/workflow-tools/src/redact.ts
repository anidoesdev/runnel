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

const REDACTED_TEXT = '[redacted]';

/** Value shapes that are secrets wherever they appear, whatever (if anything) they're labelled. */
const SECRET_VALUE_PATTERNS: Array<[RegExp, string]> = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, REDACTED_TEXT],
  [/\beyJ[A-Za-z0-9_-]{5,}\.eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g, REDACTED_TEXT],
  [/\b(Bearer|Basic)\s+[A-Za-z0-9\-._~+/]{8,}=*/gi, `$1 ${REDACTED_TEXT}`],
  [/\b(?:sk|rk|pk)[-_](?:live[-_]|test[-_])?[A-Za-z0-9_-]{16,}/g, REDACTED_TEXT],
  [/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, REDACTED_TEXT],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}/g, REDACTED_TEXT],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/g, REDACTED_TEXT],
  [/\bAIza[0-9A-Za-z_-]{35}\b/g, REDACTED_TEXT],
  // Connection strings with inline credentials: postgres://user:pass@host → postgres://user:[redacted]@host
  [/\b([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)[^\s@/]+@/gi, `$1${REDACTED_TEXT}@`],
  // "my password is hunter2"
  [/\b(pass(?:word|code|phrase)|secret|api[ _]?key|token)(\s+(?:is|was)\s+)\S+/gi, `$1$2${REDACTED_TEXT}`],
];

/** `apiKey: "x"`, `"password": "x"`, `token=x` — a secret-shaped label followed by its value, in JSON, YAML, env files or prose. */
const LABELLED_VALUE = /(["']?)([A-Za-z][A-Za-z0-9_.-]{0,63})\1(\s*[:=]\s*)("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|[^\s,;}\]]+)/g;

/**
 * redactDeep's counterpart for free text: it walks object keys, which does nothing for a
 * string — and transcript text (a user pasting a key into chat, an assistant message quoting a
 * JSON blob) is exactly where a credential reaches anything that stores or logs messages.
 * Biased toward over-redaction: a lost word costs less than a persisted credential.
 */
export function redactText(text: string): string {
  let out = text;
  for (const [pattern, replacement] of SECRET_VALUE_PATTERNS) out = out.replace(pattern, replacement);
  return out.replace(LABELLED_VALUE, (match, quote: string, key: string, separator: string, value: string) => {
    // An unquoted value stops at `]`, so an already-redacted one arrives as "[redacted" — leave it be.
    if (!SECRET_KEY_PATTERN.test(key) || value.replace(/^["']/, '').startsWith('[redacted')) return match;
    const replacement = value.startsWith('"') ? `"${REDACTED_TEXT}"` : value.startsWith("'") ? `'${REDACTED_TEXT}'` : REDACTED_TEXT;
    return `${quote}${key}${quote}${separator}${replacement}`;
  });
}
