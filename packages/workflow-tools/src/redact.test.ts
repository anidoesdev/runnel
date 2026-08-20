import { describe, expect, it } from 'vitest';
import { redactDeep } from './redact.js';

describe('redactDeep', () => {
  it('replaces a top-level secret-shaped key with a placeholder', () => {
    expect(redactDeep({ apiKey: 'sk-123', name: 'ok' })).toEqual({ apiKey: '[redacted]', name: 'ok' });
  });

  it('matches key names case-insensitively and by substring', () => {
    expect(redactDeep({ Authorization: 'Bearer x', userToken: 'y', PASSWORD: 'z', credentialId: 'c1' })).toEqual({
      Authorization: '[redacted]',
      userToken: '[redacted]',
      PASSWORD: '[redacted]',
      credentialId: '[redacted]',
    });
  });

  it('redacts nested objects at any depth', () => {
    expect(redactDeep({ a: { b: { c: { apiKey: 'x' } } } })).toEqual({ a: { b: { c: { apiKey: '[redacted]' } } } });
  });

  it('redacts secret-shaped keys inside array elements', () => {
    expect(redactDeep({ items: [{ token: 'x', ok: 1 }, { token: 'y', ok: 2 }] })).toEqual({
      items: [{ token: '[redacted]', ok: 1 }, { token: '[redacted]', ok: 2 }],
    });
  });

  it('leaves non-secret fields, primitives, arrays of primitives, and null untouched', () => {
    expect(redactDeep({ name: 'ok', count: 3, tags: ['a', 'b'], nothing: null })).toEqual({
      name: 'ok',
      count: 3,
      tags: ['a', 'b'],
      nothing: null,
    });
  });

  it('passes a bare string, number, or array through unchanged (no object to walk)', () => {
    expect(redactDeep('a plain string')).toBe('a plain string');
    expect(redactDeep(42)).toBe(42);
    expect(redactDeep([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('does not mutate the input', () => {
    const input = { apiKey: 'secret-value' };
    redactDeep(input);
    expect(input.apiKey).toBe('secret-value');
  });
});
