import { NextRequest, NextResponse } from 'next/server';
import { validateTwilioWebhook, extractSignature } from '@/lib/voice/twilioValidation';
import { processCallerRecording } from '@/lib/voice/voiceOrchestration';

/**
 * POST /api/voice/twilio/continue
 * 
 * Phase 2 of voice call processing.
 * Called via <Redirect> from recording-action after caller speaks.
 * 
 * The recording-action returns immediately (< 500ms) with:
 *   <Say>acknowledgement</Say><Redirect>/api/voice/twilio/continue</Redirect>
 * 
 * This endpoint handles the heavy pipeline (ASR → AI → TTS) and returns
 * the final TwiML with <Play> + <Record>.
 * 
 * This avoids Twilio timeout on the recording-action callback.
 */
export async function POST(request: NextRequest) {
  try {
    // Twilio does NOT forward RecordingSid/RecordingUrl in the POST body
    // when following a <Redirect> from a <Record> action. We pass them
    // via query parameters in the redirect URL instead.
    const url = new URL(request.url);
    const queryCallSid = url.searchParams.get('callSid');
    const queryRecordingSid = url.searchParams.get('recordingSid');
    const queryRecordingUrl = url.searchParams.get('recordingUrl');

    const formData = await request.formData();
    // Prefer query params (from redirect), fall back to form data
    const callSid = queryCallSid || (formData.get('CallSid') as string);
    const recordingSid = queryRecordingSid || (formData.get('RecordingSid') as string);
    const recordingUrl = queryRecordingUrl || (formData.get('RecordingUrl') as string);

    if (!callSid || !recordingSid) {
      console.error('[Voice/Continue] Missing CallSid or RecordingSid (query + form)');
      return new NextResponse(
        '<?xml version="1.0" encoding="UTF-8"?><Response><Say>An error occurred.</Say><Hangup/></Response>',
        { status: 200, headers: { 'Content-Type': 'text/xml' } }
      );
    }

    // Validate Twilio signature.
    // IMPORTANT: Twilio signs the FULL URL including query parameters.
    // We must reconstruct the exact URL Twilio used for signature computation.
    const signature = extractSignature(request.headers);
    const baseUrl = process.env.TWILIO_WEBHOOK_BASE_URL || url.origin;
    const fullWebhookUrl = `${baseUrl.replace(/\/$/, '')}/api/voice/twilio/continue` +
      (url.search || '');

    const params: Record<string, string> = {};
    formData.forEach((value, key) => {
      params[key] = String(value);
    });

    const validation = validateTwilioWebhook(fullWebhookUrl, params, signature);
    if (!validation.valid) {
      console.error('[Voice/Continue] Validation failed: ' + validation.reason);
      return new NextResponse(
        '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Invalid request.</Say><Hangup/></Response>',
        { status: 403, headers: { 'Content-Type': 'text/xml' } }
      );
    }

    console.log('[Voice/Continue] Processing: sid=' + callSid.substring(0, 20) +
      ' recSid=' + recordingSid.substring(0, 20));

    // Process the recording (ASR → AI → TTS) — this takes ~10s
    const result = await processCallerRecording(callSid, recordingUrl, recordingSid, baseUrl);

    console.log('[Voice/Continue] Done: sid=' + callSid.substring(0, 20) +
      ' asr=' + result.asrSuccess + ' ai=' + result.aiSuccess +
      ' tts=' + result.ttsSuccess + ' done=' + result.callCompleted);

    // Log the TwiML being returned (truncate for readability)
    const twimlPreview = result.twiml.length > 500 ? result.twiml.substring(0, 500) + '...' : result.twiml;
    console.log('[Voice/Continue] TwiML response: ' + twimlPreview);

    return new NextResponse(result.twiml, {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Voice/Continue] Error: ' + msg.substring(0, 300));

    // Return safe TwiML — keep the call alive with a retry prompt
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Say language="en-US">Please hold while we process your request.</Say><Hangup/></Response>',
      { status: 200, headers: { 'Content-Type': 'text/xml' } }
    );
  }
}
