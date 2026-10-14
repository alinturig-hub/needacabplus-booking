import { isAdmin, sameOrigin } from '@/lib/security';
import { autocabWebhookHeaderToken } from '@/lib/autocab/webhook-url-auth';
import { Prisma } from '@/generated/prisma/client';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!await isAdmin()) return Response.json({ error: 'Administrator access required.' }, { status: 403 });
  const apiKey = autocabWebhookHeaderToken();
  if (!apiKey) return Response.json({ error: 'Webhook secret is not configured.' }, { status: 503 });
  const { prisma } = await import('@/lib/prisma');
  const configurations = await prisma.autocabWebhookConfiguration.findMany({
    where: { providerId: 'autocab', endpointSlug: { not: 'tracks' } },
    select: { id: true, eventType: true, displayName: true, description: true, endpointSlug: true, isEnabled: true },
    orderBy: { displayName: 'asc' },
  });
  return Response.json({
    note: 'Set these three provider fields in Autocab. Keep the API key private. Leave the existing /tracks_change tracking webhook unchanged.',
    provider: {
      baseUrl: 'https://webhook.needacabplus.app/api/webhooks/autocab',
      apiKeyHeaderName: 'x-api-key',
      apiKey,
    },
    webhooks: configurations.map(item => ({
      id: item.id,
      eventType: item.eventType,
      event: item.displayName,
      description: item.description || '',
      slug: item.endpointSlug,
      eventUrlSuffix: `/${item.endpointSlug}`,
      enabled: item.isEnabled,
    })),
  }, { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}

const editSchema = z.object({
  id: z.string().min(1),
  event: z.string().trim().min(2).max(100),
  description: z.string().trim().max(1000),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]*$/).max(100),
  enabled: z.boolean(),
}).strict();

export async function PATCH(request: Request) {
  if (!sameOrigin(request) || !await isAdmin()) return Response.json({ error: 'Administrator access required.' }, { status: 403 });
  const parsed = editSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Check the event details and URL suffix.' }, { status: 400 });
  const { id, event, description, slug, enabled } = parsed.data;
  if (slug === 'tracks') return Response.json({ error: 'The live tracking endpoint is configured separately.' }, { status: 400 });
  const { prisma } = await import('@/lib/prisma');
  const current = await prisma.autocabWebhookConfiguration.findFirst({
    where: { id, providerId: 'autocab', endpointSlug: { not: 'tracks' } },
    select: { id: true, endpointSlug: true },
  });
  if (!current) return Response.json({ error: 'Autocab event not found.' }, { status: 404 });
  try {
    await prisma.autocabWebhookConfiguration.update({
      where: { id },
      data: { displayName: event, description, endpointSlug: slug, isEnabled: enabled },
    });
    return Response.json({ ok: true, autocabUrlChangeRequired: current.endpointSlug !== slug }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return Response.json({ error: 'This URL suffix is already used by another event.' }, { status: 409 });
    }
    console.error('Autocab event update failed:', error);
    return Response.json({ error: 'Unable to update the Autocab event.' }, { status: 503 });
  }
}
