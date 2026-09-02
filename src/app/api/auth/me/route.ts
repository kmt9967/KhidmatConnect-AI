import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';

/**
 * GET /api/auth/me
 *
 * Returns the current authenticated user or 401 if not authenticated.
 */
export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
      email: user.email,
      phone: user.phone,
      preferredLanguage: user.preferredLanguage,
    },
  });
}
