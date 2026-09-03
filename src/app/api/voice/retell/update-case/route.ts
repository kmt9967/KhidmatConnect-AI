/**
 * POST /api/voice/retell/update-case
 *
 * Retell CUSTOM FUNCTION endpoint (configured on the agent as `update_case`).
 * Retell's LLM invokes it synchronously mid-call once enough emergency details
 * are collected; the request is signed with the same X-Retell-Signature HMAC.
 *
 * Request body (Retell custom-function envelope):
 *   { "name": "update_case", "call": <call object>, "args": { ... } }
 *
 * Behavior (safety rules 1-7):
 *   • Case is captured first — if call_started was lost, we create the
 *     provisional case + session here before anything else.
 *   • Only caller-provided facts are persisted; args are strict-validated.
 *   • Alibaba Qwen performs the structured analysis synchronously (custom
 *     functions allow long timeouts); a Qwen failure never loses the case.
 *   • The reply is built by the NO-FALSE-DISPATCH guard: without a real
 *     active Assignment the agent may only say "registered / under review".
 */
import { NextRequest, NextResponse } from 'next/server';
import { isRetellConfigured, verifyRetellRequest } from '@/lib/voice/retellSecurity';
import {
  handleRetellToolCall,
  retellToolArgsSchema,
  type RetellCallObject,
} from '@/lib/voice/retellService';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  if (!isRetellConfigured()) {
    return NextResponse.json({ error: 'Retell integration not configured' }, { status: 503 });
  }

  const rawBody = await request.text();
  if (!verifyRetellRequest(rawBody, request.headers.get('x-retell-signature'), 'update-case')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let envelope: unknown;
  try {
    envelope = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const body = envelope as { name?: unknown; call?: unknown; args?: unknown };
  const call = body.call as RetellCallObject | undefined;
  if (!call || typeof call.call_id !== 'string' || call.call_id.length === 0) {
    console.warn('[Retell] update-case: missing call.call_id in custom-function envelope');
    return NextResponse.json({ error: 'Invalid custom-function payload' }, { status: 400 });
  }

  const argsResult = retellToolArgsSchema.safeParse(body.args ?? {});
  if (!argsResult.success) {
    // Tell the agent what to fix rather than guessing — it may re-call with
    // corrected args. Nothing is persisted from an invalid call.
    return NextResponse.json(
      {
        status: 'rejected',
        error: 'invalid_arguments',
        details: argsResult.error.issues.map((i) => `${i.path.join('.') || 'args'}: ${i.message}`).slice(0, 5),
        instruction: 'Retry with only the fields the caller actually provided. Omit unknown fields — never guess.',
      },
      { status: 400 },
    );
  }

  try {
    const response = await handleRetellToolCall(call, argsResult.data);
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Retell] update-case failed for call_id=${call.call_id}: ${msg.substring(0, 200)}`);
    // 5xx → agent apologizes; any captured case data remains intact.
    return NextResponse.json(
      {
        status: 'error',
        instruction:
          'Our emergency backend could not be reached. Apologize, ask the caller to keep the line free, and repeat the key details back for confirmation.',
      },
      { status: 500 },
    );
  }
}
