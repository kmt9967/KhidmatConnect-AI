import { NextRequest, NextResponse } from 'next/server';
import { validateCaseToken } from '@/lib/services/caseTokenService';
import { addRequesterUpdate, getCaseByCode } from '@/lib/services/emergencyCaseService';
import { addCaseUpdateSchema } from '@/lib/validation/emergencyCase';

/**
 * POST /api/emergency-cases/[caseCode]/updates
 * Add requester information update to a case.
 * Requires X-Case-Access-Token header.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ caseCode: string }> }
) {
  try {
    const { caseCode } = await params;

    // Get access token from header
    const rawToken = request.headers.get('X-Case-Access-Token');
    if (!rawToken) {
      return NextResponse.json(
        { error: 'Access token required' },
        { status: 401 }
      );
    }

    // Validate token
    const tokenResult = await validateCaseToken(rawToken, caseCode);
    if (!tokenResult) {
      return NextResponse.json(
        { error: 'Invalid, expired, or revoked access token' },
        { status: 403 }
      );
    }

    // Validate body
    const body = await request.json();
    const parsed = addCaseUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Add update
    await addRequesterUpdate(tokenResult.caseId, parsed.data.message);

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error('Case update error:', error);
    return NextResponse.json(
      { error: 'Failed to add case update' },
      { status: 500 }
    );
  }
}
