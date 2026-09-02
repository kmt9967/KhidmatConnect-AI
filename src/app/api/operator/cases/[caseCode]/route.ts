import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';

/**
 * GET /api/operator/cases/[caseCode]
 *
 * Full operator view of an emergency case.
 * Includes: case data, AI analysis, voice sessions, assignments, audit timeline.
 * Requires OPERATOR role.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ caseCode: string }> }
) {
  try {
    // Server-side auth check
    await requireRole('OPERATOR');

    const { caseCode } = await params;

    const caseRecord = await prisma.emergencyCase.findUnique({
      where: { caseCode },
      include: {
        categories: { select: { category: true } },
        assignments: {
          orderBy: { assignedAt: 'desc' },
          include: {
            responder: {
              select: {
                id: true,
                name: true,
                phone: true,
                responderType: true,
                availabilityStatus: true,
                currentLatitude: true,
                currentLongitude: true,
              },
            },
            ambulance: {
              select: {
                id: true,
                identifier: true,
                vehicleNumber: true,
                currentLatitude: true,
                currentLongitude: true,
              },
            },
            resource: {
              select: {
                id: true,
                name: true,
                type: true,
                phone: true,
              },
            },
            operator: {
              select: { id: true, name: true },
            },
          },
        },
        updates: {
          orderBy: { createdAt: 'asc' },
          take: 100,
          select: {
            id: true,
            updateType: true,
            message: true,
            createdAt: true,
            createdByUser: { select: { name: true } },
          },
        },
        voiceCallSessions: {
          orderBy: { startedAt: 'asc' },
          include: {
            turns: {
              orderBy: { createdAt: 'asc' },
              select: {
                speaker: true,
                transcript: true,
                detectedLanguage: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });

    if (!caseRecord) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    return NextResponse.json({
      // Core case data
      caseCode: caseRecord.caseCode,
      source: caseRecord.source,
      status: caseRecord.status,
      urgency: caseRecord.urgency,
      primaryContact: caseRecord.primaryContact,
      alternateContact: caseRecord.alternateContact,
      originalMessage: caseRecord.originalMessage,
      transcript: caseRecord.transcript,
      locationText: caseRecord.locationText,
      latitude: caseRecord.latitude,
      longitude: caseRecord.longitude,
      locationAccuracy: caseRecord.locationAccuracy,
      locationConfirmed: caseRecord.locationConfirmed,
      detectedLanguage: caseRecord.detectedLanguage,
      createdAt: caseRecord.createdAt,
      updatedAt: caseRecord.updatedAt,
      closedAt: caseRecord.closedAt,

      // AI analysis (operator-full view)
      aiSummary: caseRecord.aiSummary,
      aiReasoning: caseRecord.aiReasoning,
      aiConfidence: caseRecord.aiConfidence,
      keyNeeds: caseRecord.keyNeeds,
      specialNeeds: caseRecord.specialNeeds,
      missingInformation: caseRecord.missingInformation,
      followUpQuestion: caseRecord.followUpQuestion,
      potentiallyCritical: caseRecord.potentiallyCritical,
      peopleAffected: caseRecord.peopleAffected,
      locationTextDetected: caseRecord.locationTextDetected,

      // Categories
      categories: caseRecord.categories.map((c) => c.category),

      // Assignments with full detail
      assignments: caseRecord.assignments,

      // Audit timeline
      updates: caseRecord.updates,

      // Voice call data
      voiceSessions: caseRecord.voiceCallSessions?.map((s) => ({
        id: s.id,
        status: s.status,
        callerNumber: s.callerNumber,
        detectedLanguage: s.detectedLanguage,
        transcriptText: s.transcriptText,
        turnCount: s.turnCount,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        failureReason: s.failureReason,
        turns: s.turns,
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Role OPERATOR required') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Operator case detail error:', error);
    return NextResponse.json({ error: 'Failed to load case' }, { status: 500 });
  }
}
