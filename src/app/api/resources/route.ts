import { NextRequest, NextResponse } from 'next/server';
import { getResources } from '@/lib/services/resourceService';

/**
 * GET /api/resources
 * List resources with optional type/availability filters.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') ?? undefined;
    const availability = searchParams.get('availability') ?? undefined;

    const resources = await getResources({ type, availability });

    return NextResponse.json({ resources });
  } catch (error) {
    console.error('Resource listing error:', error);
    return NextResponse.json(
      { error: 'Failed to list resources' },
      { status: 500 }
    );
  }
}
