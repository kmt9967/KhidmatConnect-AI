import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';

/**
 * POST /api/operator/cases/[caseCode]/notes
 *
 * Operator adds a note to a case. Stored as CaseUpdate with OPERATOR_NOTE type.
 * Requires OPERATOR role.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ caseCode: string }> }
) {
  try {
    const operator = await requireRole('OPERATOR');
    const { caseCode } = await params;
    const body = await request.json();
    const message = body?.message?.trim();

    if (!message || message.length < 2) {
      return NextResponse.json({ error: 'Note message is required' }, { status: 400 });
    }

    // Verify case exists
    const caseRecord = await prisma.emergencyCase.findUnique({
      where: { caseCode },
      select: { id: true },
    });
    if (!caseRecord) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    const note = await prisma.caseUpdate.create({
      data: {
        emergencyCaseId: caseRecord.id,
        updateType: 'OPERATOR_NOTE',
        message: message.substring(0, 1000),
        createdByUserId: operator.id,
      },
    });

    return NextResponse.json({ success: true, note }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'Role OPERATOR required') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Operator note error:', error);
    return NextResponse.json({ error: 'Failed to add note' }, { status: 500 });
  }
}
