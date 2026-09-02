/**
 * M10 — Demo Authentication Session
 *
 * Lightweight JWT session stored in an HTTP-only cookie.
 * This is NOT production authentication — it's a hackathon demo layer.
 *
 * Server helpers:
 *   getCurrentUser(req)  — returns user or null
 *   requireUser(req)     — returns user or throws
 *   requireRole(req, role) — returns user or throws if wrong role
 */

import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db/prisma';

// ─── Types ──────────────────────────────────────────────────

export type DemoRole = 'CITIZEN' | 'OPERATOR' | 'RESPONDER';

export interface SessionPayload {
  userId: string;
  role: DemoRole;
  name: string;
}

export interface DemoUser {
  id: string;
  name: string | null;
  role: DemoRole;
  email: string | null;
  phone: string | null;
  preferredLanguage: string;
}

// ─── Configuration ──────────────────────────────────────────

const COOKIE_NAME = 'kc_session';
const SESSION_MAX_AGE = 60 * 60 * 24; // 24 hours in seconds

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET || 'khidmatconnect-demo-secret-dev-only';
  return new TextEncoder().encode(secret);
}

// ─── JWT Operations ─────────────────────────────────────────

async function createSessionToken(payload: SessionPayload): Promise<string> {
  const secret = getSecret();
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secret);
  return token;
}

async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const secret = getSecret();
    const { payload } = await jwtVerify(token, secret);
    return {
      userId: payload.userId as string,
      role: payload.role as DemoRole,
      name: payload.name as string,
    };
  } catch {
    return null;
  }
}

// ─── Server Helpers ─────────────────────────────────────────

/**
 * Get the current authenticated user from the session cookie.
 * Returns null if not authenticated.
 */
export async function getCurrentUser(): Promise<DemoUser | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(COOKIE_NAME);
  if (!cookie?.value) return null;

  const payload = await verifySessionToken(cookie.value);
  if (!payload) return null;

  // Verify user still exists in DB
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      name: true,
      role: true,
      email: true,
      phone: true,
      preferredLanguage: true,
    },
  });

  if (!user) return null;

  return {
    id: user.id,
    name: user.name,
    role: user.role as DemoRole,
    email: user.email,
    phone: user.phone,
    preferredLanguage: user.preferredLanguage,
  };
}

/**
 * Require an authenticated user. Throws if not authenticated.
 */
export async function requireUser(): Promise<DemoUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('Authentication required');
  }
  return user;
}

/**
 * Require a user with a specific role. Throws if wrong role or not authenticated.
 */
export async function requireRole(role: DemoRole): Promise<DemoUser> {
  const user = await requireUser();
  if (user.role !== role) {
    throw new Error(`Role ${role} required`);
  }
  return user;
}

// ─── Cookie Management ──────────────────────────────────────

/**
 * Set the session cookie with a JWT token for the given user.
 */
export async function setSessionCookie(user: { id: string; name: string | null; role: DemoRole }): Promise<string> {
  const token = await createSessionToken({
    userId: user.id,
    role: user.role,
    name: user.name || 'Demo User',
  });

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });

  return token;
}

/**
 * Clear the session cookie (logout).
 */
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

// ─── Demo Accounts ──────────────────────────────────────────

export interface DemoAccount {
  role: DemoRole;
  label: string;
  labelUr: string;
  phone: string;
  description: string;
  descriptionUr: string;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    role: 'CITIZEN',
    label: 'Citizen Demo',
    labelUr: 'شہری ڈیمو',
    phone: '0300-8241001',
    description: 'Ahmed Tariq — View cases, requests, messages',
    descriptionUr: 'احمد طارق — کیسز، درخواستیں، پیغامات دیکھیں',
  },
  {
    role: 'OPERATOR',
    label: 'Operator Demo',
    labelUr: 'آپریٹر ڈیمو',
    phone: '0300-1122001',
    description: 'Fatima — Command center, case review, assignment',
    descriptionUr: 'فاطمہ — کمانڈ سینٹر، کیس جائزہ، تفویض',
  },
  {
    role: 'RESPONDER',
    label: 'Responder Demo',
    labelUr: 'ریسپونڈر ڈیمو',
    phone: '0333-5121001',
    description: 'Ahmed Khan — Assigned cases, navigation, status',
    descriptionUr: 'احمد خان — تفویض کردہ کیسز، نیویگیشن، اسٹیٹس',
  },
];

/**
 * Find a demo user by role from the database.
 */
export async function findDemoUser(role: DemoRole) {
  const account = DEMO_ACCOUNTS.find((a) => a.role === role);
  if (!account) return null;

  const user = await prisma.user.findFirst({
    where: { phone: account.phone },
    select: {
      id: true,
      name: true,
      role: true,
      email: true,
      phone: true,
      preferredLanguage: true,
    },
  });

  return user;
}
