import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

/**
 * GET /api/realtime/cases/[caseCode]
 *
 * Polling endpoint for operator/requester to get live case data.
 * Returns assignment status, responder/ambulance positions.
 *
 * Refresh interval: 10 seconds (client-controlled).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ caseCode: string }> }
) {
  try {
    const { caseCode } = await params;

    const caseRecord = await prisma.emergencyCase.findUnique({
      where: { caseCode },
      select: {
        id: true,
        caseCode: true,
        status: true,
        urgency: true,
        locationText: true,
        latitude: true,
        longitude: true,
        assignments: {
          where: {
            status: { in: ['PENDING', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED'] },
          },
          select: {
            id: true,
            status: true,
            assignedAt: true,
            acceptedAt: true,
            enRouteAt: true,
            arrivedAt: true,
            responder: {
              select: {
                name: true,
                currentLatitude: true,
                currentLongitude: true,
                lastLocationUpdateAt: true,
              },
            },
            ambulance: {
              select: {
                identifier: true,
                currentLatitude: true,
                currentLongitude: true,
                lastLocationUpdateAt: true,
              },
            },
          },
        },
      },
    });

    if (!caseRecord) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    // Return requester-safe data (no internal AI reasoning, no tokens)
    return NextResponse.json({
      caseCode: caseRecord.caseCode,
      status: caseRecord.status,
      urgency: caseRecord.urgency,
      locationText: caseRecord.locationText,
      latitude: caseRecord.latitude,
      longitude: caseRecord.longitude,
      assignments: caseRecord.assignments.map((a) => ({
        id: a.id,
        status: a.status,
        assignedAt: a.assignedAt,
        acceptedAt: a.acceptedAt,
        enRouteAt: a.enRouteAt,
        arrivedAt: a.arrivedAt,
        responder: a.responder
          ? {
              name: a.responder.name,
              latitude: a.responder.currentLatitude,
              longitude: a.responder.currentLongitude,
              lastUpdateAt: a.responder.lastLocationUpdateAt,
            }
          : null,
        ambulance: a.ambulance
          ? {
              identifier: a.ambulance.identifier,
              latitude: a.ambulance.currentLatitude,
              longitude: a.ambulance.currentLongitude,
              lastUpdateAt: a.ambulance.lastLocationUpdateAt,
            }
          : null,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to load case data' },
      { status: 500 }
    );
  }
}
