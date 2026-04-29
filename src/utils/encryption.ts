import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { ClinkError } from './errors';

function getKey(): Buffer {
  const hex = process.env.PLATFORM_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new ClinkError(
      'INVALID_CONFIGURATION',
      'PLATFORM_ENCRYPTION_KEY must be a 64-character hex string (32 bytes).',
    );
  }
  return Buffer.from(hex, 'hex');
}

export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // layout: iv(12) + tag(16) + ciphertext
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decryptSecret(encoded: string): string {
  const key = getKey();
  const buf = Buffer.from(encoded, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(ciphertext) + decipher.final('utf8');
  } catch {
    throw new ClinkError('INVALID_CONFIGURATION', 'Failed to decrypt secret — key mismatch or data tampered.');
  }
}
