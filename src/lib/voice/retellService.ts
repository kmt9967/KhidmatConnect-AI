/**
 * Retell AI adapter — M9 final voice emergency intake.
 *
 * Retell owns the REALTIME conversation (listening, turn-taking, interruptions,
 * ASR, TTS, conversational LLM). KhidmatConnect remains the authoritative
 * emergency backend:
 *
 *   call_started        → capture-first provisional EmergencyCase + VoiceCallSession
 *   transcript_updated  → verbatim VoiceCallTurn persistence (dedup on utterance_id)
 *   update_case (tool)  → persist caller facts and return IMMEDIATELY; the Alibaba
 *                         Qwen analysis is scheduled detached — the voice path never
 *                         waits for AI (capture first, return fast, analyze async)
 *   call_ended          → final transcript sync + end-state machine + detached Qwen fallback
 *   call_analyzed       → Retell summary stored as REFERENCE ONLY (never drives triage)
 *
 * Core safety invariants enforced here:
 *  - Raw caller transcript is authoritative; we never rewrite it.
 *  - Missing GPS/location never blocks intake (all tool args optional).
 *  - The agent is never told "dispatched/assigned/on the way" unless a REAL
 *    active Assignment exists in KhidmatConnect (buildToolAgentMessage).
 *  - Qwen failure NEVER loses the case (recordAiAnalysisFailure path).
 *  - Idempotent against Retell's ≤3 webhook retries (unique providerCallSid,
 *    turn recordingReference dedup, terminal-state checks).
 *
 * Payload field names verified against official Retell docs (spec revision
 * 2026-09-02): event body { event, call }; call object with call_id,
 * from_number, disconnection_reason, transcript_object, call_analysis.
 */
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import {
  addVoiceTurn,
  createVoiceSession,
  getSessionByCallSid,
  handleCallDisconnect,
  isValidVoiceTransition,
  transitionVoiceSession,
} from './voiceService';
import { analyzeEmergency } from '@/lib/ai/emergencyAnalysis';
import { enrichCaseWithAiAnalysis, recordAiAnalysisFailure } from '@/lib/services/emergencyCaseService';

// ─── Retell payload types (webhook + custom function) ───────

export interface RetellUtterance {
  speaker?: string;          // "agent" | "user"
  content?: string;
  utterance_id?: string | number;
  language?: string;
}

export interface RetellCallAnalysis {
  call_summary?: string | null;
  user_sentiment?: string | null;
  call_successful?: boolean | null;
  in_voicemail?: boolean | null;
  custom_analysis_data?: unknown;
}

export interface RetellCallObject {
  call_id: string;
  agent_id?: string;
  event_timestamp?: number;
  call_type?: string;
  direction?: string;
  from_number?: string;
  to_number?: string;
  call_status?: string;      // registered | not_connected | ongoing | ended
  disconnection_reason?: string | null;
  transcript?: string | null;
  transcript_object?: { utterances?: RetellUtterance[] } | RetellUtterance[] | null;
  transcript_with_tool_calls?: unknown;
  call_analysis?: RetellCallAnalysis | null;
  metadata?: Record<string, unknown> | null;
  retell_llm_dynamic_variables?: Record<string, unknown> | null;
}

export const retellWebhookEventSchema = z.object({
  event: z.string().min(1).max(80),
  call: z.object({ call_id: z.string().min(1).max(120) }).passthrough(),
});

/**
 * Retell sends UNKNOWN optional custom-function parameters as explicit
 * `null` (observed in production: `people_affected: null` → HTTP 400 loop).
 * null must mean exactly "not provided" — normalize BEFORE validation.
 * Real invalid values (e.g. `people_affected: "five"`) are NOT coerced:
 * unknown stays unknown, bad data is still rejected.
 */
export function stripNullKeys(input: unknown): unknown {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return input;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (value !== null) out[key] = value;
  }
  return out;
}

/**
 * update_case custom-function arguments. Everything OPTIONAL — missing GPS
 * must never block intake (safety rule 8). The agent extracts these from what
 * the CALLER actually said; we store raw details verbatim and never invent.
 * null-valued keys are stripped (Retell's "unknown" representation).
 */
export const retellToolArgsSchema = z.preprocess(
  stripNullKeys,
  z.object({
    location_text: z.string().max(500).optional(),
    location_confirmed: z.boolean().optional(),
    emergency_category: z
      .enum(['RESCUE', 'MEDICAL', 'FOOD', 'WATER', 'SHELTER', 'TRANSPORT', 'SUPPLIES', 'OTHER'])
      .optional(),
    people_affected: z.number().int().min(0).max(100000).optional(),
    caller_details: z.string().max(4000).optional(),
  }).strict(),
);

export type RetellToolArgs = z.infer<typeof retellToolArgsSchema>;

// ─── Pure helpers (exported for offline unit tests) ─────────

/** Normalize Retell transcript_object into a flat utterance array. */
export function extractUtterances(call: RetellCallObject): RetellUtterance[] {
  const t = call.transcript_object;
  if (!t) return [];
  if (Array.isArray(t)) return t;
  if (Array.isArray(t.utterances)) return t.utterances;
  return [];
}

/** Map Retell speaker roles onto our stored CALLER | AI vocabulary. */
export function normalizeSpeaker(speaker: string | undefined): 'CALLER' | 'AI' | null {
  switch ((speaker ?? '').toLowerCase()) {
    case 'user':
    case 'caller':
      return 'CALLER';
    case 'agent':
    case 'assistant':
    case 'bot':
      return 'AI';
    default:
      return null;
  }
}

/**
 * Lightweight language TAG for storage only — the raw text is never modified.
 * Urdu script block (U+0600–U+06FF) detection + Latin letters → mixed.
 */
export function detectLanguageTag(text: string): 'ur' | 'en' | 'ur-en' {
  const hasUrdu = /[\u0600-\u06FF]/.test(text);
  const hasLatin = /[A-Za-z]/.test(text);
  if (hasUrdu && hasLatin) return 'ur-en';
  if (hasUrdu) return 'ur';
  return 'en';
}

/** Retell disconnection_reasons that represent a NORMAL conversation end. */
const NORMAL_DISCONNECTION_REASONS = new Set([
  'agent_hangup',
  'phone_user_released',
  'user_hangup',
]);

export function isNormalRetellDisconnect(reason: string | null | undefined): boolean {
  if (!reason) return true;
  return NORMAL_DISCONNECTION_REASONS.has(reason);
}

/**
 * NO-FALSE-DISPATCH guard (safety rule 5). Splits the custom-function reply
 * into caller-safe content vs agent instructions so tests can assert the
 * spoken text never contains dispatch claims without a real Assignment.
 */
export function buildToolAgentMessage(input: {
  caseCode: string;
  hasRealAssignment: boolean;
  assignmentSummary?: string | null;
}): { say_to_caller: string; instruction: string } {
  if (input.hasRealAssignment) {
    return {
      say_to_caller: `Your case ${input.caseCode} has a confirmed response assignment: ${input.assignmentSummary ?? 'a response team'}.`,
      instruction: 'Relay the say_to_caller content only. Add no details beyond it.',
    };
  }
  return {
    say_to_caller:
      `Emergency details have been recorded as case ${input.caseCode} and are now with a human coordinator for review. ` +
      'Please stay where it is safe and keep this phone number reachable.',
    instruction:
      'No real assignment exists yet. Do NOT tell the caller that an ambulance, responder, or help has been dispatched, assigned, or is on the way. Relay the say_to_caller content only.',
  };
}

// ─── Session resolution (recovers from a lost call_started) ─

export interface ResolvedRetellSession {
  sessionId: string;
  caseId: string;
  caseCode: string;
  isNew: boolean;
}

async function ensureRetellSession(call: RetellCallObject): Promise<ResolvedRetellSession> {
  const existing = await getSessionByCallSid(call.call_id);
  if (existing?.emergencyCase) {
    return {
      sessionId: existing.id,
      caseId: existing.emergencyCase.id,
      caseCode: existing.emergencyCase.caseCode,
      isNew: false,
    };
  }
  // call_started was lost or races ahead of us — create now (capture first).
  const created = await createVoiceSession({
    providerCallSid: call.call_id,
    callerNumber: call.from_number ?? 'unknown',
    provider: 'RETELL',
  });
  return {
    sessionId: created.sessionId,
    caseId: created.emergencyCaseId,
    caseCode: created.caseCode,
    isNew: created.isNew,
  };
}

// ─── Transcript persistence ─────────────────────────────────

/**
 * Append utterances not yet stored. Dedup is handled by addVoiceTurn via
 * recordingReference = utterance_id (fallback: stable positional key), so
 * Retell retries and incremental transcript_updated deliveries are safe.
 */
export async function syncTranscriptFromCall(sessionId: string, call: RetellCallObject): Promise<number> {
  const utterances = extractUtterances(call);
  let added = 0;

  for (let i = 0; i < utterances.length; i++) {
    const u = utterances[i];
    const speaker = normalizeSpeaker(u.speaker);
    const content = (u.content ?? '').trim();
    if (!speaker || !content) continue;

    await addVoiceTurn({
      sessionId,
      speaker,
      transcript: content, // raw text — authoritative, never rewritten
      recordingReference: u.utterance_id !== undefined ? `ut:${u.utterance_id}` : `pos:${i}`,
      detectedLanguage: speaker === 'CALLER' ? detectLanguageTag(content) : undefined,
    });
    added++;
  }

  return added;
}

// ─── Alibaba Qwen analysis (decision support — never lost) ──

async function hasPriorAiAnalysis(caseId: string): Promise<boolean> {
  const count = await prisma.caseUpdate.count({
    where: { emergencyCaseId: caseId, updateType: { in: ['AI_ANALYSIS_COMPLETED', 'AI_ANALYSIS_FAILED'] } },
  });
  return count > 0;
}

export type QwenRunStatus = 'COMPLETED' | 'FAILED' | 'SKIPPED';

// Indirection so tests can substitute the Qwen call without touching the
// network; production always uses the real Alibaba analyzer.
let qwenAnalyzer: typeof analyzeEmergency = analyzeEmergency;

/** TESTING SEAM — pass null to restore the real Qwen analyzer. */
export function setQwenAnalyzerForTests(fn: typeof analyzeEmergency | null): void {
  qwenAnalyzer = fn ?? analyzeEmergency;
}

/**
 * Run Qwen structured analysis for a case. NEVER throws — any failure path
 * records AI_ANALYSIS_FAILED and leaves the case + raw transcript intact.
 * `force` re-analyzes even when a prior analysis exists (updated facts);
 * without it, an already-analyzed case is skipped (webhook-fallback mode).
 */
export async function runQwenAnalysis(caseId: string, options: { force: boolean }): Promise<QwenRunStatus> {
  try {
    if (!options.force && (await hasPriorAiAnalysis(caseId))) return 'SKIPPED';

    const caseRecord = await prisma.emergencyCase.findUnique({
      where: { id: caseId },
      select: { originalMessage: true, source: true, locationText: true, transcript: true },
    });
    if (!caseRecord) return 'SKIPPED';

    const result = await qwenAnalyzer({
      originalMessage: caseRecord.originalMessage,
      source: String(caseRecord.source),
      locationText: caseRecord.locationText,
      transcript: caseRecord.transcript,
    });

    if (result.success && result.analysis) {
      await enrichCaseWithAiAnalysis(caseId, result.analysis);
      return 'COMPLETED';
    }
    await recordAiAnalysisFailure(caseId, result.error ?? 'Unknown AI error');
    return 'FAILED';
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[Retell] Qwen analysis pipeline error for case ${caseId}: ${msg.substring(0, 200)}`);
    try {
      await recordAiAnalysisFailure(caseId, msg);
    } catch {
      /* audit write failed — case + transcript remain, operator review still possible */
    }
    return 'FAILED';
  }
}

/** Fire-and-forget wrapper used from webhook handlers (Retell 10s timeout). */
function detachQwenFallback(caseId: string): void {
  void runQwenAnalysis(caseId, { force: false }).catch(() => undefined);
}

// Cases with Qwen analysis currently in flight (single-process best-effort
// guard so repeated update_case calls cannot pile up parallel analyses).
const qwenInFlight = new Set<string>();

/**
 * Schedule a detached (force) Qwen analysis for a case. Returns immediately —
 * the voice-critical response path NEVER awaits AI. Failures are contained
 * inside runQwenAnalysis (case + raw transcript always survive).
 */
export function scheduleQwenAnalysis(caseId: string): void {
  if (!caseId || qwenInFlight.has(caseId)) return;
  qwenInFlight.add(caseId);
  void runQwenAnalysis(caseId, { force: true })
    .catch(() => undefined)
    .finally(() => qwenInFlight.delete(caseId));
}

// ─── Real-assignment lookup (no-false-dispatch source of truth) ─

async function getActiveAssignmentSummary(caseId: string): Promise<string | null> {
  const assignment = await prisma.assignment.findFirst({
    where: {
      emergencyCaseId: caseId,
      status: { in: ['PENDING', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED'] },
    },
    orderBy: { assignedAt: 'desc' },
    include: {
      resource: { select: { name: true } },
      ambulance: { select: { identifier: true } },
      responder: { select: { name: true } },
    },
  });
  if (!assignment) return null;
  const who = assignment.responder?.name || assignment.resource?.name || assignment.ambulance?.identifier || 'response team';
  return `${who} (${assignment.status.toLowerCase()})`;
}

// ─── Webhook event dispatcher ───────────────────────────────

export async function handleRetellWebhook(event: string, call: RetellCallObject): Promise<void> {
  switch (event) {
    case 'call_started': {
      const created = await createVoiceSession({
        providerCallSid: call.call_id,
        callerNumber: call.from_number ?? 'unknown',
        provider: 'RETELL',
      });
      console.log(
        `[Retell] call_started call_id=${call.call_id} ` +
        `${created.isNew ? `provisional case ${created.caseCode} created` : 'duplicate — session reused'}`,
      );
      return;
    }

    case 'transcript_updated': {
      const session = await ensureRetellSession(call);
      const added = await syncTranscriptFromCall(session.sessionId, call);
      if (added > 0 && session.caseId) {
        await prisma.caseUpdate.create({
          data: {
            emergencyCaseId: session.caseId,
            updateType: 'VOICE_TRANSCRIPT_UPDATED',
            message: `Retell transcript sync: ${added} new utterance(s).`,
          },
        });
      }
      return;
    }

    case 'call_ended': {
      const session = await ensureRetellSession(call);
      await syncTranscriptFromCall(session.sessionId, call);

      const stored = await prisma.voiceCallSession.findUnique({
        where: { id: session.sessionId },
        select: { id: true, status: true },
      });
      if (!stored) return;

      const reason = call.disconnection_reason ?? null;
      const cleanEnd = isNormalRetellDisconnect(reason);

      if (cleanEnd && isValidVoiceTransition(stored.status, 'COMPLETED')) {
        await transitionVoiceSession({
          sessionId: session.sessionId,
          status: 'COMPLETED',
          humanReviewRequired: false,
        });
      } else if (!cleanEnd && isValidVoiceTransition(stored.status, 'DISCONNECTED')) {
        // Preserves case + partial transcript; flags human review (call dropped).
        await handleCallDisconnect(session.sessionId, `Retell disconnection: ${reason}`);
      }
      // Already terminal → duplicate delivery → no-op.

      if (session.caseId) detachQwenFallback(session.caseId);
      return;
    }

    case 'call_analyzed': {
      const session = await ensureRetellSession(call);
      const summary = call.call_analysis?.call_summary;
      if (summary && session.caseId) {
        // REFERENCE ONLY: decision-support triage remains Alibaba Qwen's job.
        await prisma.caseUpdate.create({
          data: {
            emergencyCaseId: session.caseId,
            updateType: 'OPERATOR_NOTE',
            message: `[Retell call summary — reference only] ${summary.substring(0, 1000)}`,
          },
        });
      }
      if (session.caseId) detachQwenFallback(session.caseId);
      return;
    }

    default:
      // transfer_* and unknown events: acknowledged, not errors.
      return;
  }
}

// ─── update_case custom function (FAST — never awaits AI) ───

export interface RetellToolResponse {
  ok: true;
  case_id: string;
  case_number: string;
  updated: boolean;
  /** 'pending' = facts captured, async Qwen analysis not finished yet. */
  analysis_status: 'pending' | 'analyzed' | 'needs_human_review';
  assignment_confirmed: boolean;
  say_to_caller: string;
  instruction: string;
}

/**
 * Voice-critical path — DB writes only, no external AI calls:
 *  1. resolve/recover session + provisional case (idempotent on call_id)
 *  2. persist caller-provided facts (nulls already stripped → never invented)
 *  3. audit (duplicate tool calls with identical content are NOT re-audited)
 *  4. read analysis status + REAL Assignment state (fast local reads)
 *  5. schedule detached Qwen analysis and return immediately
 */
export async function handleRetellToolCall(
  call: RetellCallObject,
  args: RetellToolArgs,
): Promise<RetellToolResponse> {
  const session = await ensureRetellSession(call);
  const caseId = session.caseId;

  const hasFacts = !!(args.location_text || args.caller_details || args.emergency_category
    || args.people_affected !== undefined);

  if (hasFacts) {
    // Persist ONLY caller-supplied facts. Unknown fields stay untouched —
    // the adapter never invents people, injuries, locations or urgency.
    const details: Record<string, unknown> = {};
    if (args.location_text) {
      details.locationText = args.location_text;
      details.locationConfirmed = args.location_confirmed ?? false;
    }
    if (args.people_affected !== undefined) details.peopleAffected = args.people_affected;
    if (args.caller_details) {
      const caseRecord = await prisma.emergencyCase.findUnique({
        where: { id: caseId },
        select: { originalMessage: true },
      });
      if (caseRecord?.originalMessage === 'Phone emergency call in progress') {
        // First real facts replace the provisional placeholder verbatim.
        details.originalMessage = args.caller_details;
      }
    }
    if (Object.keys(details).length > 0) {
      await prisma.emergencyCase.update({ where: { id: caseId }, data: details });
    }
    if (args.emergency_category) {
      await prisma.emergencyCaseCategory.createMany({
        data: [{ caseId, category: args.emergency_category }],
        skipDuplicates: true,
      });
    }

    // Audit — with exact-message dedup so Retell Flex-loop re-invocations
    // without genuinely new information cannot spam the case history.
    const auditMessage = args.caller_details
      ? `Caller-provided details (via voice assistant): "${args.caller_details.substring(0, 1000)}"`
      : `Voice assistant details recorded: ${[
          args.location_text && `location: ${args.location_text}`,
          args.emergency_category && `category: ${args.emergency_category}`,
          args.people_affected !== undefined && `people_affected: ${args.people_affected}`,
        ].filter(Boolean).join('; ')}`;
    const updateType = args.caller_details ? 'REQUESTER_INFORMATION_ADDED' : 'VOICE_AI_UPDATED';
    const existingAudit = await prisma.caseUpdate.findFirst({
      where: { emergencyCaseId: caseId, updateType, message: auditMessage },
      select: { id: true },
    });
    if (!existingAudit) {
      await prisma.caseUpdate.create({
        data: { emergencyCaseId: caseId, updateType, message: auditMessage },
      });
    }
  }

  // Fast local reads only — analysis status never triggers AI inline.
  const lastAnalysis = await prisma.caseUpdate.findFirst({
    where: { emergencyCaseId: caseId, updateType: { in: ['AI_ANALYSIS_COMPLETED', 'AI_ANALYSIS_FAILED'] } },
    orderBy: { createdAt: 'desc' },
    select: { updateType: true },
  });
  const analysis_status: RetellToolResponse['analysis_status'] = !lastAnalysis
    ? 'pending'
    : lastAnalysis.updateType === 'AI_ANALYSIS_COMPLETED' ? 'analyzed' : 'needs_human_review';

  const stored = await prisma.emergencyCase.findUnique({
    where: { id: caseId },
    select: { caseCode: true },
  });
  const assignmentSummary = await getActiveAssignmentSummary(caseId);
  const message = buildToolAgentMessage({
    caseCode: stored?.caseCode ?? session.caseCode,
    hasRealAssignment: assignmentSummary !== null,
    assignmentSummary,
  });

  // CAPTURE DONE → schedule async Qwen (best-effort, deduped in-process) and
  // return immediately. A slow/failing Qwen can never delay or break this call.
  scheduleQwenAnalysis(caseId);

  return {
    ok: true,
    case_id: caseId,
    case_number: stored?.caseCode ?? session.caseCode,
    updated: hasFacts,
    analysis_status,
    assignment_confirmed: assignmentSummary !== null,
    ...message,
  };
}
