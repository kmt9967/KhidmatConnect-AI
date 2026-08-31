import { NextRequest, NextResponse } from 'next/server';
import { supportRequestSchema } from '@/lib/validation/assignment';
import { createSupportRequest } from '@/lib/services/assignmentService';

/**
 * POST /api/responder/support
 *
 * Responder requests additional support (ambulance, medical team, etc.).
 * Creates a CaseUpdate record for operator visibility.
 * Does NOT auto-dispatch anything.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const parsed = supportRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await createSupportRequest(parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Support request failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
