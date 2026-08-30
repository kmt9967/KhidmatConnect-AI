import { NextRequest, NextResponse } from 'next/server';
import { createEmergencyCaseSchema } from '@/lib/validation/emergencyCase';
import { createEmergencyCase } from '@/lib/services/emergencyCaseService';

/**
 * POST /api/emergency-cases
 * Create a new emergency case with secure access token.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input with Zod
    const parsed = createEmergencyCaseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Create case + token
    const result = await createEmergencyCase(parsed.data);

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Emergency case creation error:', error);
    return NextResponse.json(
      { error: 'Failed to create emergency case' },
      { status: 500 }
    );
  }
}
