/**
 * Google Cloud Text-to-Speech service.
 *
 * Uses Chirp 3 HD voices via the Cloud TTS REST API.
 * Primary voice: Puck (ur-IN-Chirp3-HD-Puck) — selected by human review.
 *
 * Architecture:
 * - ADC authentication (same as Google ASR)
 * - REST API: texttospeech.googleapis.com/v1/text:synthesize
 * - Output: LINEAR16 WAV (24kHz mono 16-bit PCM) — Twilio compatible
 *
 * IMPORTANT: TTS failure must NOT break the call.
 * Caller falls back to Alibaba TTS, then to Twilio <Say>.
 */

import fs from 'fs';
import path from 'path';

// ─── Types ──────────────────────────────────────────────────

export interface GoogleTtsResult {
  success: boolean;
  audioBuffer: Buffer | null;
  audioFormat: string;
  model: string | null;
  latencyMs: number;
  error: string | null;
}

// ─── Configuration ──────────────────────────────────────────

function getProjectId(): string {
  return process.env.GOOGLE_CLOUD_PROJECT_ID || '';
}

/**
 * Check if Google TTS is configured.
 */
export function isGoogleTtsConfigured(): boolean {
  return !!getProjectId();
}

// ─── ADC Authentication ─────────────────────────────────────

let cachedAccessToken: string | null = null;
let tokenExpiry: number = 0;

async function getAccessToken(): Promise<string> {
  if (cachedAccessToken && Date.now() < tokenExpiry - 300000) {
    return cachedAccessToken;
  }

  const adcPath = path.join(process.env.APPDATA || '', 'gcloud', 'application_default_credentials.json');

  if (!fs.existsSync(adcPath)) {
    throw new Error('ADC credentials not found. Run: gcloud auth application-default login');
  }

  const creds = JSON.parse(fs.readFileSync(adcPath, 'utf8'));

  if (creds.type === 'authorized_user') {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: creds.client_id,
        client_secret: creds.client_secret,
        refresh_token: creds.refresh_token,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error('Token refresh failed: ' + response.status + ' - ' + errorText.substring(0, 200));
    }

    const data = await response.json() as { access_token: string; expires_in: number };
    cachedAccessToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in * 1000);
    return cachedAccessToken!;
  }

  throw new Error('Unsupported ADC credential type');
}

// ─── Voice Selection ────────────────────────────────────────

/**
 * Get the Chirp 3 HD voice name for a given language.
 * Primary: Puck (selected by human review for KhidmatConnect).
 */
function getVoiceName(language: 'en' | 'ur'): string {
  // Puck voice for both Urdu and English
  // ur-IN-Chirp3-HD-Puck for Urdu, en-US-Chirp3-HD-Puck for English
  if (language === 'ur') {
    return 'ur-IN-Chirp3-HD-Puck';
  }
  return 'en-US-Chirp3-HD-Puck';
}

function getLanguageCode(language: 'en' | 'ur'): string {
  return language === 'ur' ? 'ur-IN' : 'en-US';
}

// ─── WAV Header ─────────────────────────────────────────────

/**
 * Add a WAV header to raw PCM data from Google TTS.
 * LINEAR16 output is raw PCM without headers.
 */
function addWavHeader(pcmData: Buffer, sampleRate: number, channels: number, bitsPerSample: number): Buffer {
  const byteRate = sampleRate * channels * bitsPerSample / 8;
  const blockAlign = channels * bitsPerSample / 8;
  const dataSize = pcmData.length;
  const headerSize = 44;

  const buffer = Buffer.alloc(headerSize + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  pcmData.copy(buffer, 44);

  return buffer;
}

// ─── TTS Service ────────────────────────────────────────────

/**
 * Synthesize speech using Google Cloud Chirp 3 HD (Puck voice).
 *
 * @param text - Text to synthesize
 * @param language - 'en' or 'ur'
 * @returns GoogleTtsResult with WAV audio buffer
 */
export async function synthesizeSpeechGoogle(
  text: string,
  language: 'en' | 'ur' = 'en'
): Promise<GoogleTtsResult> {
  const projectId = getProjectId();
  if (!projectId) {
    return {
      success: false,
      audioBuffer: null,
      audioFormat: 'wav',
      model: null,
      latencyMs: 0,
      error: 'Google TTS not configured — GOOGLE_CLOUD_PROJECT_ID missing',
    };
  }

  if (!text || text.trim().length === 0) {
    return {
      success: false,
      audioBuffer: null,
      audioFormat: 'wav',
      model: 'chirp3-hd-puck',
      latencyMs: 0,
      error: 'Empty text input',
    };
  }

  const startTime = Date.now();
  const voiceName = getVoiceName(language);
  const languageCode = getLanguageCode(language);

  try {
    const accessToken = await getAccessToken();

    const requestBody = {
      input: { text: text.substring(0, 4000) },
      voice: {
        languageCode: languageCode,
        name: voiceName,
      },
      audioConfig: {
        audioEncoding: 'LINEAR16',
        sampleRateHertz: 24000,
      },
    };

    const response = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + accessToken,
        'x-goog-user-project': projectId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const latencyMs = Date.now() - startTime;
      console.error('[GoogleTTS] API error ' + response.status + ': ' + errorText.substring(0, 300));
      return {
        success: false,
        audioBuffer: null,
        audioFormat: 'wav',
        model: 'chirp3-hd-puck',
        latencyMs,
        error: 'HTTP ' + response.status + ': ' + errorText.substring(0, 200),
      };
    }

    const data = await response.json() as { audioContent: string };

    if (!data.audioContent) {
      const latencyMs = Date.now() - startTime;
      return {
        success: false,
        audioBuffer: null,
        audioFormat: 'wav',
        model: 'chirp3-hd-puck',
        latencyMs,
        error: 'No audioContent in response',
      };
    }

    // Decode base64 PCM data
    const pcmBuffer = Buffer.from(data.audioContent, 'base64');

    if (pcmBuffer.length < 100) {
      const latencyMs = Date.now() - startTime;
      return {
        success: false,
        audioBuffer: null,
        audioFormat: 'wav',
        model: 'chirp3-hd-puck',
        latencyMs,
        error: 'Audio too small: ' + pcmBuffer.length + ' bytes',
      };
    }

    // Add WAV header (LINEAR16 is raw PCM without header)
    const wavBuffer = addWavHeader(pcmBuffer, 24000, 1, 16);

    const latencyMs = Date.now() - startTime;
    console.log('[GoogleTTS] voice=' + voiceName + ' lang=' + language +
      ' latency=' + latencyMs + 'ms size=' + wavBuffer.length + ' bytes');

    return {
      success: true,
      audioBuffer: wavBuffer,
      audioFormat: 'wav',
      model: 'chirp3-hd-puck',
      latencyMs,
      error: null,
    };
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[GoogleTTS] Failed: ' + message.substring(0, 200));

    return {
      success: false,
      audioBuffer: null,
      audioFormat: 'wav',
      model: 'chirp3-hd-puck',
      latencyMs,
      error: message,
    };
  }
}
