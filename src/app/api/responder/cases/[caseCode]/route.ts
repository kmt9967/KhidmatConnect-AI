import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';

/**
 * GET /api/responder/cases/[caseCode]
 *
 * Full case detail for the authenticated responder.
 * Verifies the responder is actually assigned to this case.
 * Returns case data + assignment data.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ caseCode: string }> }
) {
  try {
    const responder = await requireRole('RESPONDER');
    const { caseCode } = await params;

    // Look up the responder record for this user
    const responderRecord = await prisma.responder.findUnique({
      where: { userId: responder.id },
      select: { id: true },
    });
    if (!responderRecord) {
      return NextResponse.json({ error: 'Responder profile not found' }, { status: 404 });
    }

    // Find the assignment for this responder + case
    const assignment = await prisma.assignment.findFirst({
      where: {
        responderId: responderRecord.id,
        emergencyCase: { caseCode },
      },
      include: {
        emergencyCase: {
          include: {
            categories: { select: { category: true } },
          },
        },
        ambulance: {
          select: { id: true, identifier: true, vehicleNumber: true },
        },
        resource: {
          select: { id: true, name: true, type: true },
        },
      },
    });

    if (!assignment) {
      return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
    }

    const ec = assignment.emergencyCase;

    return NextResponse.json({
      // Assignment data
      assignmentId: assignment.id,
      assignmentStatus: assignment.status,
      assignedAt: assignment.assignedAt,
      acceptedAt: assignment.acceptedAt,
      enRouteAt: assignment.enRouteAt,
      arrivedAt: assignment.arrivedAt,
      completedAt: assignment.completedAt,

      // Ambulance/resource
      ambulance: assignment.ambulance,
      resource: assignment.resource,

      // Case data
      caseCode: ec.caseCode,
      caseStatus: ec.status,
      urgency: ec.urgency,
      categories: ec.categories.map((c) => c.category),
      originalMessage: ec.originalMessage,
      locationText: ec.locationText,
      latitude: ec.latitude,
      longitude: ec.longitude,
      locationConfirmed: ec.locationConfirmed,
      primaryContact: ec.primaryContact,
      aiSummary: ec.aiSummary,
      aiReasoning: ec.aiReasoning,
      keyNeeds: ec.keyNeeds,
      specialNeeds: ec.specialNeeds,
      peopleAffected: ec.peopleAffected,
      detectedLanguage: ec.detectedLanguage,
      createdAt: ec.createdAt,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Role RESPONDER required') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Responder case detail error:', error);
    return NextResponse.json({ error: 'Failed to load case' }, { status: 500 });
  }
}
