/**
 * Retell AI webhook / custom-function signature verification.
 *
 * Retell signs every webhook AND custom-function request with:
 *   X-Retell-Signature: v={timestamp_ms},d={hex_digest}
 * where d = HMAC-SHA256(rawBody + timestamp, RETELL_API_KEY).
 * The API key that carries the "webhook" badge in the Retell dashboard is the
 * HMAC secret — there is NO separate webhook secret in Retell.
 *
 * Security posture (M9 Retell integration):
 * - Verification runs on the RAW request body (never a re-serialization).
 * - Timestamps older than WEBHOOK_MAX_SKEW_MS are rejected (replay protection).
 * - Digest comparison is constant-time (crypto.timingSafeEqual).
 * - If RETELL_API_KEY is not configured the integration FAILS CLOSED.
 *
 * Verified against official Retell docs (spec revision 2026-09-02,
 * docs.retellai.com → "Secure webhook").
 */
import { createHmac, timingSafeEqual } from 'crypto';

/** Signature header format: v={timestamp_ms},d={64-char hex} */
const SIGNATURE_PATTERN = /^v=(\d+),d=([0-9a-fA-F]{64})$/;

/** Reject replays older than 5 minutes (same bound Retell's own examples use). */
export const WEBHOOK_MAX_SKEW_MS = 5 * 60 * 1000;

export function isRetellConfigured(): boolean {
  return !!process.env.RETELL_API_KEY;
}

export interface ParsedRetellSignature {
  timestampMs: number;
  digest: string;
}

/**
 * Parse the X-Retell-Signature header value. Returns null on any malformation.
 */
export function parseRetellSignature(header: string | null | undefined): ParsedRetellSignature | null {
  if (!header || typeof header !== 'string') return null;
  const match = SIGNATURE_PATTERN.exec(header.trim());
  if (!match) return null;
  const timestampMs = Number(match[1]);
  if (!Number.isFinite(timestampMs) || timestampMs <= 0) return null;
  return { timestampMs, digest: match[2].toLowerCase() };
}

/**
 * Compute the expected HMAC digest for a raw body + timestamp.
 * Exported for tests; production code should call verifyRetellSignature().
 */
export function computeRetellDigest(rawBody: string, timestampMs: number, apiKey: string): string {
  return createHmac('sha256', apiKey).update(`${rawBody}${timestampMs}`, 'utf8').digest('hex');
}

/**
 * Verify a Retell signature header against the raw request body.
 * Pure — takes the key explicitly so it is unit-testable without env access.
 */
export function verifyRetellSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  apiKey: string,
  nowMs: number = Date.now(),
): { ok: true } | { ok: false; reason: 'missing_header' | 'malformed_header' | 'stale_timestamp' | 'digest_mismatch' } {
  const parsed = parseRetellSignature(signatureHeader);
  if (!parsed) {
    return { ok: false, reason: signatureHeader ? 'malformed_header' : 'missing_header' };
  }
  if (Math.abs(nowMs - parsed.timestampMs) > WEBHOOK_MAX_SKEW_MS) {
    return { ok: false, reason: 'stale_timestamp' };
  }
  const expected = computeRetellDigest(rawBody, parsed.timestampMs, apiKey);
  const expectedBuf = Buffer.from(expected, 'utf8');
  const receivedBuf = Buffer.from(parsed.digest, 'utf8');
  if (expectedBuf.length !== receivedBuf.length || !timingSafeEqual(expectedBuf, receivedBuf)) {
    return { ok: false, reason: 'digest_mismatch' };
  }
  return { ok: true };
}

/**
 * Convenience for Next.js route handlers: verify using the configured key.
 * Returns false (and logs ONLY the reason — never body, headers or key) when
 * unconfigured or invalid, so handlers can answer 401/503 fail-closed.
 */
export function verifyRetellRequest(rawBody: string, signatureHeader: string | null | undefined, context: string): boolean {
  if (!isRetellConfigured()) {
    console.error(`[Retell] ${context}: rejected — RETELL_API_KEY not configured (fail closed)`);
    return false;
  }
  const result = verifyRetellSignature(rawBody, signatureHeader, process.env.RETELL_API_KEY as string);
  if (!result.ok) {
    console.warn(`[Retell] ${context}: signature verification failed (${result.reason})`);
    return false;
  }
  return true;
}
