import { describe, expect, it } from 'vitest';
import { decryptCredentialData, encryptCredentialData } from './encryption.js';

describe('credential encryption', () => {
  it('round-trips arbitrary credential data', () => {
    const data = { apiKey: 'sk-super-secret', nested: { token: 'abc' } };
    const encrypted = encryptCredentialData(data, 'my-encryption-key');
    expect(decryptCredentialData(encrypted, 'my-encryption-key')).toEqual(data);
  });

  it('never leaks the plaintext in the encrypted payload', () => {
    const encrypted = encryptCredentialData({ apiKey: 'sk-super-secret' }, 'my-encryption-key');
    expect(encrypted.data).not.toContain('sk-super-secret');
    expect(JSON.stringify(encrypted)).not.toContain('sk-super-secret');
  });

  it('produces a different ciphertext each time (random IV)', () => {
    const a = encryptCredentialData({ apiKey: 'x' }, 'key');
    const b = encryptCredentialData({ apiKey: 'x' }, 'key');
    expect(a.data).not.toBe(b.data);
    expect(a.iv).not.toBe(b.iv);
  });

  it('fails to decrypt with the wrong key', () => {
    const encrypted = encryptCredentialData({ apiKey: 'x' }, 'right-key');
    expect(() => decryptCredentialData(encrypted, 'wrong-key')).toThrow();
  });

  it('fails to decrypt if the ciphertext has been tampered with', () => {
    const encrypted = encryptCredentialData({ apiKey: 'x' }, 'key');
    const tampered = { ...encrypted, data: Buffer.from('tampered-data').toString('base64') };
    expect(() => decryptCredentialData(tampered, 'key')).toThrow();
  });
});
