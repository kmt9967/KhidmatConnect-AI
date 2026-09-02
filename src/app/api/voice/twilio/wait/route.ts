import { NextRequest, NextResponse } from 'next/server';
import { validateTwilioWebhook, extractSignature } from '@/lib/voice/twilioValidation';
import { prisma } from '@/lib/db/prisma';

/**
 * POST /api/voice/twilio/wait
 * 
 * Fast polling endpoint for async voice processing.
 * Checks if the background pipeline has finished generating the AI response.
 * 
 * Returns immediately (<500ms):
 * - If RESPONSE_READY: <Play> audio + <Record> for next turn
 * - If still processing: <Pause 1s/> + <Redirect> back to /wait (poll loop)
 * - If FAILED or timeout: fallback TwiML
 * 
 * The recording-action starts background processing and redirects here.
 * Twilio polls this endpoint every ~1 second until the response is ready.
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Get session ID from query params (passed via redirect URL)
    const url = new URL(request.url);
    const sessionId = url.searchParams.get('sessionId');
    const pollCount = parseInt(url.searchParams.get('pollCount') || '0', 10);

    if (!sessionId) {
      console.error('[Voice/Wait] Missing sessionId');
      return twimlResponse(buildFallbackTwiML());
    }

    // Validate Twilio signature
    const signature = extractSignature(request.headers);
    const baseUrl = process.env.TWILIO_WEBHOOK_BASE_URL || url.origin;
    const fullWebhookUrl = `${baseUrl.replace(/\/$/, '')}/api/voice/twilio/wait` +
      (url.search || '');

    const formData = await request.formData();
    const params: Record<string, string> = {};
    formData.forEach((value, key) => {
      params[key] = String(value);
    });

    const validation = validateTwilioWebhook(fullWebhookUrl, params, signature);
    if (!validation.valid) {
      console.error('[Voice/Wait] Validation failed: ' + validation.reason);
      return twimlResponse(buildFallbackTwiML(), 403);
    }

    // Check processing state from DB
    const session = await prisma.voiceCallSession.findUnique({
      where: { id: sessionId },
      select: {
        processingState: true,
        responseAudioPath: true,
        responseText: true,
        detectedLanguage: true,
        turnCount: true,
        processingStartedAt: true,
      },
    });

    if (!session) {
      console.error('[Voice/Wait] Session not found: ' + sessionId.substring(0, 20));
      return twimlResponse(buildFallbackTwiML());
    }

    const state = session.processingState;
    const elapsed = session.processingStartedAt
      ? Date.now() - new Date(session.processingStartedAt).getTime()
      : 0;

    console.log('[Voice/Wait] Poll #' + pollCount + ' sid=' + sessionId.substring(0, 20) +
      ' state=' + state + ' elapsed=' + elapsed + 'ms');

    // RESPONSE_READY — play the AI response and record next turn
    if (state === 'RESPONSE_READY' && session.responseAudioPath) {
      const baseUrl = process.env.TWILIO_WEBHOOK_BASE_URL || url.origin;
      const audioUrl = `${baseUrl.replace(/\/$/, '')}/api/voice/audio/${sessionId}`;
      const recordActionUrl = `${baseUrl.replace(/\/$/, '')}/api/voice/twilio/recording-action`;
      const lang = session.detectedLanguage === 'URDU' ? 'ur' : 'en';

      console.log('[Voice/Wait] RESPONSE_READY: playing audio, sid=' + sessionId.substring(0, 20));

      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${escapeXml(audioUrl)}</Play>
  <Record
    action="${escapeXml(recordActionUrl)}"
    method="POST"
    maxLength="20"
    playBeep="false"
    trim="trim-silence"
    transcribe="false"
    timeout="3"
  />
</Response>`;

      return twimlResponse(twiml);
    }

    // FAILED — return fallback
    if (state === 'FAILED') {
      console.error('[Voice/Wait] Processing FAILED, sid=' + sessionId.substring(0, 20));
      return twimlResponse(buildRetryTwiMLForWait(baseUrl.replace(/\/$/, ''), sessionId, lang(session)));
    }

    // Timeout — if processing has taken too long, return fallback
    const MAX_WAIT_MS = 30_000; // 30 seconds max
    if (elapsed > MAX_WAIT_MS) {
      console.error('[Voice/Wait] Timeout after ' + elapsed + 'ms, sid=' + sessionId.substring(0, 20));
      return twimlResponse(buildRetryTwiMLForWait(baseUrl.replace(/\/$/, ''), sessionId, lang(session)));
    }

    // Max poll count — prevent infinite loops
    const MAX_POLLS = 25;
    if (pollCount >= MAX_POLLS) {
      console.error('[Voice/Wait] Max polls reached, sid=' + sessionId.substring(0, 20));
      return twimlResponse(buildRetryTwiMLForWait(baseUrl.replace(/\/$/, ''), sessionId, lang(session)));
    }

    // STILL PROCESSING — pause briefly and redirect back to /wait
    const nextPollCount = pollCount + 1;
    const waitUrl = new URL('/api/voice/twilio/wait', baseUrl);
    waitUrl.searchParams.set('sessionId', sessionId);
    waitUrl.searchParams.set('pollCount', String(nextPollCount));

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Redirect method="POST">${escapeXml(waitUrl.toString())}</Redirect>
</Response>`;

    const responseTime = Date.now() - startTime;
    console.log('[Voice/Wait] Still processing, redirecting poll #' + nextPollCount +
      ' responseTime=' + responseTime + 'ms');

    return twimlResponse(twiml);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Voice/Wait] Error: ' + msg.substring(0, 300));
    return twimlResponse(buildFallbackTwiML());
  }
}

// ─── Helpers ────────────────────────────────────────────────

function twimlResponse(twiml: string, status = 200): NextResponse {
  return new NextResponse(twiml, {
    status,
    headers: { 'Content-Type': 'text/xml' },
  });
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function lang(session: { detectedLanguage: string | null }): 'en' | 'ur' {
  return session.detectedLanguage === 'URDU' ? 'ur' : 'en';
}

function buildFallbackTwiML(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="en-US">Please hold while we process your request.</Say>
  <Hangup/>
</Response>`;
}

function buildRetryTwiMLForWait(baseUrl: string, sessionId: string, language: 'en' | 'ur'): string {
  // Return a simple retry prompt — ask caller to repeat
  if (language === 'ur') {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="ur-PK">معذرت، دوبارہ بتائیں۔</Say>
  <Record
    action="${escapeXml(baseUrl)}/api/voice/twilio/recording-action"
    method="POST"
    maxLength="20"
    playBeep="false"
    trim="trim-silence"
    transcribe="false"
    timeout="3"
  />
</Response>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="en-US">Sorry, could you please repeat that?</Say>
  <Record
    action="${escapeXml(baseUrl)}/api/voice/twilio/recording-action"
    method="POST"
    maxLength="20"
    playBeep="false"
    trim="trim-silence"
    transcribe="false"
    timeout="3"
  />
</Response>`;
}
