import { NextRequest, NextResponse } from 'next/server';
import { getResponderCurrentAssignment } from '@/lib/services/assignmentService';
import { requireRole } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';

/**
 * GET /api/responder/assignments/current
 *
 * Returns the current active assignment for the authenticated responder.
 * Server-side auth: requires RESPONDER role.
 */
export async function GET(_request: NextRequest) {
  try {
    const responder = await requireRole('RESPONDER');

    // Look up the responder record for this user
    const responderRecord = await prisma.responder.findUnique({
      where: { userId: responder.id },
      select: { id: true },
    });
    if (!responderRecord) {
      return NextResponse.json({ assignment: null });
    }

    const assignment = await getResponderCurrentAssignment(responderRecord.id);

    if (!assignment) {
      return NextResponse.json({ assignment: null });
    }

    return NextResponse.json({ assignment });
  } catch (error) {
    if (error instanceof Error && error.message === 'Role RESPONDER required') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { error: 'Failed to load assignment' },
      { status: 500 }
    );
  }
}
