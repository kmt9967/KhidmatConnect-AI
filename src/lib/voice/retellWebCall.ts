/**
 * Retell AI WEB-CALL server helper — M17 browser voice emergency intake.
 *
 * This module is the ONLY place the browser voice path touches RETELL_API_KEY,
 * and it runs exclusively on the server (imported by
 * /api/voice/retell/web-call, `runtime = 'nodejs'`). It creates a Retell WEB
 * CALL against the SAME production Conversation Flow Agent used by PSTN
 * (RETELL_AGENT_ID), so a browser call flows through the identical backend:
 *
 *   browser mic → Retell realtime agent
 *     → update_case custom function (/api/voice/retell/update-case)
 *     → webhooks                    (/api/voice/retell/webhook)
 *     → EmergencyCase → async Alibaba Qwen → Human Operator
 *
 * SECURITY MODEL
 *  • The permanent RETELL_API_KEY never leaves the server. The browser receives
 *    ONLY a short-lived `access_token` (+ opaque `call_id`) for a single call.
 *  • The agent id is chosen server-side; clients cannot override it (no second
 *    agent, no agent injection).
 *  • A best-effort in-memory rate limiter bounds public abuse.
 *  • The status poll returns minimal, non-sensitive fields — never the raw
 *    transcript, phone numbers, or any credential.
 *
 * Method + payload names verified against the installed SDK (retell-sdk@5.64.0:
 * `client.call.createWebCall(CallCreateWebCallParams)` → `WebCallResponse`).
 */
import Retell from 'retell-sdk';
import { prisma } from '@/lib/db/prisma';
import { getSessionByCallSid } from './voiceService';

// ─── Config gate ───────────────────────────────────────────

export type WebCallConfigReason = 'missing_api_key' | 'missing_agent_id';

export type WebCallConfig =
  | { ok: true; apiKey: string; agentId: string }
  | { ok: false; reason: WebCallConfigReason };

/**
 * A browser web call needs BOTH the REST key (to mint the session) and the
 * production agent id (which agent answers). Missing either → fail closed with
 * a reason the route can turn into citizen-safe copy.
 */
export function getWebCallConfig(): WebCallConfig {
  const apiKey = process.env.RETELL_API_KEY;
  const agentId = process.env.RETELL_AGENT_ID;
  if (!apiKey) return { ok: false, reason: 'missing_api_key' };
  if (!agentId) return { ok: false, reason: 'missing_agent_id' };
  return { ok: true, apiKey, agentId };
}

export function isWebCallConfigured(): boolean {
  return getWebCallConfig().ok;
}

// ─── Public payload (short-lived fields ONLY) ──────────────

export interface PublicWebCall {
  /** Short-lived room token Retell's Web SDK exchanges for a live call. */
  accessToken: string;
  /** Opaque Retell call id — the browser uses it to poll its own status. */
  callId: string;
}

/**
 * Reduce Retell's WebCallResponse to the ONLY two fields the browser needs.
 * Deliberately drops every other field (agent_id, cost, analysis, status…) so
 * no server-side detail — and never the API key — can reach a client response.
 * Pure → unit-testable.
 */
export function toPublicWebCall(webCall: { access_token: string; call_id: string }): PublicWebCall {
  return { accessToken: webCall.access_token, callId: webCall.call_id };
}

export class WebCallError extends Error {
  constructor(public readonly kind: 'config' | 'upstream', message: string) {
    super(message);
    this.name = 'WebCallError';
  }
}

/**
 * Create a Retell web call using the server-side key. Throws WebCallError on
 * misconfiguration; upstream SDK errors propagate for the route to map safely
 * (the route never returns the raw error, key, or token to the client).
 */
export async function createRetellWebCall(): Promise<PublicWebCall> {
  const cfg = getWebCallConfig();
  if (!cfg.ok) {
    throw new WebCallError('config', `Retell web call not configured (${cfg.reason})`);
  }
  const client = new Retell({ apiKey: cfg.apiKey });
  const res = await client.call.createWebCall({
    agent_id: cfg.agentId,
    // Storage-only marker (Retell ignores metadata for processing) so ops can
    // tell browser sessions apart from PSTN in the Retell dashboard.
    metadata: { source: 'WEB_BROWSER', page: 'voice-ai', created_at: Date.now() },
  });
  return toPublicWebCall(res);
}

// ─── Best-effort rate limiter (single instance) ────────────
//
// Public emergency access cannot require login, so abuse is bounded instead:
// a sliding window per caller key (IP behind nginx). This is intentionally
// simple and per-process; a multi-instance deployment would move it to Redis,
// but for the demo/single-node production box it is sufficient and never
// blocks a genuine first attempt.

const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX_PER_WINDOW = 6;
const rateBuckets = new Map<string, number[]>();

export function rateLimitWebCall(
  key: string,
  now = Date.now(),
): { allowed: boolean; retryAfterMs: number } {
  const recent = (rateBuckets.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX_PER_WINDOW) {
    rateBuckets.set(key, recent);
    return { allowed: false, retryAfterMs: Math.max(0, RATE_WINDOW_MS - (now - recent[0])) };
  }
  recent.push(now);
  rateBuckets.set(key, recent);
  return { allowed: true, retryAfterMs: 0 };
}

/** Test/rehearsal helper: clears all rate-limit buckets. */
export function resetWebCallRateLimiter(): void {
  rateBuckets.clear();
}

// ─── Real status for the browser (poll) ────────────────────

export type WebCallAnalysisStatus = 'not_found' | 'pending' | 'analyzed' | 'needs_human_review';

/**
 * Pure mapping of the last AI_ANALYSIS_* audit row onto a citizen-safe status.
 * Mirrors retellService's semantics: no row yet → 'pending'; completed →
 * 'analyzed'; failed → 'needs_human_review' (a human still owns the case).
 */
export function mapAnalysisStatus(lastAiUpdateType: string | null | undefined): WebCallAnalysisStatus {
  if (!lastAiUpdateType) return 'pending';
  return lastAiUpdateType === 'AI_ANALYSIS_COMPLETED' ? 'analyzed' : 'needs_human_review';
}

export interface WebCallStatus {
  found: boolean;
  caseCode: string | null;
  sessionStatus: string | null;
  caseStatus: string | null;
  urgency: string | null;
  analysisStatus: WebCallAnalysisStatus;
  turnCount: number;
  humanReviewRequired: boolean;
}

const NOT_FOUND_STATUS: WebCallStatus = {
  found: false,
  caseCode: null,
  sessionStatus: null,
  caseStatus: null,
  urgency: null,
  analysisStatus: 'not_found',
  turnCount: 0,
  humanReviewRequired: false,
};

/**
 * Read the REAL backend state for a web call this browser just created, keyed
 * by the opaque Retell call_id (an unguessable UUID returned only to its
 * creator — analogous to the citizen case-access token model). Returns minimal
 * status only: NEVER the raw transcript text, phone numbers, or credentials.
 * The full transcript stays with the human coordinator.
 */
export async function getWebCallStatus(callId: string): Promise<WebCallStatus> {
  if (!callId) return NOT_FOUND_STATUS;
  const session = await getSessionByCallSid(callId);
  if (!session) return NOT_FOUND_STATUS;

  const ec = session.emergencyCase;
  let analysisStatus: WebCallAnalysisStatus = 'pending';
  if (ec?.id) {
    const last = await prisma.caseUpdate.findFirst({
      where: {
        emergencyCaseId: ec.id,
        updateType: { in: ['AI_ANALYSIS_COMPLETED', 'AI_ANALYSIS_FAILED'] },
      },
      orderBy: { createdAt: 'desc' },
      select: { updateType: true },
    });
    analysisStatus = mapAnalysisStatus(last?.updateType ?? null);
  }

  return {
    found: true,
    caseCode: ec?.caseCode ?? null,
    sessionStatus: session.status,
    caseStatus: ec?.status ?? null,
    urgency: ec?.urgency ?? null,
    analysisStatus,
    turnCount: session.turnCount ?? 0,
    humanReviewRequired: session.humanReviewRequired ?? false,
  };
}
