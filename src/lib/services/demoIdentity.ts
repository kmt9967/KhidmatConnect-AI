/**
 * Demo identity resolution for Milestone 8.
 *
 * TEMPORARY: Until full auth is implemented, this module resolves
 * a demo operator and responder from seeded database records.
 *
 * TECHNICAL DEBT: This must be replaced with real auth middleware.
 * All functions here are clearly marked as demo-only.
 */

import { prisma } from '@/lib/db/prisma';

/**
 * Resolve the demo operator user.
 * Returns the seeded operator (Fatima) from the database.
 */
export async function resolveDemoOperator() {
  const operator = await prisma.user.findFirst({
    where: { role: 'OPERATOR' },
    select: { id: true, name: true, role: true },
  });
  if (!operator) {
    throw new Error('No demo operator found in database. Run prisma db seed.');
  }
  return operator;
}

/**
 * Resolve a demo responder by ID.
 * Validates the responder exists and returns safe fields.
 */
export async function resolveDemoResponder(responderId: string) {
  const responder = await prisma.responder.findUnique({
    where: { id: responderId },
    include: {
      user: { select: { id: true, name: true, role: true } },
    },
  });
  if (!responder) {
    throw new Error(`Responder ${responderId} not found`);
  }
  return responder;
}

/**
 * Resolve a demo responder by a simple identifier (for dev convenience).
 * Accepts either a cuid ID or a name substring match.
 */
export async function resolveResponderByIdentifier(identifier: string) {
  // Try exact ID first
  const byId = await prisma.responder.findUnique({
    where: { id: identifier },
    include: { user: { select: { id: true, name: true } } },
  });
  if (byId) return byId;

  // Try name match
  const byName = await prisma.responder.findFirst({
    where: { name: { contains: identifier, mode: 'insensitive' } },
    include: { user: { select: { id: true, name: true } } },
  });
  if (byName) return byName;

  throw new Error(`Responder "${identifier}" not found`);
}
