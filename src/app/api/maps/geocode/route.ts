import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { forwardGeocode } from '@/lib/maps/geocoding';

const geocodeSchema = z.object({
  address: z.string().min(3, 'Address must be at least 3 characters').max(500, 'Address too long'),
});

/**
 * POST /api/maps/geocode
 * Forward geocode: address → coordinates.
 * Uses server-side Google Geocoding API key.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = geocodeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await forwardGeocode(parsed.data.address);

    // If it's an error result
    if ('error' in result) {
      const status = result.error === 'MAPS_NOT_CONFIGURED' ? 503 : 400;
      return NextResponse.json({ error: result.error, message: result.message }, { status });
    }

    // Success — return normalized result (no raw Google data)
    return NextResponse.json({
      formattedAddress: result.formattedAddress,
      latitude: result.latitude,
      longitude: result.longitude,
      placeId: result.placeId,
      confidenceType: result.confidenceType,
    });
  } catch (error) {
    console.error('[API] Geocode error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
