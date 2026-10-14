import { createHmac } from 'node:crypto';

/** A separate per-event bearer token for Autocab callbacks without custom headers. */
export function autocabWebhookUrlToken(eventSlug: string): string | null {
  const secret = process.env.AUTOCAB_WEBHOOK_URL_SECRET;
  if (!secret || !/^[a-f0-9]{64}$/i.test(secret)) return null;
  return createHmac('sha256', Buffer.from(secret, 'hex'))
    .update(`autocab-webhook:${eventSlug}`)
    .digest('hex');
}
