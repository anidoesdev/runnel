import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import type { IDataObject } from '@runnel/workflow';

/**
 * Credential values are encrypted at rest with AES-256-GCM. The key is derived from
 * RUNNEL_ENCRYPTION_KEY via scrypt with a fixed instance-level salt — deliberately not the
 * salt-less "hash the passphrase directly" approach, and deliberately GCM (authenticated
 * encryption) rather than a CBC scheme, per the M1 architecture decision.
 */
const KEY_LENGTH = 32; // AES-256
const IV_LENGTH = 12; // recommended for GCM
const SALT = 'runnel-credential-encryption';

export interface IEncryptedCredentialData {
  iv: string;
  authTag: string;
  data: string;
}

function deriveKey(encryptionKey: string): Buffer {
  return scryptSync(encryptionKey, SALT, KEY_LENGTH);
}

export function encryptCredentialData(data: IDataObject, encryptionKey: string): IEncryptedCredentialData {
  const key = deriveKey(encryptionKey);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  const plaintext = JSON.stringify(data);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    data: encrypted.toString('base64'),
  };
}

export function decryptCredentialData(
  encrypted: IEncryptedCredentialData,
  encryptionKey: string,
): IDataObject {
  const key = deriveKey(encryptionKey);
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(encrypted.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(encrypted.authTag, 'base64'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypted.data, 'base64')),
    decipher.final(),
  ]);

  return JSON.parse(decrypted.toString('utf8')) as IDataObject;
}
