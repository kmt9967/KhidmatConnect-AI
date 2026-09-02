import { NextRequest, NextResponse } from 'next/server';
import { validateTwilioWebhook, extractSignature, getWebhookUrl } from '@/lib/voice/twilioValidation';
import { handleCallStatusChange } from '@/lib/voice/voiceOrchestration';

/**
 * POST /api/voice/twilio/status
 * Twilio call status callback.
 * Handles: completed, failed, busy, no-answer, canceled, disconnect.
 * Preserves case and transcript on any disconnect.
 */
export async function POST(request: NextRequest) {
  try {
    const WEBHOOK_PATH = '/api/voice/twilio/status';

    const formData = await request.formData();
    const callSid = formData.get('CallSid') as string;
    const callStatus = formData.get('CallStatus') as string;

    if (!callSid || !callStatus) {
      return new NextResponse('', { status: 200 });
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
      console.error('[Voice] Status callback validation failed: ' + validation.reason);
      return new NextResponse('', { status: 403 });
    }

    // Handle the status change
    await handleCallStatusChange(callSid, callStatus);

    console.log('[Voice] Status update: sid=' + callSid.substring(0, 20) + ' status=' + callStatus);

    return new NextResponse('', { status: 200 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Voice] Status callback error: ' + msg.substring(0, 200));
    return new NextResponse('', { status: 200 });
  }
}
