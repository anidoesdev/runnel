/**
 * Recursively redacts any object key that looks like it holds a secret, at any depth —
 * unlike pino's built-in `redact` option (backed by fast-redact), which only matches
 * specific static paths or a single wildcard segment, not "this key name wherever it
 * appears in an arbitrarily nested object". Used both as the logger's formatter (§12.7 —
 * credentials must never appear in logs) and available standalone for anything else that
 * serializes objects that might contain one (error payloads, etc).
 */
const SENSITIVE_KEY_PATTERN =
  /password|passwordhash|token|apikey|api_key|secret|authorization|clientsecret|client_secret/i;

const REDACTED = '[Redacted]';

export function redactSecrets(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (Array.isArray(value)) return value.map((entry) => redactSecrets(entry, seen));

  if (value !== null && typeof value === 'object') {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);

    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : redactSecrets(entry, seen);
    }
    return result;
  }

  return value;
}
