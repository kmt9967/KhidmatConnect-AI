/**
 * /api/voice/retell/web-call — M17 secure browser voice session endpoint.
 *
 * POST  Mint a SHORT-LIVED Retell web-call access token for the browser.
 *   • RETELL_API_KEY is used server-side ONLY and is NEVER returned.
 *   • The agent is fixed to the production RETELL_AGENT_ID — the client cannot
 *     override it (no second agent, no agent injection).
 *   • Best-effort per-IP rate limit for public (unauthenticated) emergency use.
 *   Response 200: { accessToken, callId } — the minimum the browser needs.
 *   Fail-closed: 503 (unconfigured) · 429 (rate limited) · 502 (upstream).
 *
 * GET ?callId=…  Read the REAL backend status for a call this browser created
 *   (case number, analysis status, turn count). No PII, no transcript text, no
 *   credentials are returned.
 *
 * The created web call runs on the SAME agent + webhooks + update_case custom
 * function as PSTN calls, so it feeds the identical EmergencyCase → Qwen →
 * Operator pipeline. No second voice architecture is introduced.
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  getWebCallConfig,
  createRetellWebCall,
  rateLimitWebCall,
  getWebCallStatus,
  WebCallError,
} from '@/lib/voice/retellWebCall';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Best-effort caller key for rate limiting (nginx sets x-forwarded-for). */
function clientKey(request: NextRequest): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}

export async function POST(request: NextRequest) {
  const cfg = getWebCallConfig();
  if (!cfg.ok) {
    // Fail closed with a reason the citizen UI can turn into a safe fallback
    // ("use the form or call the emergency line"). No secret detail is exposed.
    return NextResponse.json(
      { error: 'Browser voice is not available right now.', reason: cfg.reason },
      { status: 503 },
    );
  }

  const limit = rateLimitWebCall(clientKey(request));
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: 'Too many voice sessions started from this connection. Please try again shortly.',
        retryAfterMs: limit.retryAfterMs,
      },
      { status: 429 },
    );
  }

  try {
    const publicCall = await createRetellWebCall();
    // ONLY { accessToken, callId }. The permanent API key is never included.
    return NextResponse.json(publicCall, { status: 200 });
  } catch (err) {
    const kind = err instanceof WebCallError ? err.kind : 'upstream';
    // Log a truncated reason only — never the key, token, or request body.
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error(`[Retell] web-call creation failed (${kind}): ${msg.substring(0, 200)}`);
    return NextResponse.json({ error: 'Could not start a browser voice session.' }, { status: 502 });
  }
}

export async function GET(request: NextRequest) {
  const callId = request.nextUrl.searchParams.get('callId')?.trim() ?? '';
  // Retell call ids are UUID-like; reject anything obviously not one so the
  // poll cannot be used to probe arbitrary short strings.
  if (callId.length < 8 || callId.length > 120) {
    return NextResponse.json({ error: 'Invalid call id' }, { status: 400 });
  }
  try {
    return NextResponse.json(await getWebCallStatus(callId), { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error(`[Retell] web-call status failed: ${msg.substring(0, 200)}`);
    return NextResponse.json({ error: 'Status unavailable' }, { status: 500 });
  }
}
