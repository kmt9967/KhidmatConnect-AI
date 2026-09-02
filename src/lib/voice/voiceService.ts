/**
 * Voice call service — core logic for Milestone 9.
 *
 * Handles:
 * - VoiceCallSession creation with CallSid deduplication
 * - EmergencyCase pre-creation for voice calls
 * - Voice session state machine
 * - Transcript persistence
 * - Call drop resilience
 * - Session completion/disconnect
 */

import { prisma } from '@/lib/db/prisma';
import type { VoiceCallStatus } from '@prisma/client';

// ─── Types ──────────────────────────────────────────────────

export interface CreateVoiceSessionInput {
  providerCallSid: string;
  callerNumber: string;
}

export interface VoiceSessionResult {
  sessionId: string;
  emergencyCaseId: string;
  caseCode: string;
  isNew: boolean;
}

export interface AddTurnInput {
  sessionId: string;
  speaker: 'CALLER' | 'AI';
  transcript: string;
  recordingReference?: string;
  detectedLanguage?: string;
}

export interface UpdateSessionInput {
  sessionId: string;
  status: VoiceCallStatus;
  detectedLanguage?: string;
  transcriptText?: string;
  humanReviewRequired?: boolean;
  failureReason?: string;
}

// ─── Valid State Transitions ────────────────────────────────

const VALID_TRANSITIONS: Record<string, VoiceCallStatus[]> = {
  ACTIVE: ['PROCESSING', 'COMPLETED', 'DISCONNECTED', 'FAILED'],
  PROCESSING: ['ACTIVE', 'COMPLETED', 'DISCONNECTED', 'FAILED'],
  COMPLETED: [],
  DISCONNECTED: ['COMPLETED', 'FAILED'],
  FAILED: [],
};

export function isValidVoiceTransition(from: string, to: VoiceCallStatus): boolean {
  const allowed = VALID_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

// ─── Session Creation with Deduplication ────────────────────

/**
 * Create a voice call session with idempotency on providerCallSid.
 *
 * If a session already exists for this CallSid (Twilio retry),
 * returns the existing session without creating a duplicate.
 *
 * Also creates an EmergencyCase with source=VOICE_CALL immediately,
 * before any speech analysis — "capture first" principle.
 */
export async function createVoiceSession(input: CreateVoiceSessionInput): Promise<VoiceSessionResult> {
  // Use try/catch with P2002 handling for race-condition safety.
  // The unique constraint on providerCallSid is the final guard.
  try {
    const result = await prisma.$transaction(async (tx) => {
      // Check inside transaction to prevent race (Twilio webhook retry)
      const existing = await tx.voiceCallSession.findUnique({
        where: { providerCallSid: input.providerCallSid },
      });

      if (existing) {
        return { session: existing, caseCode: '', isDuplicate: true };
      }

      // 1. Generate case code
      const year = new Date().getFullYear();
      const latestCase = await tx.emergencyCase.findFirst({
        where: { caseCode: { startsWith: `KC-${year}-` } },
        orderBy: { caseCode: 'desc' },
        select: { caseCode: true },
      });

      let nextNum = 1;
      if (latestCase) {
        const parts = latestCase.caseCode.split('-');
        const lastNum = parseInt(parts[2], 10);
        if (!isNaN(lastNum)) nextNum = lastNum + 1;
      }
      const caseCode = `KC-${year}-${nextNum.toString().padStart(6, '0')}`;

      // 2. Create emergency case (capture first — before any speech analysis)
      const emergencyCase = await tx.emergencyCase.create({
        data: {
          caseCode,
          source: 'VOICE_CALL',
          primaryContact: input.callerNumber,
          originalMessage: 'Phone emergency call in progress',
          status: 'NEW',
        },
      });

      // 3. Create CASE_CREATED audit entry
      await tx.caseUpdate.create({
        data: {
          emergencyCaseId: emergencyCase.id,
          updateType: 'CASE_CREATED',
          message: `Emergency case ${caseCode} created via voice call.`,
        },
      });

      // 4. Create voice call session linked to the case
      const session = await tx.voiceCallSession.create({
        data: {
          providerCallSid: input.providerCallSid,
          callerNumber: input.callerNumber,
          emergencyCaseId: emergencyCase.id,
          status: 'ACTIVE',
        },
      });

      // 5. Create VOICE_CALL_STARTED audit entry
      await tx.caseUpdate.create({
        data: {
          emergencyCaseId: emergencyCase.id,
          updateType: 'VOICE_CALL_STARTED',
          message: `Voice call session started. CallSid: ${input.providerCallSid.substring(0, 20)}...`,
        },
      });

      return { session, caseCode, isDuplicate: false };
    });

    if (result.isDuplicate) {
      return {
        sessionId: result.session.id,
        emergencyCaseId: result.session.emergencyCaseId || '',
        caseCode: '',
        isNew: false,
      };
    }

    return {
      sessionId: result.session.id,
      emergencyCaseId: result.session.emergencyCaseId || '',
      caseCode: result.caseCode,
      isNew: true,
    };
  } catch (err: unknown) {
    // Handle unique constraint race condition (P2002)
    if (typeof err === 'object' && err !== null && 'code' in err && (err as any).code === 'P2002') {
      const fallback = await prisma.voiceCallSession.findUnique({
        where: { providerCallSid: input.providerCallSid },
      });
      if (fallback) {
        return {
          sessionId: fallback.id,
          emergencyCaseId: fallback.emergencyCaseId || '',
          caseCode: '',
          isNew: false,
        };
      }
    }
    throw err;
  }
}

// ─── Turn Management ────────────────────────────────────────

/**
 * Add a transcript turn to a voice session.
 * Also updates the cumulative transcript on the session and the emergency case.
 * Uses a transaction to ensure consistency.
 */
export async function addVoiceTurn(input: AddTurnInput): Promise<void> {
  const session = await prisma.voiceCallSession.findUnique({
    where: { id: input.sessionId },
  });

  if (!session || !session.emergencyCaseId) {
    throw new Error(`Voice session ${input.sessionId} not found or has no linked case`);
  }

  const caseId = session.emergencyCaseId;

  await prisma.$transaction(async (tx) => {
    // Idempotency: skip duplicate recordingReference (Twilio retry race)
    if (input.recordingReference) {
      const existingTurn = await tx.voiceCallTurn.findFirst({
        where: {
          voiceCallSessionId: input.sessionId,
          recordingReference: input.recordingReference,
        },
      });
      if (existingTurn) {
        // Duplicate — skip silently (Twilio retry)
        return;
      }
    }

    // 1. Create the turn record
    await tx.voiceCallTurn.create({
      data: {
        voiceCallSessionId: input.sessionId,
        speaker: input.speaker,
        transcript: input.transcript,
        recordingReference: input.recordingReference,
        detectedLanguage: input.detectedLanguage,
      },
    });

    // 2. Update session turn count and cumulative transcript
    const currentTranscript = session.transcriptText || '';
    const newTurnText = `[${input.speaker}]: ${input.transcript}\n`;
    const updatedTranscript = currentTranscript + newTurnText;

    await tx.voiceCallSession.update({
      where: { id: input.sessionId },
      data: {
        turnCount: { increment: 1 },
        transcriptText: updatedTranscript,
        lastActivityAt: new Date(),
      },
    });

    // 3. Update emergency case transcript
    await tx.emergencyCase.update({
      where: { id: caseId },
      data: {
        transcript: updatedTranscript,
      },
    });

    // 4. Create audit entry
    await tx.caseUpdate.create({
      data: {
        emergencyCaseId: caseId,
        updateType: 'VOICE_TRANSCRIPT_UPDATED',
        message: `${input.speaker} turn: "${input.transcript.substring(0, 200)}"`,
      },
    });
  });
}

// ─── Session State Management ───────────────────────────────

/**
 * Transition a voice session to a new status.
 * Validates the transition is allowed.
 */
export async function transitionVoiceSession(input: UpdateSessionInput): Promise<void> {
  const session = await prisma.voiceCallSession.findUnique({
    where: { id: input.sessionId },
  });

  if (!session) {
    throw new Error(`Voice session ${input.sessionId} not found`);
  }

  if (!isValidVoiceTransition(session.status, input.status)) {
    throw new Error(
      `Invalid voice session transition: ${session.status} → ${input.status}`
    );
  }

  await prisma.voiceCallSession.update({
    where: { id: input.sessionId },
    data: {
      status: input.status,
      detectedLanguage: input.detectedLanguage,
      transcriptText: input.transcriptText,
      humanReviewRequired: input.humanReviewRequired,
      failureReason: input.failureReason,
      endedAt: (input.status === 'COMPLETED' || input.status === 'FAILED') ? new Date() : undefined,
      lastActivityAt: new Date(),
    },
  });

  // Create audit entry if linked to a case
  if (session.emergencyCaseId) {
    const auditType = input.status === 'COMPLETED'
      ? 'VOICE_CALL_COMPLETED'
      : input.status === 'DISCONNECTED'
        ? 'VOICE_CALL_DISCONNECTED'
        : null;

    if (auditType) {
      await prisma.caseUpdate.create({
        data: {
          emergencyCaseId: session.emergencyCaseId,
          updateType: auditType as any,
          message: `Voice call ${input.status.toLowerCase()}.${input.failureReason ? ` Reason: ${input.failureReason.substring(0, 200)}` : ''}`,
        },
      });
    }
  }
}

// ─── Call Drop Handler ──────────────────────────────────────

/**
 * Handle a caller disconnect.
 * Preserves the case, transcript, and marks human review required
 * if the case information is incomplete.
 *
 * CRITICAL: Never deletes the emergency case.
 */
export async function handleCallDisconnect(sessionId: string, reason?: string): Promise<void> {
  const session = await prisma.voiceCallSession.findUnique({
    where: { id: sessionId },
  });

  if (!session) return;

  // Determine if human review is needed (incomplete case)
  let humanReviewRequired = session.humanReviewRequired;
  if (session.emergencyCaseId) {
    const caseRecord = await prisma.emergencyCase.findUnique({
      where: { id: session.emergencyCaseId },
      select: {
        locationText: true,
        aiSummary: true,
        urgency: true,
        transcript: true,
      },
    });

    if (caseRecord) {
      // If no location or no AI analysis, mark for human review
      if (!caseRecord.locationText || !caseRecord.aiSummary) {
        humanReviewRequired = true;
      }
    }
  }

  await transitionVoiceSession({
    sessionId,
    status: 'DISCONNECTED',
    humanReviewRequired,
    failureReason: reason || 'Caller disconnected',
  });
}

// ─── Query Helpers ──────────────────────────────────────────

/**
 * Get a voice session by CallSid (for webhook deduplication).
 */
export async function getSessionByCallSid(callSid: string) {
  return prisma.voiceCallSession.findUnique({
    where: { providerCallSid: callSid },
    include: {
      emergencyCase: {
        select: {
          id: true,
          caseCode: true,
          source: true,
          status: true,
          urgency: true,
          transcript: true,
          detectedLanguage: true,
          locationText: true,
          aiSummary: true,
          potentiallyCritical: true,
        },
      },
      turns: {
        orderBy: { createdAt: 'asc' },
        take: 50,
      },
    },
  });
}

/**
 * Get recent voice call sessions for operator visibility.
 */
export async function getRecentVoiceSessions(limit = 20) {
  return prisma.voiceCallSession.findMany({
    orderBy: { startedAt: 'desc' },
    take: limit,
    include: {
      emergencyCase: {
        select: {
          caseCode: true,
          source: true,
          status: true,
          urgency: true,
          detectedLanguage: true,
          aiSummary: true,
          locationText: true,
          potentiallyCritical: true,
          transcript: true,
        },
      },
    },
  });
}

/**
 * Get a voice session by ID with full details.
 */
export async function getVoiceSessionById(sessionId: string) {
  return prisma.voiceCallSession.findUnique({
    where: { id: sessionId },
    include: {
      emergencyCase: true,
      turns: {
        orderBy: { createdAt: 'asc' },
      },
    },
  });
}
