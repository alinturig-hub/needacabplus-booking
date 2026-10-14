import { createDecipheriv, timingSafeEqual } from 'node:crypto';

/** Read the existing Autocab provider key from the shared webhook configuration. */
export function decryptWebhookSecret(encrypted: string): string {
  const keyText = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!keyText) throw new Error('Webhook encryption key is not configured.');
  const key = /^[a-f0-9]{64}$/i.test(keyText) ? Buffer.from(keyText, 'hex') : Buffer.from(keyText, 'base64');
  if (key.length !== 32) throw new Error('Webhook encryption key is invalid.');
  const [version, iv, tag, ciphertext] = encrypted.split('.');
  if (version !== 'v1' || !iv || !tag || !ciphertext) throw new Error('Webhook secret is invalid.');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
}

export function webhookSecretsMatch(actual: string | null, expected: string): boolean {
  if (!actual || !expected) return false;
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
