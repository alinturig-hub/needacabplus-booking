import { isAdmin } from '@/lib/security';
import { autocabWebhookUrlToken } from '@/lib/autocab/webhook-url-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!await isAdmin()) return Response.json({ error: 'Administrator access required.' }, { status: 403 });
  if (!autocabWebhookUrlToken('newbooking')) return Response.json({ error: 'Webhook URL secret is not configured.' }, { status: 503 });
  const { prisma } = await import('@/lib/prisma');
  const configurations = await prisma.autocabWebhookConfiguration.findMany({
    where: { providerId: 'autocab', isEnabled: true, endpointSlug: { not: 'tracks' }, webhookProvider: { isEnabled: true } },
    select: { displayName: true, endpointSlug: true }, orderBy: { displayName: 'asc' },
  });
  return Response.json({
    note: 'Copy these URLs into Autocab. Keep the token private. Leave the existing /tracks_change tracking webhook unchanged.',
    webhooks: configurations.map(item => ({
      event: item.displayName,
      slug: item.endpointSlug,
      url: `https://webhook.needacabplus.app/api/webhooks/autocab/${item.endpointSlug}?token=${autocabWebhookUrlToken(item.endpointSlug)}`,
    })),
  }, { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}
