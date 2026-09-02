/**
 * Voice call orchestration — ties together Twilio, ASR, Qwen, and TTS.
 *
 * This is the core turn-loop logic for a voice emergency call.
 *
 * Flow:
 * 1. Recording arrives from Twilio
 * 2. Retrieve audio from Twilio
 * 3. Send to Alibaba ASR for transcription
 * 4. Persist transcript
 * 5. Run Qwen emergency analysis on cumulative transcript
 * 6. Update case with AI analysis
 * 7. Generate TTS response
 * 8. Return TwiML for next turn
 *
 * CRITICAL: Case is pre-created before any speech analysis.
 * If any step fails, the case still exists.
 */

import { prisma } from '@/lib/db/prisma';
import { analyzeEmergency } from '@/lib/ai/emergencyAnalysis';
import { fastVoiceResponse } from '@/lib/ai/fastVoiceConversation';
import { enrichCaseWithAiAnalysis, recordAiAnalysisFailure } from '@/lib/services/emergencyCaseService';
import {
  createVoiceSession,
  addVoiceTurn,
  transitionVoiceSession,
  handleCallDisconnect,
  getSessionByCallSid,
} from './voiceService';
import { transcribeAudio as googleTranscribe, isAsrConfigured as isGoogleAsrConfigured, normalizeTranscript } from './googleAsr';
import { transcribeAudio as alibabaTranscribe, isAsrConfigured as isAlibabaAsrConfigured } from './alibabaAsr';
import { synthesizeSpeech as synthesizeSpeechAlibaba, buildFollowUpText, buildCompletionText, buildRetryText } from './alibabaTts';
import { synthesizeSpeechGoogle, isGoogleTtsConfigured } from './googleTts';
import {
  buildGreetingTwiML,
  buildResponseTwiML,
  buildCompletionTwiML,
  buildRetryTwiML,
} from './twilioClient';
import { storeAudioToDisk } from './audioStorage';

// ─── Types ──────────────────────────────────────────────────

export interface ProcessRecordingResult {
  twiml: string;
  sessionId: string;
  caseCode: string;
  asrSuccess: boolean;
  aiSuccess: boolean;
  ttsSuccess: boolean;
  ttsFallback: boolean;
  callCompleted: boolean;
}

// ─── Constants ──────────────────────────────────────────────

const MAX_TURNS = 8; // Maximum conversation turns before forced completion
const MIN_TRANSCRIPT_LENGTH = 3; // Minimum characters for a meaningful transcript

// ─── Main Orchestration ─────────────────────────────────────

/**
 * Process a caller recording and return TwiML for the next step.
 *
 * This is the main entry point called from the recording action webhook.
 * It handles the full ASR → Qwen → TTS pipeline with graceful degradation.
 */
export async function processCallerRecording(
  callSid: string,
  recordingUrl: string,
  recordingSid: string,
  webhookBaseUrl: string
): Promise<ProcessRecordingResult> {
  // 1. Find existing session by CallSid
  const session = await getSessionByCallSid(callSid);
  if (!session) {
    console.error('[Voice] No session found for CallSid: ' + callSid.substring(0, 20));
    return {
      twiml: buildCompletionTwiML('An error occurred. Please try again later.'),
      sessionId: '',
      caseCode: '',
      asrSuccess: false,
      aiSuccess: false,
      ttsSuccess: false,
      ttsFallback: false,
      callCompleted: true,
    };
  }

  const sessionId = session.id;
  const caseCode = session.emergencyCase?.caseCode || '';
  const caseId = session.emergencyCaseId || '';
  const recordActionUrl = webhookBaseUrl + '/api/voice/twilio/recording-action';

  // Idempotency: check if this recording was already processed (Twilio retry)
  if (recordingSid) {
    const existingTurn = await prisma.voiceCallTurn.findFirst({
      where: { voiceCallSessionId: sessionId, recordingReference: recordingSid },
    });
    if (existingTurn) {
      console.log('[Voice] Duplicate recording callback ignored: ' + recordingSid.substring(0, 20));
      // Return a safe TwiML that continues the call without re-processing
      return {
        twiml: buildRetryTwiML(recordActionUrl),
        sessionId,
        caseCode,
        asrSuccess: true, // Already processed successfully
        aiSuccess: true,
        ttsSuccess: false,
        ttsFallback: true,
        callCompleted: false,
      };
    }
  }

  // 2. Check turn limit
  if (session.turnCount >= MAX_TURNS) {
    return await completeCall(sessionId, caseId, caseCode, 'Maximum turns reached', recordActionUrl, webhookBaseUrl);
  }

  // 3. Retrieve and transcribe audio
  let transcript: string | null = null;
  let asrSuccess = false;
  let detectedLanguage: string | null = null;
  let asrProvider: string = 'none';

  try {
    // Download recording from Twilio
    const { retrieveTwilioRecording } = await import('./twilioClient');
    const audioBuffer = await retrieveTwilioRecording(recordingSid, recordingUrl);

    if (audioBuffer) {
      // PRIMARY: Google Cloud Speech-to-Text V2 (Chirp 2)
      // Best for Urdu/Roman Urdu/mixed language support
      if (isGoogleAsrConfigured()) {
        try {
          const googleResult = await googleTranscribe(audioBuffer, 'audio/wav');
          if (googleResult.success && googleResult.transcript) {
            transcript = normalizeTranscript(googleResult.transcript);
            asrSuccess = true;
            asrProvider = 'google-chirp-2';
            // Map Google language code to our internal format
            detectedLanguage = mapGoogleLanguage(googleResult.language);
            console.log('[Voice] Google ASR succeeded: ' + transcript.substring(0, 80));
          } else {
            console.log('[Voice] Google ASR failed: ' + (googleResult.error || 'unknown'));
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          console.error('[Voice] Google ASR error: ' + msg.substring(0, 200));
        }
      }

      // FALLBACK: Alibaba ASR (only for English/non-Urdu)
      // Use only if Google ASR failed and Alibaba is configured
      if (!asrSuccess && isAlibabaAsrConfigured()) {
        try {
          const alibabaResult = await alibabaTranscribe(audioBuffer, 'audio/wav');
          if (alibabaResult.success && alibabaResult.transcript) {
            transcript = normalizeTranscript(alibabaResult.transcript);
            asrSuccess = true;
            asrProvider = 'alibaba-qwen3-asr';
            detectedLanguage = alibabaResult.language;
            console.log('[Voice] Alibaba ASR fallback succeeded: ' + transcript.substring(0, 80));
          } else {
            console.log('[Voice] Alibaba ASR fallback failed: ' + (alibabaResult.error || 'unknown'));
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          console.error('[Voice] Alibaba ASR fallback error: ' + msg.substring(0, 200));
        }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Voice] Recording processing error: ' + msg.substring(0, 200));
  }

  // 4. Handle ASR failure
  if (!asrSuccess || !transcript || transcript.length < MIN_TRANSCRIPT_LENGTH) {
    // Log ASR failure
    if (caseId) {
      await prisma.caseUpdate.create({
        data: {
          emergencyCaseId: caseId,
          updateType: 'VOICE_ASR_FAILED',
          message: 'ASR failed or returned empty transcript. Asking caller to repeat.',
        },
      });
    }

    // Increment turn count even on ASR failure to bound the retry loop
    await prisma.voiceCallSession.update({
      where: { id: sessionId },
      data: { turnCount: { increment: 1 }, lastActivityAt: new Date() },
    });

    // Check if too many consecutive failures (use updated turnCount as proxy)
    const updatedTurnCount = session.turnCount + 1;
    if (updatedTurnCount >= 4) {
      // Route to human review after repeated failures
      await transitionVoiceSession({
        sessionId,
        status: 'COMPLETED',
        humanReviewRequired: true,
        failureReason: 'Repeated ASR failure',
      });
      return {
        twiml: buildCompletionTwiML(
          'Your call has been noted for operator review. Someone will call you back.',
          detectedLanguage === 'URDU' ? 'ur' : 'en'
        ),
        sessionId,
        caseCode,
        asrSuccess: false,
        aiSuccess: false,
        ttsSuccess: false,
        ttsFallback: false,
        callCompleted: true,
      };
    }

    // Ask caller to repeat
    return {
      twiml: buildRetryTwiML(recordActionUrl),
      sessionId,
      caseCode,
      asrSuccess: false,
      aiSuccess: false,
      ttsSuccess: false,
      ttsFallback: false,
      callCompleted: false,
    };
  }

  // 5. Persist caller turn
  await addVoiceTurn({
    sessionId,
    speaker: 'CALLER',
    transcript: transcript,
    recordingReference: recordingSid,
    detectedLanguage: detectedLanguage || undefined,
  });

  // Update session language if detected
  if (detectedLanguage && !session.detectedLanguage) {
    await prisma.voiceCallSession.update({
      where: { id: sessionId },
      data: { detectedLanguage },
    });
  }

  // 6. TWO-MODEL STRATEGY:
  // FAST: qwen-turbo for immediate conversational response (~300-500ms)
  // FULL: qwen3.7-plus for deep analysis (~10s) — runs async after fast response
  let aiSuccess = false;
  let followUpQuestion: string | null = null;
  let potentiallyCritical = false;
  const lang: 'en' | 'ur' = detectedLanguage === 'URDU' || detectedLanguage === 'MIXED' ? 'ur' : 'en';

  // Get case state for fast model context
  const caseRecord = caseId ? await prisma.emergencyCase.findUnique({
    where: { id: caseId },
    select: { aiSummary: true, locationText: true, locationTextDetected: true },
  }) : null;
  const hasLocation = !!(caseRecord?.locationText || caseRecord?.locationTextDetected);
  const hasDescription = !!(caseRecord?.aiSummary);

  // 6a. FAST MODEL — immediate conversational response
  let responseText = '';
  let fastVoiceLang: 'en' | 'ur' = lang;

  if (caseId) {
    try {
      // Get cumulative transcript
      const updatedSession = await prisma.voiceCallSession.findUnique({
        where: { id: sessionId },
        select: { transcriptText: true },
      });
      const cumulativeTranscript = updatedSession?.transcriptText || transcript;

      const fastResult = await fastVoiceResponse({
        callerTranscript: transcript,
        cumulativeTranscript,
        detectedLanguage,
        turnCount: session.turnCount,
        hasLocation,
        hasDescription,
      });

      if (fastResult.success && fastResult.responseText) {
        responseText = fastResult.responseText;
        fastVoiceLang = fastResult.language;
        aiSuccess = true;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error('[Voice] Fast model error: ' + msg.substring(0, 200));
    }
  }

  // 6b. FULL ANALYSIS — runs async, does NOT block the voice response
  // Fire-and-forget: enrich case in background
  if (caseId) {
    // Don't await — let it run in background
    runFullAnalysisAsync(sessionId, caseId, transcript, session.turnCount).catch(err => {
      console.error('[Voice] Async analysis error: ' + (err instanceof Error ? err.message : String(err)));
    });
  }

  // 7. Determine if call should complete
  // Use case state (async analysis may have already updated it)
  const updatedCase = caseId ? await prisma.emergencyCase.findUnique({
    where: { id: caseId },
    select: { aiSummary: true, locationText: true, locationTextDetected: true, potentiallyCritical: true, transcript: true },
  }) : null;
  const shouldComplete = await checkCallCompletionFromState(sessionId, caseId, updatedCase, session.turnCount);

  if (shouldComplete) {
    return await completeCall(sessionId, caseId, caseCode, 'Sufficient information gathered', recordActionUrl, webhookBaseUrl);
  }

  // 9. Generate TTS response
  let ttsSuccess = false;
  let ttsFallback = false;
  let audioUrl: string | null = null;
  const ttsLang: 'en' | 'ur' = fastVoiceLang;

  // Try Google Puck TTS first, then Alibaba fallback
  try {
    let ttsResult: { success: boolean; audioBuffer: Buffer | null; audioFormat: string } = { success: false, audioBuffer: null, audioFormat: 'wav' };

    if (isGoogleTtsConfigured()) {
      const googleResult = await synthesizeSpeechGoogle(responseText, ttsLang);
      if (googleResult.success && googleResult.audioBuffer) {
        ttsResult = { success: true, audioBuffer: googleResult.audioBuffer, audioFormat: googleResult.audioFormat };
      }
    }
    if (!ttsResult.success) {
      const alibabaResult = await synthesizeSpeechAlibaba(responseText, ttsLang);
      if (alibabaResult.success && alibabaResult.audioBuffer) {
        ttsResult = { success: true, audioBuffer: alibabaResult.audioBuffer, audioFormat: alibabaResult.audioFormat };
      }
    }

    if (ttsResult.success && ttsResult.audioBuffer) {
      audioUrl = webhookBaseUrl + '/api/voice/audio/' + sessionId;
      ttsSuccess = true;
      await storeTemporaryAudio(sessionId, ttsResult.audioBuffer, ttsResult.audioFormat);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Voice] TTS error: ' + msg.substring(0, 200));
  }

  // TTS fallback to Twilio <Say>
  if (!ttsSuccess) {
    ttsFallback = true;
    if (caseId) {
      await prisma.caseUpdate.create({
        data: {
          emergencyCaseId: caseId,
          updateType: 'VOICE_TTS_FALLBACK',
          message: 'Alibaba TTS failed. Using Twilio Say fallback.',
        },
      });
    }
  }

  // 10. Add AI turn to session
  await addVoiceTurn({
    sessionId,
    speaker: 'AI',
    transcript: responseText,
    detectedLanguage: detectedLanguage || undefined,
  });

  // 11. Return TwiML with response audio + next recording
  return {
    twiml: buildResponseTwiML(audioUrl, responseText, recordActionUrl, ttsLang),
    sessionId,
    caseCode,
    asrSuccess,
    aiSuccess,
    ttsSuccess,
    ttsFallback,
    callCompleted: false,
  };
}

// ─── Helpers ────────────────────────────────────────────────

/**
 * Run full emergency analysis asynchronously (fire-and-forget).
 * Uses qwen3.7-plus for deep structured analysis.
 * Does NOT block the voice response — caller already got fast model reply.
 */
async function runFullAnalysisAsync(
  sessionId: string,
  caseId: string,
  transcript: string,
  turnCount: number
): Promise<void> {
  try {
    // Get cumulative transcript
    const updatedSession = await prisma.voiceCallSession.findUnique({
      where: { id: sessionId },
      select: { transcriptText: true },
    });
    const cumulativeTranscript = updatedSession?.transcriptText || transcript;

    const analysis = await analyzeEmergency({
      originalMessage: transcript,
      source: 'VOICE_CALL',
      transcript: cumulativeTranscript,
    });

    if (analysis.success && analysis.analysis) {
      await enrichCaseWithAiAnalysis(caseId, analysis.analysis);

      // Create audit entry
      await prisma.caseUpdate.create({
        data: {
          emergencyCaseId: caseId,
          updateType: 'VOICE_AI_UPDATED',
          message: 'AI analysis updated from voice turn (async). Urgency: ' + analysis.analysis.urgency,
        },
      });

      // If critical, update case status immediately
      if (analysis.analysis.potentiallyCritical) {
        await prisma.emergencyCase.update({
          where: { id: caseId },
          data: { potentiallyCritical: true },
        });
      }
    } else {
      await recordAiAnalysisFailure(caseId, analysis.error || 'Voice AI analysis failed');
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Voice] Full analysis error: ' + msg.substring(0, 200));
    await recordAiAnalysisFailure(caseId, msg);
  }
}

/**
 * Check if the call has gathered enough information to complete.
 * Uses case state directly (async analysis may have updated it).
 */
async function checkCallCompletionFromState(
  sessionId: string,
  caseId: string,
  caseRecord: { aiSummary: string | null; locationText: string | null; locationTextDetected: string | null; potentiallyCritical: boolean; transcript: string | null } | null,
  turnCount: number
): Promise<boolean> {
  if (!caseId || !caseRecord) return false;

  const hasLocation = !!(caseRecord.locationText || caseRecord.locationTextDetected);
  const hasDescription = !!(caseRecord.aiSummary);
  const hasTranscript = !!(caseRecord.transcript && caseRecord.transcript.length > 20);

  // Complete if: critical + location known
  if (caseRecord.potentiallyCritical && hasLocation && hasDescription) return true;

  // Complete if: enough info (description + location + 3+ turns)
  if (hasDescription && hasLocation && turnCount >= 3) return true;

  // Complete if: approaching max turns and have basic info
  if (turnCount >= MAX_TURNS - 1 && hasTranscript) return true;

  return false;
}

/**
 * Check if the call has gathered enough information to complete.
 * @deprecated Use checkCallCompletionFromState instead.
 */
async function checkCallCompletion(
  _sessionId: string,
  _caseId: string,
  _aiSuccess: boolean,
  _potentiallyCritical: boolean,
  _turnCount: number
): Promise<boolean> {
  return false;
}

/**
 * Complete the call with a goodbye message.
 */
async function completeCall(
  sessionId: string,
  caseId: string,
  caseCode: string,
  reason: string,
  _recordActionUrl: string,
  webhookBaseUrl: string
): Promise<ProcessRecordingResult> {
  const session = await prisma.voiceCallSession.findUnique({
    where: { id: sessionId },
    select: { detectedLanguage: true },
  });

  const lang = session?.detectedLanguage === 'URDU' ? 'ur' : 'en';
  const completionText = buildCompletionText(caseCode || 'pending', lang);

  // Try Google Puck TTS first, then Alibaba fallback
  let ttsSuccess = false;
  try {
    let ttsResult: { success: boolean; audioBuffer: Buffer | null; audioFormat: string } = { success: false, audioBuffer: null, audioFormat: 'wav' };

    if (isGoogleTtsConfigured()) {
      const googleResult = await synthesizeSpeechGoogle(completionText, lang);
      if (googleResult.success && googleResult.audioBuffer) {
        ttsResult = { success: true, audioBuffer: googleResult.audioBuffer, audioFormat: googleResult.audioFormat };
      }
    }
    if (!ttsResult.success) {
      const alibabaResult = await synthesizeSpeechAlibaba(completionText, lang);
      if (alibabaResult.success && alibabaResult.audioBuffer) {
        ttsResult = { success: true, audioBuffer: alibabaResult.audioBuffer, audioFormat: alibabaResult.audioFormat };
      }
    }

    if (ttsResult.success && ttsResult.audioBuffer) {
      await storeTemporaryAudio(sessionId + '_complete', ttsResult.audioBuffer, ttsResult.audioFormat);
      ttsSuccess = true;
    }
  } catch {
    // TTS failure — Twilio <Say> fallback handles it
  }

  // Update session status
  await transitionVoiceSession({
    sessionId,
    status: 'COMPLETED',
  });

  return {
    twiml: ttsSuccess
      ? '<?xml version="1.0" encoding="UTF-8"?><Response><Play>' + webhookBaseUrl + '/api/voice/audio/' + sessionId + '_complete</Play><Hangup/></Response>'
      : buildCompletionTwiML(completionText, lang),
    sessionId,
    caseCode,
    asrSuccess: true,
    aiSuccess: true,
    ttsSuccess,
    ttsFallback: !ttsSuccess,
    callCompleted: true,
  };
}

/**
 * Count consecutive ASR failures from recent turns.
 */
/**
 * Count consecutive ASR failures from recent turns.
 * NOTE: This function is kept for reference but the retry bounding
 * is now done via turnCount increment on ASR failure (see processCallerRecording).
 */
function countConsecutiveAsrFailures(_turns: { speaker: string }[]): number {
  // ASR failures are not stored as turns, so this approach is deprecated.
  // Retry bounding is now done via turnCount in processCallerRecording.
  return 0;
}

// ─── Temporary Audio Storage ────────────────────────────────

// In-memory audio cache for Twilio playback
// Key: sessionId, Value: { buffer, format, createdAt }
const audioCache = new Map<string, { buffer: Buffer; format: string; createdAt: number }>();

/**
 * Store a temporary audio buffer for Twilio to play.
 * Audio expires after 5 minutes.
 */
async function storeTemporaryAudio(sessionId: string, buffer: Buffer, format: string): Promise<void> {
  // Clean old entries (older than 5 minutes)
  const now = Date.now();
  for (const [key, value] of audioCache.entries()) {
    if (now - value.createdAt > 5 * 60 * 1000) {
      audioCache.delete(key);
    }
  }

  audioCache.set(sessionId, { buffer, format, createdAt: now });
}

/**
 * Retrieve a temporary audio buffer for serving to Twilio.
 */
export function getTemporaryAudio(sessionId: string): { buffer: Buffer; format: string } | null {
  const entry = audioCache.get(sessionId);
  if (!entry) return null;

  // Check expiry
  if (Date.now() - entry.createdAt > 5 * 60 * 1000) {
    audioCache.delete(sessionId);
    return null;
  }

  return { buffer: entry.buffer, format: entry.format };
}

/**
 * Map Google language code to our internal language format.
 * Google returns BCP-47 codes like 'ur-PK', 'en-US', etc.
 *
 * Internal language model (voice architecture):
 *   URDU  — includes Urdu script AND Roman Urdu (spoken Urdu, regardless of script)
 *   ENGLISH
 *   MIXED_URDU_ENGLISH — natural code-switching common in Pakistani speech
 *
 * IMPORTANT: Roman Urdu is a writing/transcription convention, NOT a separate
 * spoken language. "Meri ammi behosh hain" is Urdu whether written in
 * Urdu script or Roman transliteration.
 */
function mapGoogleLanguage(googleLang: string | null): string | null {
  if (!googleLang) return null;
  const lang = googleLang.toLowerCase();
  if (lang.startsWith('ur')) return 'URDU';
  if (lang.startsWith('hi')) return 'URDU'; // Hindi script may indicate Urdu
  if (lang.startsWith('en')) return 'ENGLISH';
  return 'UNKNOWN';
}

/**
 * Initialize a voice call — called from the incoming webhook.
 * Returns TwiML greeting + recording prompt.
 */
export async function initializeVoiceCall(
  callSid: string,
  callerNumber: string,
  webhookBaseUrl: string
): Promise<{ twiml: string; sessionId: string; caseCode: string }> {
  const recordActionUrl = webhookBaseUrl + '/api/voice/twilio/recording-action';

  // Create session + pre-create case
  const result = await createVoiceSession({
    providerCallSid: callSid,
    callerNumber,
  });

  return {
    twiml: buildGreetingTwiML(recordActionUrl, 'ur', webhookBaseUrl),
    sessionId: result.sessionId,
    caseCode: result.caseCode,
  };
}

/**
 * Handle call status change (disconnect, completion, etc.)
 */
export async function handleCallStatusChange(
  callSid: string,
  callStatus: string
): Promise<void> {
  const session = await getSessionByCallSid(callSid);
  if (!session) return;

  // Only process terminal states
  const terminalStates = ['completed', 'failed', 'busy', 'no-answer', 'canceled', 'disconnect'];
  if (!terminalStates.includes(callStatus.toLowerCase())) return;

  // Skip if already in terminal state
  if (['COMPLETED', 'FAILED'].includes(session.status)) return;

  if (callStatus.toLowerCase() === 'completed') {
    // Normal completion — session should already be marked COMPLETED
    if (session.status === 'ACTIVE' || session.status === 'PROCESSING') {
      await handleCallDisconnect(session.id, 'Call completed by network');
    }
  } else {
    // Abnormal disconnect
    await handleCallDisconnect(session.id, 'Call ' + callStatus);
  }
}

// ─── Async Background Processing ────────────────────────────

/**
 * Process caller recording asynchronously in the background.
 * This function runs the full pipeline (ASR → AI → TTS) without blocking
 * the Twilio webhook. State is persisted to DB so the /wait endpoint can poll.
 * 
 * Called from /recording-action after it returns immediately.
 */
export async function processCallerRecordingAsync(
  callSid: string,
  recordingUrl: string,
  recordingSid: string,
  webhookBaseUrl: string
): Promise<void> {
  const session = await getSessionByCallSid(callSid);
  if (!session) {
    console.error('[Voice/Async] No session found for CallSid: ' + callSid.substring(0, 20));
    return;
  }

  const sessionId = session.id;
  const caseId = session.emergencyCaseId || '';

  try {
    // Update state to PROCESSING_ASR
    await prisma.voiceCallSession.update({
      where: { id: sessionId },
      data: { processingState: 'PROCESSING_ASR', processingStartedAt: new Date() },
    });

    // 1. Download and transcribe
    const { retrieveTwilioRecording } = await import('./twilioClient');
    const audioBuffer = await retrieveTwilioRecording(recordingSid, recordingUrl);

    if (!audioBuffer) {
      throw new Error('Recording download failed');
    }

    // 2. ASR
    let transcript: string | null = null;
    let detectedLanguage: string | null = null;

    if (isGoogleAsrConfigured()) {
      const googleResult = await googleTranscribe(audioBuffer, 'audio/wav');
      if (googleResult.success && googleResult.transcript) {
        transcript = normalizeTranscript(googleResult.transcript);
        detectedLanguage = mapGoogleLanguage(googleResult.language);
        console.log('[Voice/Async] Google ASR succeeded: ' + transcript.substring(0, 80));
      }
    }

    if (!transcript && isAlibabaAsrConfigured()) {
      const alibabaResult = await alibabaTranscribe(audioBuffer, 'audio/wav');
      if (alibabaResult.success && alibabaResult.transcript) {
        transcript = normalizeTranscript(alibabaResult.transcript);
        detectedLanguage = alibabaResult.language;
        console.log('[Voice/Async] Alibaba ASR succeeded: ' + transcript.substring(0, 80));
      }
    }

    if (!transcript || transcript.length < MIN_TRANSCRIPT_LENGTH) {
      throw new Error('ASR failed or empty transcript');
    }

    // Update state to PROCESSING_AI
    await prisma.voiceCallSession.update({
      where: { id: sessionId },
      data: { processingState: 'PROCESSING_AI' },
    });

    // 3. Persist caller turn
    await addVoiceTurn({
      sessionId,
      speaker: 'CALLER',
      transcript,
      recordingReference: recordingSid,
      detectedLanguage: detectedLanguage || undefined,
    });

    if (detectedLanguage && !session.detectedLanguage) {
      await prisma.voiceCallSession.update({
        where: { id: sessionId },
        data: { detectedLanguage },
      });
    }

    // 4. Fast AI response
    const lang: 'en' | 'ur' = detectedLanguage === 'URDU' || detectedLanguage === 'MIXED' ? 'ur' : 'en';
    const updatedSession = await prisma.voiceCallSession.findUnique({
      where: { id: sessionId },
      select: { transcriptText: true },
    });
    const cumulativeTranscript = updatedSession?.transcriptText || transcript;

    // Check case state for context
    const caseRecord = caseId ? await prisma.emergencyCase.findUnique({
      where: { id: caseId },
      select: { aiSummary: true, locationText: true, locationTextDetected: true },
    }) : null;

    const fastResult = await fastVoiceResponse({
      callerTranscript: transcript,
      cumulativeTranscript,
      detectedLanguage,
      turnCount: session.turnCount,
      hasLocation: !!(caseRecord?.locationText || caseRecord?.locationTextDetected),
      hasDescription: !!(caseRecord?.aiSummary),
    });

    const responseText = fastResult.success && fastResult.responseText ? fastResult.responseText : 'Please continue.';
    const ttsLang: 'en' | 'ur' = fastResult.language || lang;

    // Update state to PROCESSING_TTS
    await prisma.voiceCallSession.update({
      where: { id: sessionId },
      data: { processingState: 'PROCESSING_TTS', responseText },
    });

    // 5. Generate TTS — PRIMARY: Google Puck, FALLBACK: Alibaba
    let ttsResult = { success: false, audioBuffer: null as Buffer | null, audioFormat: 'wav', error: null as string | null };

    if (isGoogleTtsConfigured()) {
      const googleResult = await synthesizeSpeechGoogle(responseText, ttsLang);
      if (googleResult.success && googleResult.audioBuffer) {
        ttsResult = { success: true, audioBuffer: googleResult.audioBuffer, audioFormat: googleResult.audioFormat, error: null };
        console.log('[Voice/Async] Google Puck TTS succeeded: latency=' + googleResult.latencyMs + 'ms');
      } else {
        console.log('[Voice/Async] Google Puck TTS failed: ' + (googleResult.error || 'unknown'));
      }
    }

    // Fallback to Alibaba TTS
    if (!ttsResult.success) {
      const alibabaResult = await synthesizeSpeechAlibaba(responseText, ttsLang);
      if (alibabaResult.success && alibabaResult.audioBuffer) {
        ttsResult = { success: true, audioBuffer: alibabaResult.audioBuffer, audioFormat: alibabaResult.audioFormat, error: null };
        console.log('[Voice/Async] Alibaba TTS fallback succeeded');
      } else {
        console.log('[Voice/Async] Alibaba TTS fallback failed: ' + (alibabaResult.error || 'unknown'));
      }
    }

    if (!ttsResult.success || !ttsResult.audioBuffer) {
      throw new Error('TTS failed (Google + Alibaba): ' + (ttsResult.error || 'unknown'));
    }

    // 6. Store audio to disk
    const audioFilename = storeAudioToDisk(sessionId, ttsResult.audioBuffer, ttsResult.audioFormat);

    // 7. Add AI turn
    await addVoiceTurn({
      sessionId,
      speaker: 'AI',
      transcript: responseText,
      detectedLanguage: detectedLanguage || undefined,
    });

    // 8. Increment turn count
    await prisma.voiceCallSession.update({
      where: { id: sessionId },
      data: {
        turnCount: { increment: 1 },
        lastActivityAt: new Date(),
        processingState: 'RESPONSE_READY',
        responseAudioPath: audioFilename,
        processingCompletedAt: new Date(),
      },
    });

    console.log('[Voice/Async] RESPONSE_READY: sid=' + sessionId.substring(0, 20) +
      ' audio=' + audioFilename);

    // 9. Fire-and-forget full analysis (async, doesn't block voice response)
    if (caseId) {
      runFullAnalysisAsync(sessionId, caseId, transcript, session.turnCount).catch(err => {
        console.error('[Voice/Async] Analysis error: ' + (err instanceof Error ? err.message : String(err)));
      });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Voice/Async] Pipeline failed: ' + msg.substring(0, 300));

    // Mark as failed
    await prisma.voiceCallSession.update({
      where: { id: sessionId },
      data: { processingState: 'FAILED', processingCompletedAt: new Date() },
    }).catch(() => {});
  }
}
