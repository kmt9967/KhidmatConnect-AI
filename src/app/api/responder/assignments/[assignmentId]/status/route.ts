import { NextRequest, NextResponse } from 'next/server';
import { statusTransitionSchema } from '@/lib/validation/assignment';
import { transitionAssignmentStatus } from '@/lib/services/assignmentService';

/**
 * POST /api/responder/assignments/[assignmentId]/status
 *
 * Responder transitions their assignment status.
 * Validates the transition is legal.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ assignmentId: string }> }
) {
  try {
    const { assignmentId } = await params;
    const body = await request.json();

    const parsed = statusTransitionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await transitionAssignmentStatus({
      assignmentId,
      newStatus: parsed.data.newStatus,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Status transition failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
