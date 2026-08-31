import { NextRequest, NextResponse } from 'next/server';
import { assignCaseSchema } from '@/lib/validation/assignment';
import { createAssignment, getAvailableResources } from '@/lib/services/assignmentService';
import { resolveDemoOperator } from '@/lib/services/demoIdentity';

/**
 * POST /api/operator/cases/[caseCode]/assign
 *
 * Operator assigns a responder (+ optional ambulance/resource) to a case.
 *
 * TEMPORARY: Uses demo operator identity until auth is implemented.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ caseCode: string }> }
) {
  try {
    const { caseCode } = await params;
    const body = await request.json();

    // Validate input
    const parsed = assignCaseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Resolve demo operator
    const operator = await resolveDemoOperator();

    // Create assignment
    const result = await createAssignment({
      caseCode,
      responderId: parsed.data.responderId,
      ambulanceId: parsed.data.ambulanceId,
      resourceId: parsed.data.resourceId,
      operatorId: operator.id,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Assignment failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/**
 * GET /api/operator/cases/[caseCode]/assign
 * Returns available responders and ambulances for assignment UI.
 */
export async function GET() {
  try {
    const resources = await getAvailableResources();
    return NextResponse.json(resources);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to load resources' },
      { status: 500 }
    );
  }
}
