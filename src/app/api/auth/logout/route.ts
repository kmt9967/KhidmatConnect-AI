import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/auth/session';

/**
 * POST /api/auth/logout
 *
 * Clears the session cookie.
 */
export async function POST() {
  await clearSessionCookie();
  return NextResponse.json({ success: true, redirect: '/login' });
}

/**
 * GET /api/auth/logout
 *
 * Also supports GET for simple link-based logout.
 */
export async function GET() {
  await clearSessionCookie();
  return NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'));
}
