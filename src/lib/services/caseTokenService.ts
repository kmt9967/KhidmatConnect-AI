import crypto from 'node:crypto';
import { prisma } from '@/lib/db/prisma';

const TOKEN_LENGTH = 48; // bytes → 96 hex chars
const TOKEN_EXPIRY_DAYS = 90;

/**
 * Generate a cryptographically secure case access token.
 * Returns the raw token (to give to client once) and stores only the hash.
 */
export async function generateCaseToken(emergencyCaseId: string) {
  // Generate secure random token
  const rawToken = crypto.randomBytes(TOKEN_LENGTH).toString('hex');

  // Hash the token with SHA-256
  const tokenHash = crypto
    .createHash('sha256')
    .update(rawToken)
    .digest('hex');

  // Calculate expiry
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + TOKEN_EXPIRY_DAYS);

  // Store only the hash
  await prisma.caseAccessToken.create({
    data: {
      emergencyCaseId,
      tokenHash,
      expiresAt,
    },
  });

  // Return raw token + expiry (raw token never stored)
  return {
    rawToken,
    tokenExpiresAt: expiresAt,
  };
}

/**
 * Validate a raw case access token.
 * Hashes the provided token, looks up the hash, checks expiry and revocation.
 * Returns the associated case ID if valid, null otherwise.
 */
export async function validateCaseToken(rawToken: string, expectedCaseCode?: string) {
  if (!rawToken || rawToken.length < 64) {
    return null;
  }

  // Hash the provided token
  const tokenHash = crypto
    .createHash('sha256')
    .update(rawToken)
    .digest('hex');

  // Find matching token
  const tokenRecord = await prisma.caseAccessToken.findUnique({
    where: { tokenHash },
    include: {
      emergencyCase: {
        select: { id: true, caseCode: true },
      },
    },
  });

  if (!tokenRecord) {
    return null;
  }

  // Check if revoked
  if (tokenRecord.revokedAt) {
    return null;
  }

  // Check if expired
  if (tokenRecord.expiresAt < new Date()) {
    return null;
  }

  // If expected case code provided, verify token belongs to it
  if (expectedCaseCode && tokenRecord.emergencyCase.caseCode !== expectedCaseCode) {
    return null;
  }

  return {
    caseId: tokenRecord.emergencyCase.id,
    caseCode: tokenRecord.emergencyCase.caseCode,
  };
}

/**
 * Revoke a case access token.
 */
export async function revokeCaseToken(rawToken: string): Promise<boolean> {
  const tokenHash = crypto
    .createHash('sha256')
    .update(rawToken)
    .digest('hex');

  try {
    await prisma.caseAccessToken.update({
      where: { tokenHash },
      data: { revokedAt: new Date() },
    });
    return true;
  } catch {
    return false;
  }
}
