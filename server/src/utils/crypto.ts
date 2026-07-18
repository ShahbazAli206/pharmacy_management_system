import crypto from 'crypto';
import { env } from '../config/env';

/**
 * Field-level encryption for PII (health card numbers, insurance IDs, MFA secrets).
 * Uses AES-256-GCM. Output format: "<iv>:<authTag>:<ciphertext>" (all hex).
 *
 * The spec requires AES-256 field-level encryption for health card / SIN /
 * insurance IDs — this is that primitive. Disk-level encryption is separate and
 * handled at the infrastructure layer.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit nonce recommended for GCM
const KEY = Buffer.from(env.FIELD_ENCRYPTION_KEY, 'hex'); // 32 bytes

export function encryptField(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptField(payload: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(':');
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error('Invalid encrypted payload format');
  }
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

/** Nullable helper: encrypt only when a value is present. */
export function encryptNullable(value?: string | null): string | null {
  return value == null || value === '' ? null : encryptField(value);
}

export function decryptNullable(value?: string | null): string | null {
  return value == null ? null : decryptField(value);
}

/** SHA-256 hash for refresh-token storage (never store raw tokens). */
export function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}
