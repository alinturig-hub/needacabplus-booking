import assert from 'node:assert/strict';
import { createCipheriv, randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { decryptWebhookSecret, webhookSecretsMatch } from '../lib/autocab/webhook-secret.ts';

test('existing TaxiCRM provider keys are readable and checked exactly', () => {
  const key = randomBytes(32);
  const previous = process.env.INTEGRATION_ENCRYPTION_KEY;
  process.env.INTEGRATION_ENCRYPTION_KEY = key.toString('hex');
  try {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update('shared-key', 'utf8'), cipher.final()]);
    const stored = ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join('.');
    assert.equal(decryptWebhookSecret(stored), 'shared-key');
    assert.equal(webhookSecretsMatch('shared-key', 'shared-key'), true);
    assert.equal(webhookSecretsMatch('wrong-key', 'shared-key'), false);
    assert.equal(webhookSecretsMatch(null, 'shared-key'), false);
    const parts = stored.split('.');
    parts[2] = randomBytes(16).toString('base64');
    assert.throws(() => decryptWebhookSecret(parts.join('.')));
  } finally {
    if (previous === undefined) delete process.env.INTEGRATION_ENCRYPTION_KEY;
    else process.env.INTEGRATION_ENCRYPTION_KEY = previous;
  }
});
