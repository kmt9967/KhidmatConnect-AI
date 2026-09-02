/**
 * Twilio client helper and TwiML generation utilities.
 *
 * Provides:
 * - Twilio client initialization (lazy, only when credentials configured)
 * - TwiML response builders for voice calls
 * - Recording retrieval helpers
 * - Phone number masking for privacy
 */

/**
 * Check if Twilio is configured with minimum required credentials.
 */
export function isTwilioConfigured(): boolean {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN
  );
}

/**
 * Get Twilio configuration status for diagnostics (no secrets exposed).
 */
export function getTwilioConfigStatus(): { configured: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!process.env.TWILIO_ACCOUNT_SID) missing.push('TWILIO_ACCOUNT_SID');
  if (!process.env.TWILIO_AUTH_TOKEN) missing.push('TWILIO_AUTH_TOKEN');
  if (!process.env.TWILIO_PHONE_NUMBER) missing.push('TWILIO_PHONE_NUMBER');
  return { configured: missing.length === 0, missing };
}

// ─── TwiML Builders ─────────────────────────────────────────

/**
 * Build a TwiML response that greets the caller and records their speech.
 * Returns XML string suitable for Twilio webhook response.
 */
export function buildGreetingTwiML(recordActionUrl: string, language: 'en' | 'ur' = 'en', baseUrl?: string): string {
  // Use pre-generated Alibaba TTS audio for greeting (consistent voice, no Alice)
  const audioBase = baseUrl || '';
  const greetingUrUrl = `${audioBase}/api/voice/audio/greeting_ur`;
  const greetingEnUrl = `${audioBase}/api/voice/audio/greeting_en`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${escapeXml(greetingUrUrl)}</Play>
  <Play>${escapeXml(greetingEnUrl)}</Play>
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
}

/**
 * Build a TwiML response that plays AI speech and records next caller turn.
 */
export function buildResponseTwiML(
  audioUrl: string | null,
  fallbackText: string,
  recordActionUrl: string,
  language: 'en' | 'ur' = 'en'
): string {
  const parts: string[] = ['<?xml version="1.0" encoding="UTF-8"?>', '<Response>'];

  if (audioUrl) {
    parts.push(`  <Play>${escapeXml(audioUrl)}</Play>`);
  } else {
    // TTS fallback using Twilio <Say>
    parts.push(`  <Say voice="alice" language="${language === 'ur' ? 'ur-PK' : 'en-US'}">${escapeXml(fallbackText)}</Say>`);
  }

  parts.push(`  <Record
    action="${escapeXml(recordActionUrl)}"
    method="POST"
    maxLength="20"
    playBeep="false"
    trim="trim-silence"
    transcribe="false"
    timeout="3"
  />`);
  parts.push('</Response>');

  return parts.join('\n');
}

/**
 * Build a TwiML response for call completion (handoff to operator).
 */
export function buildCompletionTwiML(message: string, language: 'en' | 'ur' = 'en'): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice" language="${language === 'ur' ? 'ur-PK' : 'en-US'}">${escapeXml(message)}</Say>
  <Hangup/>
</Response>`;
}

/**
 * Build a TwiML response for ASR/TTS failure — ask caller to repeat.
 */
export function buildRetryTwiML(recordActionUrl: string, language: 'en' | 'ur' = 'en'): string {
  const retryEn = 'Sorry, I could not clearly understand that. Please repeat the emergency briefly.';
  const retryUr = 'معذرت، میں واضح طور پر نہیں سمجھ سکا۔ براہ کرم ہنگامی صورتحال دہرائیں۔';

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice" language="en-US">${escapeXml(retryEn)}</Say>
  <Say voice="alice" language="ur-PK">${escapeXml(retryUr)}</Say>
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
}

/**
 * Build TwiML for a simple error/goodbye message.
 */
export function buildGoodbyeTwiML(message: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice" language="en-US">${escapeXml(message)}</Say>
  <Hangup/>
</Response>`;
}

// ─── Phone Masking ──────────────────────────────────────────

/**
 * Mask a phone number for display. Shows only last 4 digits.
 * Example: "+923008241992" → "+92 *** *** 1992"
 */
export function maskPhoneNumber(phone: string): string {
  if (!phone || phone.length < 4) return '***';
  const last4 = phone.slice(-4);
  const prefix = phone.startsWith('+') ? phone.slice(0, 3) : '';
  return `${prefix} *** *** ${last4}`;
}

// ─── XML Escaping ───────────────────────────────────────────

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ─── Recording Retrieval ────────────────────────────────────

/**
 * Retrieve a recording from Twilio using HTTP Basic Auth.
 * Tries the provided recordingUrl first (from Twilio callback),
 * then falls back to constructing URL from recordingSid.
 * Includes retry logic for transient failures (502/503).
 * Returns the audio buffer or null on failure.
 */
export async function retrieveTwilioRecording(
  recordingSid: string,
  recordingUrl?: string
): Promise<Buffer | null> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    console.error('[Twilio] Cannot retrieve recording — credentials not configured');
    return null;
  }

  // Validate recording SID format (Twilio uses RE prefix)
  if (!recordingSid.startsWith('RE') || recordingSid.length < 20) {
    console.error('[Twilio] Invalid recording SID format: ' + recordingSid.substring(0, 10) + '...');
    return null;
  }

  const authHeader = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');

  // Build list of URLs to try
  const urlsToTry: string[] = [];

  // 1. Use Twilio-provided RecordingUrl (most reliable — already resolved by Twilio)
  if (recordingUrl) {
    // Append .wav to get WAV format for Google ASR
    const wavUrl = recordingUrl.endsWith('.wav') ? recordingUrl : recordingUrl + '.wav';
    urlsToTry.push(wavUrl);
    // Also try the original URL (might be mp3)
    if (!urlsToTry.includes(recordingUrl)) {
      urlsToTry.push(recordingUrl);
    }
  }

  // 2. Construct URL from SID as fallback
  const constructedUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${recordingSid}.wav`;
  if (!urlsToTry.includes(constructedUrl)) {
    urlsToTry.push(constructedUrl);
  }

  // Try each URL with retry logic for transient failures
  for (const url of urlsToTry) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (attempt > 0) {
          // Exponential backoff: 1s, 2s
          await new Promise(r => setTimeout(r, attempt * 1000));
        }

        console.log('[Twilio] Fetching recording: ' + url.substring(0, 80) + '... attempt=' + (attempt + 1));

        const response = await fetch(url, {
          headers: { Authorization: authHeader },
          signal: AbortSignal.timeout(15_000),
        });

        if (!response.ok) {
          const errorBody = await response.text().catch(() => 'no body');
          console.error('[Twilio] Recording fetch failed: status=' + response.status +
            ' url=' + url.substring(0, 60) + '... body=' + errorBody.substring(0, 200));

          // Retry on transient errors (502, 503, 504)
          if ([502, 503, 504].includes(response.status) && attempt < 2) {
            console.log('[Twilio] Transient error, will retry...');
            continue;
          }
          break; // Non-transient error, try next URL
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        if (buffer.length < 100) {
          console.error('[Twilio] Recording too small: ' + buffer.length + ' bytes');
          break;
        }

        // Enforce max size (10MB — ~30 seconds of WAV at 8kHz)
        if (buffer.length > 10 * 1024 * 1024) {
          console.error('[Twilio] Recording too large: ' + buffer.length + ' bytes');
          return null;
        }

        console.log('[Twilio] Recording retrieved: ' + buffer.length + ' bytes from ' + url.substring(0, 60));
        return buffer;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('[Twilio] Recording fetch error: ' + message.substring(0, 200));
        if (attempt >= 2) break;
      }
    }
  }

  console.error('[Twilio] All recording fetch attempts failed for SID: ' + recordingSid.substring(0, 20));
  return null;
}
