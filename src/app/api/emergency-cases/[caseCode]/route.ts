import { NextRequest, NextResponse } from 'next/server';
import { validateCaseToken } from '@/lib/services/caseTokenService';
import { getCaseByCode } from '@/lib/services/emergencyCaseService';

/**
 * GET /api/emergency-cases/[caseCode]
 * Retrieve case details with valid case access token.
 * Requires X-Case-Access-Token header.
 */
export async function GET(
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

    // Get case
    const caseData = await getCaseByCode(caseCode);
    if (!caseData) {
      return NextResponse.json(
        { error: 'Case not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(caseData);
  } catch (error) {
    console.error('Case retrieval error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve case' },
      { status: 500 }
    );
  }
}
