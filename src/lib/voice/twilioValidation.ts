/**
 * Twilio webhook signature validation.
 *
 * Validates incoming Twilio requests using the X-Twilio-Signature header
 * and the account auth token. Prevents arbitrary POST requests from
 * impersonating Twilio webhooks.
 *
 * Development behavior:
 * - If TWILIO_AUTH_TOKEN is not set, validation is skipped with a warning.
 * - This is ONLY acceptable for local development.
 * - In production, missing auth token causes validation to fail.
 */

import crypto from 'crypto';

export interface TwilioValidationResult {
  valid: boolean;
  reason: string;
}

/**
 * Check whether Twilio validation should be enforced.
 * Returns false only in development when auth token is not configured.
 */
function shouldEnforceValidation(): boolean {
  if (!process.env.TWILIO_AUTH_TOKEN) {
    if (process.env.NODE_ENV === 'production') {
      return true; // Always enforce in production
    }
    console.warn('[Twilio] TWILIO_AUTH_TOKEN not set — webhook validation skipped (dev only)');
    return false;
  }
  return true;
}

/**
 * Validate a Twilio webhook request signature.
 *
 * Twilio signs requests with HMAC-SHA1 of the sorted URL + parameters,
 * using the auth token as the key. The signature is base64-encoded
 * and sent in the X-Twilio-Signature header.
 */
export function validateTwilioWebhook(
  url: string,
  params: Record<string, string>,
  signature: string | null
): TwilioValidationResult {
  if (!shouldEnforceValidation()) {
    return { valid: true, reason: 'validation_skipped_dev' };
  }

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    return { valid: false, reason: 'auth_token_missing' };
  }

  if (!signature) {
    return { valid: false, reason: 'signature_header_missing' };
  }

  try {
    // Sort parameters alphabetically and concatenate key-value pairs
    const sortedParams = Object.keys(params)
      .sort()
      .reduce((acc, key) => acc + key + params[key], '');

    // Append sorted params to the full URL
    const data = url + sortedParams;

    // Compute HMAC-SHA1
    const hmac = crypto.createHmac('sha1', authToken);
    hmac.update(Buffer.from(data, 'utf-8'));
    const expectedSignature = hmac.digest('base64');

    // Timing-safe comparison
    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (sigBuffer.length !== expectedBuffer.length) {
      return { valid: false, reason: 'signature_mismatch' };
    }

    const isValid = crypto.timingSafeEqual(sigBuffer, expectedBuffer);
    return isValid
      ? { valid: true, reason: 'valid' }
      : { valid: false, reason: 'signature_mismatch' };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[Twilio] Validation error: ${message.substring(0, 200)}`);
    return { valid: false, reason: 'validation_error' };
  }
}

/**
 * Extract the Twilio signature from request headers.
 */
export function extractSignature(headers: Headers): string | null {
  return headers.get('x-twilio-signature') || null;
}

/**
 * Build the full URL from a Next.js request for signature validation.
 * Uses TWILIO_WEBHOOK_BASE_URL if set (for tunnel/proxy scenarios),
 * otherwise constructs from the request URL.
 */
export function getWebhookUrl(request: { url: string }, path: string): string {
  const baseUrl = process.env.TWILIO_WEBHOOK_BASE_URL;
  if (baseUrl) {
    return `${baseUrl.replace(/\/$/, '')}${path}`;
  }
  // Fallback: construct from request
  try {
    const url = new URL(request.url);
    return `${url.origin}${path}`;
  } catch {
    return path;
  }
}
