import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { reverseGeocode } from '@/lib/maps/geocoding';

const reverseGeocodeSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

/**
 * POST /api/maps/reverse-geocode
 * Reverse geocode: coordinates → address.
 * Uses server-side Google Geocoding API key.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = reverseGeocodeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await reverseGeocode(parsed.data.latitude, parsed.data.longitude);

    if ('error' in result) {
      const status = result.error === 'MAPS_NOT_CONFIGURED' ? 503 : 400;
      return NextResponse.json({ error: result.error, message: result.message }, { status });
    }

    return NextResponse.json({
      formattedAddress: result.formattedAddress,
      latitude: result.latitude,
      longitude: result.longitude,
      placeId: result.placeId,
      confidenceType: result.confidenceType,
    });
  } catch (error) {
    console.error('[API] Reverse geocode error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
