import { NextRequest, NextResponse } from 'next/server';
import { locationUpdateSchema } from '@/lib/validation/assignment';
import { updateResponderLocation } from '@/lib/services/assignmentService';

/**
 * POST /api/responder/location
 *
 * Responder sends a GPS location update.
 * Only accepted while assignment is active.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const parsed = locationUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await updateResponderLocation(parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Location update failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
