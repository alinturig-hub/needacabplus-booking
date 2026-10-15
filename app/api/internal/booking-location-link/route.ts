import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(request: NextRequest) {
  const expected = process.env.BOOKING_EFFECTS_SHARED_SECRET;
  const supplied = request.headers.get('x-booking-effects-secret');
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  if (process.env.CANONICAL_BOOKING_WRITER_ENABLED !== 'true') {
    return NextResponse.json({ error: 'WRITER_DISABLED' }, { status: 409 });
  }
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }
  const { bookingLocationId, placeIntelligenceId, expectedLatitude, expectedLongitude } = body as Record<string, unknown>;
  if (typeof bookingLocationId !== 'string' || !bookingLocationId.trim() ||
      typeof placeIntelligenceId !== 'string' || !placeIntelligenceId.trim() ||
      typeof expectedLatitude !== 'string' || typeof expectedLongitude !== 'string' ||
      !Number.isFinite(Number(expectedLatitude)) || !Number.isFinite(Number(expectedLongitude)) ||
      Math.abs(Number(expectedLatitude)) > 90 || Math.abs(Number(expectedLongitude)) > 180) {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }
  try {
    const { prisma } = await import('@/lib/prisma');
    const place = await prisma.placeIntelligence.findUnique({
      where: { id: placeIntelligenceId }, select: { locationKey: true },
    });
    if (!place) return NextResponse.json({ error: 'PLACE_NOT_FOUND' }, { status: 404 });
    // Cached places share a five-decimal location key. Their original eight-decimal
    // coordinates need not match another booking at that same place exactly.
    const expectedKey = `${Number(expectedLatitude).toFixed(5)}:${Number(expectedLongitude).toFixed(5)}`;
    if (place.locationKey !== expectedKey) {
      return NextResponse.json({ error: 'PLACE_COORDINATES_MISMATCH' }, { status: 409 });
    }
    // Compare with the exact coordinates TaxiCRM saw before its lookup. A later
    // booking update must not link an old result to a newly moved location.
    const linked = await prisma.bookingLocation.updateMany({
      where: { id: bookingLocationId, latitude: expectedLatitude, longitude: expectedLongitude },
      data: { placeIntelligenceId },
    });
    if (!linked.count) return NextResponse.json({ error: 'LOCATION_CHANGED_OR_MISSING' }, { status: 409 });
    return NextResponse.json({ linked: true });
  } catch (error) {
    console.error('Booking location link failed:', error);
    return NextResponse.json({ error: 'LINK_FAILED' }, { status: 500 });
  }
}
