import { createHash } from 'node:crypto';
import { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { bookingExternalId, webhookIdempotencyKey } from '@/lib/autocab/webhook-processing';
import { decryptWebhookSecret, webhookSecretsMatch } from '@/lib/autocab/webhook-secret';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const maxBodyBytes = 2_000_000;
const response = (body: Record<string, unknown>, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

function slug(value: string) {
  return decodeURIComponent(value).trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
}

function payloadText(payload: Record<string, unknown>, names: string[]) {
  for (const name of names) {
    const value = payload[name];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  }
  return null;
}

function safeHeaders(request: Request, secretHeader: string): Prisma.InputJsonObject {
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    if (!['authorization', 'cookie', secretHeader.toLowerCase(), 'x-autocab-api-key'].includes(key.toLowerCase())) headers[key] = value;
  });
  return headers;
}

export async function POST(request: Request, context: { params: Promise<{ event: string }> }) {
  const host = (request.headers.get('x-forwarded-host') || request.headers.get('host') || '').split(',')[0].trim().split(':')[0].toLowerCase();
  if (process.env.NODE_ENV === 'production' && host !== 'webhook.needacabplus.app') return response({ error: 'NOT_FOUND' }, 404);
  if (process.env.AUTOCAB_WEBHOOK_INGEST_ENABLED !== 'true') return response({ error: 'INGEST_DISABLED' }, 503);
  let eventSlug: string;
  try { eventSlug = slug((await context.params).event); } catch { return response({ error: 'INVALID_EVENT' }, 400); }
  if (!eventSlug) return response({ error: 'INVALID_EVENT' }, 400);

  const configuration = await prisma.autocabWebhookConfiguration.findUnique({
    where: { endpointSlug: eventSlug }, include: { webhookProvider: true },
  });
  if (!configuration?.isEnabled || !configuration.webhookProvider.isEnabled) return response({ error: 'EVENT_DISABLED' }, 404);
  const provider = configuration.webhookProvider;
  if (!provider.apiKeyEncrypted) return response({ error: 'SOURCE_AUTH_UNAVAILABLE' }, 503);
  let expected: string;
  try { expected = decryptWebhookSecret(provider.apiKeyEncrypted); }
  catch { return response({ error: 'SOURCE_AUTH_UNAVAILABLE' }, 503); }
  if (!webhookSecretsMatch(request.headers.get(provider.apiKeyHeader), expected)) return response({ error: 'UNAUTHORIZED' }, 401);

  const length = Number(request.headers.get('content-length') || 0);
  if (length > maxBodyBytes) return response({ error: 'PAYLOAD_TOO_LARGE' }, 413);
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, 'utf8') > maxBodyBytes) return response({ error: 'PAYLOAD_TOO_LARGE' }, 413);
  if (!rawBody.trim()) return response({ error: 'EMPTY_PAYLOAD' }, 400);
  let payload: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Expected object');
    payload = parsed as Record<string, unknown>;
  } catch { return response({ error: 'INVALID_JSON' }, 400); }

  const eventType = payloadText(payload, ['EventType', 'eventType', 'EventName', 'eventName', 'Type', 'type']) || configuration.eventType;
  if (eventType.startsWith('Booking') && process.env.CANONICAL_BOOKING_WRITER_ENABLED !== 'true') return response({ error: 'BOOKING_WRITER_DISABLED' }, 503);
  const idempotencyKey = webhookIdempotencyKey(eventSlug, payload);
  const legacyKey = `AUTOCAB:${eventSlug}:${createHash('sha256').update(rawBody).digest('hex')}`;
  try {
    const duplicate = await prisma.webhookEvent.findFirst({ where: { idempotencyKey: { in: [idempotencyKey, legacyKey] } }, select: { id: true } });
    if (duplicate) return response({ accepted: true, duplicate: true, eventId: duplicate.id });
    const event = await prisma.webhookEvent.create({ data: {
      provider: 'AUTOCAB', eventType,
      externalBookingId: bookingExternalId(payload) || payloadText(payload, ['originalBookingId', 'bookingId', 'id']),
      idempotencyKey, status: 'RECEIVED', payload: payload as Prisma.InputJsonObject,
      rawBody, headers: safeHeaders(request, provider.apiKeyHeader), webhookConfigurationId: configuration.id,
    }, select: { id: true } });
    return response({ accepted: true, duplicate: false, eventId: event.id }, 202);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const duplicate = await prisma.webhookEvent.findUnique({ where: { idempotencyKey }, select: { id: true } });
      return response({ accepted: true, duplicate: true, eventId: duplicate?.id });
    }
    console.error('Autocab webhook intake failed:', error);
    return response({ error: 'INGEST_FAILED' }, 503);
  }
}
