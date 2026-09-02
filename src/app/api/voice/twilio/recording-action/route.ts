import { NextRequest, NextResponse } from 'next/server';
import { validateTwilioWebhook, extractSignature, getWebhookUrl } from '@/lib/voice/twilioValidation';
import { prisma } from '@/lib/db/prisma';
import { processCallerRecordingAsync } from '@/lib/voice/voiceOrchestration';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * POST /api/voice/twilio/recording-action
 * 
 * Twilio Record action callback — called after caller finishes speaking.
 * 
 * ASYNC ARCHITECTURE (to avoid Twilio timeout):
 * 1. Validate request + persist recording info (< 100ms)
 * 2. Start background processing (fire-and-forget)
 * 3. Return immediately with:
 *    - <Play> short acknowledgement audio
 *    - <Redirect> to /api/voice/twilio/wait (polling endpoint)
 * 
 * Total response time: < 500ms
 * 
 * The background pipeline (ASR → AI → TTS) runs independently.
 * The /wait endpoint polls the DB state and returns <Play> + <Record>
 * once the response audio is ready.
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const WEBHOOK_PATH = '/api/voice/twilio/recording-action';

    const formData = await request.formData();
    const callSid = formData.get('CallSid') as string;
    const recordingSid = formData.get('RecordingSid') as string;
    const recordingUrl = formData.get('RecordingUrl') as string;

    if (!callSid || !recordingSid) {
      console.error('[Voice] Missing CallSid or RecordingSid in recording action');
      return twimlResponse(
        '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>'
      );
    }

    // Validate Twilio signature
    const signature = extractSignature(request.headers);
    const webhookUrl = getWebhookUrl(request, WEBHOOK_PATH);
    const params: Record<string, string> = {};
    formData.forEach((value, key) => {
      params[key] = String(value);
    });

    const validation = validateTwilioWebhook(webhookUrl, params, signature);
    if (!validation.valid) {
      console.error('[Voice] Recording action validation failed: ' + validation.reason);
      return twimlResponse(
        '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Invalid request.</Say><Hangup/></Response>',
        403
      );
    }

    // Idempotency: check if this recording was already processed (Twilio retry)
    const session = await prisma.voiceCallSession.findFirst({
      where: { providerCallSid: callSid },
      select: { id: true, processingState: true },
    });

    if (session) {
      const existingTurn = await prisma.voiceCallTurn.findFirst({
        where: { voiceCallSessionId: session.id, recordingReference: recordingSid },
      });
      if (existingTurn) {
        console.log('[Voice] Duplicate recording callback ignored: ' + recordingSid.substring(0, 20));
        // Already processed — redirect to wait in case response wasn't delivered
        const baseUrl = process.env.TWILIO_WEBHOOK_BASE_URL || new URL(request.url).origin;
        const waitUrl = new URL('/api/voice/twilio/wait', baseUrl);
        waitUrl.searchParams.set('sessionId', session.id);
        waitUrl.searchParams.set('pollCount', '0');
        return twimlResponse(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Redirect method="POST">${escapeXml(waitUrl.toString())}</Redirect>
</Response>`);
      }
    }

    // Mark recording received in DB
    if (session) {
      await prisma.voiceCallSession.update({
        where: { id: session.id },
        data: {
          processingState: 'RECORDING_RECEIVED',
          recordingReference: recordingSid,
        },
      });
    }

    const baseUrl = process.env.TWILIO_WEBHOOK_BASE_URL || new URL(request.url).origin;

    // Start background processing (fire-and-forget — do NOT await)
    processCallerRecordingAsync(callSid, recordingUrl, recordingSid, baseUrl).catch(err => {
      console.error('[Voice] Background processing error: ' +
        (err instanceof Error ? err.message : String(err)));
    });

    // Build the wait URL for redirect
    const waitUrl = new URL('/api/voice/twilio/wait', baseUrl);
    waitUrl.searchParams.set('sessionId', session?.id || '');
    waitUrl.searchParams.set('pollCount', '0');

    const responseTime = Date.now() - startTime;
    console.log('[Voice] Recording action: sid=' + callSid.substring(0, 20) +
      ' recSid=' + recordingSid.substring(0, 20) +
      ' → async processing started, redirecting to wait (' + responseTime + 'ms)');

    // Return IMMEDIATELY with acknowledgement + redirect to polling endpoint.
    // The acknowledgement is a short pre-generated audio clip.
    const ackAudioUrl = `${baseUrl.replace(/\/$/, '')}/api/voice/audio/acknowledgement_ur`;

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${escapeXml(ackAudioUrl)}</Play>
  <Redirect method="POST">${escapeXml(waitUrl.toString())}</Redirect>
</Response>`;

    return twimlResponse(twiml);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Voice] Recording action error: ' + msg.substring(0, 300));

    return twimlResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Say language="en-US">Please hold.</Say><Hangup/></Response>'
    );
  }
}

function twimlResponse(twiml: string, status = 200): NextResponse {
  return new NextResponse(twiml, {
    status,
    headers: { 'Content-Type': 'text/xml' },
  });
}
