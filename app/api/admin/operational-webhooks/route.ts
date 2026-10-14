import { Prisma } from '@/generated/prisma/client';
import { providerWebhookHeaderToken } from '@/lib/autocab/webhook-url-auth';
import { isAdmin, sameOrigin } from '@/lib/security';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const base = 'https://webhook.needacabplus.app/api/webhooks';
const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{0,79}$/);
const providerSchema = z.object({ type: z.literal('provider'), name: z.string().trim().min(2).max(100), slug, description: z.string().trim().max(1000), enabled: z.boolean() }).strict();
const eventSchema = z.object({ type: z.literal('event'), providerId: slug, name: z.string().trim().min(2).max(100), eventType: z.string().trim().min(2).max(100), slug, description: z.string().trim().max(1000), enabled: z.boolean() }).strict();
const editEventSchema = z.object({ id: z.string().min(1), providerId: slug, name: z.string().trim().min(2).max(100), slug, description: z.string().trim().max(1000), enabled: z.boolean() }).strict();
const editProviderSchema = z.object({ type: z.literal('provider'), id: slug, name: z.string().trim().min(2).max(100), description: z.string().trim().max(1000), enabled: z.boolean() }).strict();

export async function GET() {
  if (!await isAdmin()) return Response.json({ error: 'Administrator access required.' }, { status: 403 });
  const { prisma } = await import('@/lib/prisma');
  const providers = await prisma.webhookProvider.findMany({
    include: { configurations: { select: { id: true, displayName: true, eventType: true, endpointSlug: true, description: true, isEnabled: true }, orderBy: { displayName: 'asc' } } },
    orderBy: { name: 'asc' },
  });
  return Response.json({ providers: providers.map(provider => ({
    id: provider.id, name: provider.name, description: provider.description || '', enabled: provider.isEnabled,
    baseUrl: `${base}/${provider.id}`, apiKeyHeaderName: provider.id === 'autocab' ? 'x-api-key' : 'x-api-key',
    apiKey: provider.id === 'autocab' ? null : providerWebhookHeaderToken(provider.id),
    webhooks: provider.configurations.filter(item => item.endpointSlug !== 'tracks').map(item => ({
      id: item.id, event: item.displayName, eventType: item.eventType,
      description: item.description || '', slug: provider.id === 'autocab' ? item.endpointSlug : item.endpointSlug.slice(provider.id.length + 2),
      enabled: item.isEnabled,
    })),
  })) }, { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}

export async function PATCH(request: Request) {
  if (!sameOrigin(request) || !await isAdmin()) return Response.json({ error: 'Administrator access required.' }, { status: 403 });
  const input: unknown = await request.json().catch(() => null);
  if (input && typeof input === 'object' && 'type' in input && input.type === 'provider') {
    const provider = editProviderSchema.safeParse(input);
    if (!provider.success || provider.data.id === 'autocab') return Response.json({ error: 'Check the provider details.' }, { status: 400 });
    const { prisma } = await import('@/lib/prisma');
    try {
      await prisma.webhookProvider.update({ where: { id: provider.data.id }, data: {
        name: provider.data.name, description: provider.data.description, isEnabled: provider.data.enabled,
      } });
      return Response.json({ ok: true });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') return Response.json({ error: 'Provider not found.' }, { status: 404 });
      console.error('Operational webhook provider update failed:', error);
      return Response.json({ error: 'Unable to update provider.' }, { status: 503 });
    }
  }
  const parsed = editEventSchema.safeParse(input);
  if (!parsed.success || parsed.data.providerId === 'autocab') return Response.json({ error: 'Check the event details.' }, { status: 400 });
  const { id, providerId, name, slug: eventSlug, description, enabled } = parsed.data;
  const { prisma } = await import('@/lib/prisma');
  const existing = await prisma.autocabWebhookConfiguration.findFirst({ where: { id, providerId }, select: { id: true } });
  if (!existing) return Response.json({ error: 'Event not found.' }, { status: 404 });
  try {
    await prisma.autocabWebhookConfiguration.update({ where: { id }, data: {
      displayName: name, endpointSlug: `${providerId}--${eventSlug}`, description, isEnabled: enabled,
    } });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return Response.json({ error: 'This URL suffix is already used.' }, { status: 409 });
    console.error('Operational webhook event update failed:', error);
    return Response.json({ error: 'Unable to update event.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request) || !await isAdmin()) return Response.json({ error: 'Administrator access required.' }, { status: 403 });
  const input: unknown = await request.json().catch(() => null);
  const { prisma } = await import('@/lib/prisma');
  if (input && typeof input === 'object' && 'type' in input && input.type === 'provider') {
    const parsed = providerSchema.safeParse(input);
    if (!parsed.success) return Response.json({ error: 'Check the provider name and URL slug.' }, { status: 400 });
    const { name, description, enabled } = parsed.data;
    const id = parsed.data.slug;
    if (id === 'autocab') return Response.json({ error: 'Autocab is already configured.' }, { status: 409 });
    if (!providerWebhookHeaderToken(id)) return Response.json({ error: 'Webhook secret is not configured.' }, { status: 503 });
    try {
      await prisma.webhookProvider.create({ data: { id, name, description, isEnabled: enabled, baseUrl: `${base}/${id}`, apiKeyHeader: 'x-api-key' } });
      return Response.json({ id, baseUrl: `${base}/${id}` }, { status: 201 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return Response.json({ error: 'This provider already exists.' }, { status: 409 });
      console.error('Operational webhook provider creation failed:', error);
      return Response.json({ error: 'Unable to add provider.' }, { status: 503 });
    }
  }
  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) return Response.json({ error: 'Check the event details.' }, { status: 400 });
  const { providerId, name, description, eventType, enabled } = parsed.data;
  const endpointSlug = providerId === 'autocab' ? parsed.data.slug : `${providerId}--${parsed.data.slug}`;
  if (endpointSlug === 'tracks') return Response.json({ error: 'Tracking is configured separately.' }, { status: 400 });
  const provider = await prisma.webhookProvider.findUnique({ where: { id: providerId }, select: { id: true } });
  if (!provider) return Response.json({ error: 'Provider not found.' }, { status: 404 });
  try {
    const created = await prisma.autocabWebhookConfiguration.create({ data: {
      providerId, displayName: name, description, endpointSlug, isEnabled: enabled,
      eventType: providerId === 'autocab' ? eventType : `${providerId.toUpperCase()}__${eventType}`,
    }, select: { id: true } });
    return Response.json({ id: created.id }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return Response.json({ error: 'This event type or URL suffix already exists.' }, { status: 409 });
    console.error('Operational webhook event creation failed:', error);
    return Response.json({ error: 'Unable to add webhook event.' }, { status: 503 });
  }
}
