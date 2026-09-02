import { NextRequest, NextResponse } from 'next/server';
import { findDemoUser, setSessionCookie, type DemoRole } from '@/lib/auth/session';

/**
 * POST /api/auth/login
 *
 * Demo login — authenticates as one of the seeded demo users.
 * Body: { role: "CITIZEN" | "OPERATOR" | "RESPONDER" }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const role = body?.role as DemoRole;

    if (!role || !['CITIZEN', 'OPERATOR', 'RESPONDER'].includes(role)) {
      return NextResponse.json(
        { error: 'Invalid role. Must be CITIZEN, OPERATOR, or RESPONDER.' },
        { status: 400 }
      );
    }

    const user = await findDemoUser(role);
    if (!user) {
      return NextResponse.json(
        { error: `Demo ${role} user not found. Run database seed first.` },
        { status: 404 }
      );
    }

    await setSessionCookie({
      id: user.id,
      name: user.name,
      role: user.role as DemoRole,
    });

    // Determine redirect based on role
    const redirectUrl = role === 'OPERATOR' ? '/operator' : role === 'RESPONDER' ? '/responder' : '/dashboard';

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        email: user.email,
        phone: user.phone,
        preferredLanguage: user.preferredLanguage,
      },
      redirect: redirectUrl,
    });
  } catch (error) {
    console.error('Demo login error:', error);
    return NextResponse.json(
      { error: 'Login failed' },
      { status: 500 }
    );
  }
}
