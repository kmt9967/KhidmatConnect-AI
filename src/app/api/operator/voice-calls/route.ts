import { NextResponse } from 'next/server';
import { getRecentVoiceSessions } from '@/lib/voice/voiceService';
import { maskPhoneNumber } from '@/lib/voice/twilioClient';

/**
 * GET /api/operator/voice-calls
 * Returns recent voice call sessions for operator visibility.
 * Caller phone numbers are masked for privacy.
 * No Twilio credentials or recording URLs are exposed.
 */
export async function GET() {
  try {
    const sessions = await getRecentVoiceSessions(20);

    const safeSessions = sessions.map((session) => ({
      id: session.id,
      status: session.status,
      callerMasked: maskPhoneNumber(session.callerNumber),
      detectedLanguage: session.detectedLanguage,
      turnCount: session.turnCount,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      humanReviewRequired: session.humanReviewRequired,
      transcriptAvailable: !!session.transcriptText,
      caseInfo: session.emergencyCase
        ? {
            caseCode: session.emergencyCase.caseCode,
            status: session.emergencyCase.status,
            urgency: session.emergencyCase.urgency,
            aiSummary: session.emergencyCase.aiSummary,
            locationText: session.emergencyCase.locationText,
            potentiallyCritical: session.emergencyCase.potentiallyCritical,
            detectedLanguage: session.emergencyCase.detectedLanguage,
          }
        : null,
    }));

    return NextResponse.json({ sessions: safeSessions });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Voice] Operator voice calls error: ' + msg.substring(0, 200));
    return NextResponse.json({ error: 'Failed to fetch voice calls' }, { status: 500 });
  }
}
