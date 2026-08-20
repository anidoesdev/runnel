import { describe, expect, it } from 'vitest';
import { firstItem, inferItemSchema, redactSample } from './item-schema.js';

describe('inferItemSchema', () => {
  it('maps each top-level key to a coarse type', () => {
    expect(inferItemSchema({ name: 'a', count: 1, active: true, tags: ['x'], meta: { a: 1 }, missing: null })).toEqual({
      name: 'string',
      count: 'number',
      active: 'boolean',
      tags: 'array',
      meta: 'object',
      missing: 'null',
    });
  });

  it('returns an empty schema for an empty object', () => {
    expect(inferItemSchema({})).toEqual({});
  });
});

describe('redactSample', () => {
  it('replaces a secret-shaped key with a placeholder', () => {
    expect(redactSample({ apiKey: 'sk-123', name: 'ok' })).toEqual({ apiKey: '[redacted]', name: 'ok' });
  });

  it('matches key names case-insensitively and by substring', () => {
    expect(redactSample({ Authorization: 'Bearer x', userToken: 'y', PASSWORD: 'z' })).toEqual({
      Authorization: '[redacted]',
      userToken: '[redacted]',
      PASSWORD: '[redacted]',
    });
  });

  it('redacts nested objects recursively', () => {
    expect(redactSample({ headers: { authorization: 'Bearer x' }, body: { ok: true } })).toEqual({
      headers: { authorization: '[redacted]' },
      body: { ok: true },
    });
  });

  it('leaves arrays and non-secret fields untouched', () => {
    expect(redactSample({ items: [1, 2, 3], name: 'ok' })).toEqual({ items: [1, 2, 3], name: 'ok' });
  });
});

describe('firstItem', () => {
  it('returns the first entry', () => {
    expect(firstItem([{ json: { a: 1 } }, { json: { a: 2 } }])).toEqual({ json: { a: 1 } });
  });

  it('returns undefined for an empty or missing array', () => {
    expect(firstItem([])).toBeUndefined();
    expect(firstItem(undefined)).toBeUndefined();
  });
});
