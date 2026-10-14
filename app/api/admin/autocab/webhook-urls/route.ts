import { isAdmin } from '@/lib/security';
import { autocabWebhookHeaderToken } from '@/lib/autocab/webhook-url-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!await isAdmin()) return Response.json({ error: 'Administrator access required.' }, { status: 403 });
  const apiKey = autocabWebhookHeaderToken();
  if (!apiKey) return Response.json({ error: 'Webhook secret is not configured.' }, { status: 503 });
  const { prisma } = await import('@/lib/prisma');
  const configurations = await prisma.autocabWebhookConfiguration.findMany({
    where: { providerId: 'autocab', isEnabled: true, endpointSlug: { not: 'tracks' }, webhookProvider: { isEnabled: true } },
    select: { displayName: true, endpointSlug: true }, orderBy: { displayName: 'asc' },
  });
  return Response.json({
    note: 'Set these three provider fields in Autocab. Keep the API key private. Leave the existing /tracks_change tracking webhook unchanged.',
    provider: {
      baseUrl: 'https://webhook.needacabplus.app/api/webhooks/autocab',
      apiKeyHeaderName: 'x-api-key',
      apiKey,
    },
    webhooks: configurations.map(item => ({
      event: item.displayName,
      slug: item.endpointSlug,
      eventUrlSuffix: `/${item.endpointSlug}`,
    })),
  }, { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}
