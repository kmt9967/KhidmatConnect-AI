/**
 * POST /api/voice/twilio/incoming
 *
 * Twilio incoming call webhook.
 * Called when someone dials the Twilio phone number.
 *
 * Behavior:
 * 1. Validate Twilio webhook signature
 * 2. Read CallSid, From, To from Twilio params
 * 3. Create VoiceCallSession + pre-create EmergencyCase
 * 4. Return TwiML greeting + recording prompt
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateTwilioWebhook, extractSignature, getWebhookUrl } from '@/lib/voice/twilioValidation';
import { initializeVoiceCall } from '@/lib/voice/voiceOrchestration';
import { maskPhoneNumber } from '@/lib/voice/twilioClient';

export async function POST(request: NextRequest) {
  try {
    const WEBHOOK_PATH = '/api/voice/twilio/incoming';

    // 1. Parse form data from Twilio
    const formData = await request.formData();
    const callSid = formData.get('CallSid') as string;
    const from = formData.get('From') as string;
    const to = formData.get('To') as string;

    if (!callSid) {
      console.error('[Voice] Missing CallSid in incoming webhook');
      return new NextResponse(
        '<?xml version="1.0" encoding="UTF-8"?><Response><Say>An error occurred.</Say><Hangup/></Response>',
        { status: 200, headers: { 'Content-Type': 'text/xml' } }
      );
    }

    // 2. Validate Twilio signature
    const signature = extractSignature(request.headers);
    const webhookUrl = getWebhookUrl(request, WEBHOOK_PATH);
    const params: Record<string, string> = {};
    formData.forEach((value, key) => {
      params[key] = String(value);
    });

    const validation = validateTwilioWebhook(webhookUrl, params, signature);
    if (!validation.valid) {
      console.error('[Voice] Webhook validation failed: ' + validation.reason);
      return new NextResponse(
        '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Invalid request.</Say><Hangup/></Response>',
        { status: 403, headers: { 'Content-Type': 'text/xml' } }
      );
    }

    // 3. Determine webhook base URL for subsequent callbacks
    const baseUrl = process.env.TWILIO_WEBHOOK_BASE_URL ||
      new URL(request.url).origin;

    // 4. Initialize voice call (creates session + pre-creates case)
    const result = await initializeVoiceCall(callSid, from || 'unknown', baseUrl);

    console.log('[Voice] Call initialized: sid=' + callSid.substring(0, 20) +
      ' from=' + maskPhoneNumber(from || 'unknown') +
      ' case=' + result.caseCode);

    // 5. Return TwiML
    return new NextResponse(result.twiml, {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Voice] Incoming webhook error: ' + msg.substring(0, 300));

    // Return safe TwiML — never leave the caller hanging
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Say language="en-US">An error occurred. Please try again later.</Say><Hangup/></Response>',
      { status: 200, headers: { 'Content-Type': 'text/xml' } }
    );
  }
}
