import { createHmac } from 'node:crypto';

/** A separate per-event bearer token for Autocab callbacks without custom headers. */
export function autocabWebhookUrlToken(eventSlug: string): string | null {
  const secret = process.env.AUTOCAB_WEBHOOK_URL_SECRET;
  if (!secret || !/^[a-f0-9]{64}$/i.test(secret)) return null;
  return createHmac('sha256', Buffer.from(secret, 'hex'))
    .update(`autocab-webhook:${eventSlug}`)
    .digest('hex');
}

/** One provider-level key for Autocab's API Key field and x-api-key header. */
export function autocabWebhookHeaderToken(): string | null {
  const secret = process.env.AUTOCAB_WEBHOOK_URL_SECRET;
  if (!secret || !/^[a-f0-9]{64}$/i.test(secret)) return null;
  return createHmac('sha256', Buffer.from(secret, 'hex'))
    .update('autocab-webhook:provider-header')
    .digest('hex');
}

/** Provider-specific key for non-Autocab webhook sources. */
export function providerWebhookHeaderToken(providerId: string): string | null {
  const secret = process.env.AUTOCAB_WEBHOOK_URL_SECRET;
  if (!secret || !/^[a-f0-9]{64}$/i.test(secret)) return null;
  return createHmac('sha256', Buffer.from(secret, 'hex'))
    .update(`provider-webhook:${providerId}`)
    .digest('hex');
}
