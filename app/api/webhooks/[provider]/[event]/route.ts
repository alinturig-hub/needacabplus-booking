import { createHash } from 'node:crypto';
import { Prisma } from '@/generated/prisma/client';
import { providerWebhookHeaderToken } from '@/lib/autocab/webhook-url-auth';
import { webhookSecretsMatch } from '@/lib/autocab/webhook-secret';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const reply = (body: Record<string, unknown>, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const valid = (value: string) => /^[a-z0-9][a-z0-9-]{0,79}$/.test(value);

export async function POST(request: Request, context: { params: Promise<{ provider: string; event: string }> }) {
  const host = (request.headers.get('x-forwarded-host') || request.headers.get('host') || '').split(',')[0].trim().split(':')[0].toLowerCase();
  if (process.env.NODE_ENV === 'production' && host !== 'webhook.needacabplus.app') return reply({ error: 'NOT_FOUND' }, 404);
  const { provider, event } = await context.params;
  if (!valid(provider) || !valid(event) || provider === 'autocab') return reply({ error: 'NOT_FOUND' }, 404);
  const { prisma } = await import('@/lib/prisma');
  const configuration = await prisma.autocabWebhookConfiguration.findUnique({
    where: { endpointSlug: `${provider}--${event}` }, include: { webhookProvider: true },
  });
  if (!configuration || configuration.providerId !== provider || !configuration.isEnabled || !configuration.webhookProvider.isEnabled) return reply({ error: 'EVENT_DISABLED' }, 404);
  const expected = providerWebhookHeaderToken(provider);
  if (!expected) return reply({ error: 'SOURCE_AUTH_UNAVAILABLE' }, 503);
  if (!webhookSecretsMatch(request.headers.get('x-api-key'), expected)) return reply({ error: 'UNAUTHORIZED' }, 401);
  if (Number(request.headers.get('content-length') || 0) > 2_000_000) return reply({ error: 'PAYLOAD_TOO_LARGE' }, 413);
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, 'utf8') > 2_000_000) return reply({ error: 'PAYLOAD_TOO_LARGE' }, 413);
  let payload: unknown;
  try { payload = JSON.parse(rawBody); } catch { return reply({ error: 'INVALID_JSON' }, 400); }
  if (!payload || typeof payload !== 'object') return reply({ error: 'INVALID_JSON' }, 400);
  const idempotencyKey = `${provider}:${event}:${createHash('sha256').update(rawBody).digest('hex')}`;
  try {
    const saved = await prisma.webhookEvent.create({ data: {
      provider: provider.toUpperCase(), eventType: configuration.eventType, idempotencyKey,
      status: 'RECEIVED', payload: payload as Prisma.InputJsonValue, rawBody,
      headers: { 'content-type': request.headers.get('content-type') || '' },
      webhookConfigurationId: configuration.id,
    }, select: { id: true } });
    return reply({ accepted: true, eventId: saved.id }, 202);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return reply({ accepted: true, duplicate: true });
    console.error('Provider webhook intake failed:', { provider, event, error });
    return reply({ error: 'INGEST_FAILED' }, 503);
  }
}
