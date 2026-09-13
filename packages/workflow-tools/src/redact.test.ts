import { describe, expect, it } from 'vitest';
import { redactDeep, redactText } from './redact.js';

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

describe('redactText', () => {
  const CREDENTIAL_FIXTURE = 'sk-test-0123456789abcdef-do-not-leak-me';

  it.each([
    ['an sk- secret key pasted into prose', `my key is ${CREDENTIAL_FIXTURE} thanks`, CREDENTIAL_FIXTURE],
    ['a Bearer token', 'send Authorization Bearer abcdef0123456789xyz', 'abcdef0123456789xyz'],
    ['a JWT', 'token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NSJ9.c2lnbmF0dXJlLXZhbHVl', 'eyJhbGciOiJIUzI1NiJ9'],
    ['an AWS access key id', 'use AKIAIOSFODNN7EXAMPLE for s3', 'AKIAIOSFODNN7EXAMPLE'],
    ['a GitHub token', 'ghp_abcdefghijklmnopqrstuvwxyz0123456789', 'ghp_abcdefghijklmnopqrstuvwxyz0123456789'],
    ['a password in a connection string', 'postgres://admin:hunter2-prod@db.internal:5432/app', 'hunter2-prod'],
    ['"password is ..." prose', 'the password is correct-horse-battery', 'correct-horse-battery'],
    ['a quoted JSON value under a secret-shaped key', '{"name": "Stripe", "apiKey": "live-value-123"}', 'live-value-123'],
    ['an env-file style assignment', 'OPENAI_API_KEY=abc123def456', 'abc123def456'],
    ['a private key block', '-----BEGIN RSA PRIVATE KEY-----\nMIIEow\n-----END RSA PRIVATE KEY-----', 'MIIEow'],
  ])('redacts %s', (_label, input, secret) => {
    const redacted = redactText(input);
    expect(redacted).not.toContain(secret);
    expect(redacted).toContain('[redacted]');
  });

  it('keeps the label and quoting around a redacted value', () => {
    expect(redactText('{"apiKey": "x-123", "name": "ok"}')).toBe('{"apiKey": "[redacted]", "name": "ok"}');
    expect(redactText('postgres://admin:pw@host/db')).toBe('postgres://admin:[redacted]@host/db');
  });

  it('leaves ordinary workflow-building prose alone', () => {
    const text = 'Add an HTTP Request node that calls https://api.example.com/users, then a Set node with name: "user".';
    expect(redactText(text)).toBe(text);
  });

  it('is idempotent', () => {
    const once = redactText(`apiKey: ${CREDENTIAL_FIXTURE}`);
    expect(redactText(once)).toBe(once);
  });
});
