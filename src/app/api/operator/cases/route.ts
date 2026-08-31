import { NextResponse } from 'next/server';
import { getOperatorActiveCases } from '@/lib/services/assignmentService';

/**
 * GET /api/operator/cases
 * Returns active cases with assignment and location data.
 */
export async function GET() {
  try {
    const cases = await getOperatorActiveCases();
    return NextResponse.json({ cases });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to load cases' },
      { status: 500 }
    );
  }
}
