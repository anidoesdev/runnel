import { describe, expect, it } from 'vitest';
import { signSessionToken, verifySessionToken } from './jwt.js';

const secret = new TextEncoder().encode('test-secret-at-least-32-bytes-long!');
const otherSecret = new TextEncoder().encode('a-completely-different-secret!!');

describe('session JWT', () => {
  it('round-trips subject and email through sign/verify', async () => {
    const token = await signSessionToken({ sub: 'user-1', email: 'a@example.com' }, secret);
    const payload = await verifySessionToken(token, secret);
    expect(payload).toEqual({ sub: 'user-1', email: 'a@example.com' });
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await signSessionToken({ sub: 'user-1', email: 'a@example.com' }, secret);
    await expect(verifySessionToken(token, otherSecret)).rejects.toThrow();
  });

  it('rejects an expired token', async () => {
    const token = await signSessionToken({ sub: 'user-1', email: 'a@example.com' }, secret, '0s');
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await expect(verifySessionToken(token, secret)).rejects.toThrow();
  });

  it('rejects a malformed token', async () => {
    await expect(verifySessionToken('not-a-jwt', secret)).rejects.toThrow();
  });
});
