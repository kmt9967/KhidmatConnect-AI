import { NextRequest, NextResponse } from 'next/server';
import { getResponderCurrentAssignment } from '@/lib/services/assignmentService';

/**
 * GET /api/responder/assignments/current
 *
 * Returns the current active assignment for a responder.
 * Uses responderId from query param (demo mode).
 */
export async function GET(request: NextRequest) {
  const responderId = request.nextUrl.searchParams.get('responderId');

  if (!responderId) {
    return NextResponse.json(
      { error: 'responderId query parameter is required' },
      { status: 400 }
    );
  }

  try {
    const assignment = await getResponderCurrentAssignment(responderId);

    if (!assignment) {
      return NextResponse.json({ assignment: null });
    }

    return NextResponse.json({ assignment });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to load assignment' },
      { status: 500 }
    );
  }
}
