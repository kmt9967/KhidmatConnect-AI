import { NextResponse } from 'next/server';
import { getOperatorActiveCases } from '@/lib/services/assignmentService';
import { prisma } from '@/lib/db/prisma';

/**
 * GET /api/operator/cases
 * Returns active cases with assignment and location data, plus real
 * responder/ambulance availability counts for the summary metrics strip.
 */
export async function GET() {
  try {
    const [cases, availableResponders, availableAmbulances] = await Promise.all([
      getOperatorActiveCases(),
      prisma.responder.count({ where: { availabilityStatus: 'AVAILABLE' } }),
      prisma.ambulance.count({ where: { availabilityStatus: 'AVAILABLE' } }),
    ]);
    return NextResponse.json({
      cases,
      counts: { availableResponders, availableAmbulances },
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to load cases' },
      { status: 500 }
    );
  }
}
