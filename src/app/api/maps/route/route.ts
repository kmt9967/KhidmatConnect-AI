import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { computeRoute } from '@/lib/maps/routing';

const routeSchema = z.object({
  origin: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
  destination: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
  travelMode: z.enum(['DRIVE', 'WALK', 'BICYCLE', 'TWO_WHEELER']).optional().default('DRIVE'),
});

/**
 * POST /api/maps/route
 * Compute route between origin and destination.
 * Uses server-side Google Routes API key.
 * Returns only safe normalized output.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = routeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { origin, destination, travelMode } = parsed.data;

    const result = await computeRoute({
      originLatitude: origin.latitude,
      originLongitude: origin.longitude,
      destinationLatitude: destination.latitude,
      destinationLongitude: destination.longitude,
      travelMode,
    });

    if ('error' in result) {
      const status = result.error === 'MAPS_NOT_CONFIGURED' ? 503 : 400;
      return NextResponse.json({ error: result.error, message: result.message }, { status });
    }

    return NextResponse.json({
      distanceMeters: result.distanceMeters,
      durationSeconds: result.durationSeconds,
      travelMode: result.travelMode,
      // Polyline intentionally omitted from default response to reduce payload.
      // Add ?includePolyline=true if needed for visualization.
    });
  } catch (error) {
    console.error('[API] Route error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
