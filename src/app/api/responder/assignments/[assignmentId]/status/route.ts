import { NextRequest, NextResponse } from 'next/server';
import { statusTransitionSchema } from '@/lib/validation/assignment';
import { transitionAssignmentStatus } from '@/lib/services/assignmentService';
import { requireRole } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';

/**
 * POST /api/responder/assignments/[assignmentId]/status
 *
 * Responder transitions their assignment status.
 * Server-side auth: requires RESPONDER role.
 * Verifies the authenticated responder owns this assignment.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ assignmentId: string }> }
) {
  try {
    const responder = await requireRole('RESPONDER');
    const { assignmentId } = await params;

    // Look up the responder record for this user
    const responderRecord = await prisma.responder.findUnique({
      where: { userId: responder.id },
      select: { id: true },
    });
    if (!responderRecord) {
      return NextResponse.json({ error: 'Responder profile not found' }, { status: 404 });
    }

    // Verify this assignment belongs to the authenticated responder
    const assignment = await prisma.assignment.findUnique({
      where: { id: assignmentId },
      select: { id: true, responderId: true },
    });
    if (!assignment) {
      return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
    }
    if (assignment.responderId !== responderRecord.id) {
      return NextResponse.json({ error: 'Not your assignment' }, { status: 403 });
    }

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
    if (error instanceof Error && error.message === 'Role RESPONDER required') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const message = error instanceof Error ? error.message : 'Status transition failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
