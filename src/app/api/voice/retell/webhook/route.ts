/**
 * POST /api/voice/retell/webhook
 *
 * Single signed dispatcher for ALL Retell call-status events:
 * call_started · transcript_updated · call_ended · call_analyzed (+ ignored).
 *
 * Retell delivers { event, call }, signs the RAW body with
 * X-Retell-Signature, waits 10s for a 2xx, and retries up to 3 times.
 * Therefore: verify → persist fast → answer immediately; heavyweight Qwen
 * analysis is detached inside the handlers (idempotency makes retries safe).
 *
 * Responses:
 *   503 — Retell integration not configured (fail closed)
 *   401 — missing/invalid signature
 *   200 — event acknowledged (bad payloads are logged, not retried forever)
 *   500 — retryable infra error (Retell will redeliver; handlers are idempotent)
 */
import { NextRequest, NextResponse } from 'next/server';
import { isRetellConfigured, verifyRetellRequest } from '@/lib/voice/retellSecurity';
import { handleRetellWebhook, retellWebhookEventSchema, type RetellCallObject } from '@/lib/voice/retellService';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  if (!isRetellConfigured()) {
    return NextResponse.json({ error: 'Retell integration not configured' }, { status: 503 });
  }

  // One raw read — verification and parsing use the exact bytes Retell signed.
  const rawBody = await request.text();
  if (!verifyRetellRequest(rawBody, request.headers.get('x-retell-signature'), 'webhook')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    console.warn('[Retell] webhook: body is not valid JSON — discarded');
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const eventResult = retellWebhookEventSchema.safeParse(parsed);
  if (!eventResult.success) {
    // Malformed events are permanent failures — 200 stops pointless retries.
    console.warn('[Retell] webhook: event failed schema validation — discarded');
    return NextResponse.json({ ok: true, discarded: true }, { status: 200 });
  }

  const { event, call } = eventResult.data as { event: string; call: RetellCallObject };

  try {
    await handleRetellWebhook(event, call);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    // Infra error (e.g. DB) → 500 so Retell retries; handlers are idempotent.
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Retell] webhook ${event} failed for call_id=${call.call_id}: ${msg.substring(0, 200)}`);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
