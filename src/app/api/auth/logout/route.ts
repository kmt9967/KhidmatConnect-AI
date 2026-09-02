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
export async function GET(request: Request) {
  await clearSessionCookie();
  // Relative-safe redirect: prefer canonical APP_BASE_URL, else the current
  // request origin (works behind nginx without any hardcoded localhost).
  const base = process.env.APP_BASE_URL || new URL(request.url).origin;
  return NextResponse.redirect(new URL('/login', base));
}
