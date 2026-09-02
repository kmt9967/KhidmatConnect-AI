import { NextRequest, NextResponse } from 'next/server';
import { locationUpdateSchema } from '@/lib/validation/assignment';
import { updateResponderLocation } from '@/lib/services/assignmentService';
import { requireRole } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';

/**
 * POST /api/responder/location
 *
 * Responder sends a GPS location update.
 * Server-side auth: requires RESPONDER role.
 * Verifies the authenticated responder owns the assignment.
 */
export async function POST(request: NextRequest) {
  try {
    const responder = await requireRole('RESPONDER');
    const body = await request.json();

    const parsed = locationUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Look up the responder record for this user
    const responderRecord = await prisma.responder.findUnique({
      where: { userId: responder.id },
      select: { id: true },
    });
    if (!responderRecord) {
      return NextResponse.json({ error: 'Responder profile not found' }, { status: 404 });
    }

    // Verify assignment belongs to this responder
    if (parsed.data.assignmentId) {
      const assignment = await prisma.assignment.findUnique({
        where: { id: parsed.data.assignmentId },
        select: { id: true, responderId: true },
      });
      if (!assignment) {
        return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
      }
      if (assignment.responderId !== responderRecord.id) {
        return NextResponse.json({ error: 'Not your assignment' }, { status: 403 });
      }
    }

    const result = await updateResponderLocation({
      ...parsed.data,
      responderId: responderRecord.id,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === 'Role RESPONDER required') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const message = error instanceof Error ? error.message : 'Location update failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
