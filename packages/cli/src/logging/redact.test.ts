import { describe, expect, it } from 'vitest';
import { redactSecrets } from './redact.js';

describe('redactSecrets', () => {
  it('redacts a top-level sensitive field', () => {
    expect(redactSecrets({ password: 'hunter2', email: 'a@example.com' })).toEqual({
      password: '[Redacted]',
      email: 'a@example.com',
    });
  });

  it('redacts sensitive fields at arbitrary depth', () => {
    const input = { user: { credentials: { apiKey: 'sk-123', name: 'ok' } } };
    expect(redactSecrets(input)).toEqual({ user: { credentials: { apiKey: '[Redacted]', name: 'ok' } } });
  });

  it('redacts sensitive fields inside arrays', () => {
    const input = [{ token: 'abc' }, { token: 'def', id: 1 }];
    expect(redactSecrets(input)).toEqual([{ token: '[Redacted]' }, { token: '[Redacted]', id: 1 }]);
  });

  it('matches common sensitive key spellings case-insensitively', () => {
    const input = {
      PASSWORD: 'x',
      passwordHash: 'y',
      Authorization: 'Bearer z',
      client_secret: 'w',
      API_KEY: 'v',
    };
    const result = redactSecrets(input) as Record<string, string>;
    for (const key of Object.keys(input)) expect(result[key]).toBe('[Redacted]');
  });

  it('leaves non-sensitive values untouched', () => {
    expect(redactSecrets({ id: 1, name: 'ok', nested: { count: 2 } })).toEqual({
      id: 1,
      name: 'ok',
      nested: { count: 2 },
    });
  });

  it('does not infinite-loop on a circular reference', () => {
    const obj: Record<string, unknown> = { name: 'x' };
    obj.self = obj;
    expect(redactSecrets(obj)).toEqual({ name: 'x', self: '[Circular]' });
  });

  it('passes primitives through unchanged', () => {
    expect(redactSecrets('plain string')).toBe('plain string');
    expect(redactSecrets(42)).toBe(42);
    expect(redactSecrets(null)).toBe(null);
    expect(redactSecrets(undefined)).toBe(undefined);
  });
});
