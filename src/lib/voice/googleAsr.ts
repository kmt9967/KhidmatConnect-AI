/**
 * Google Cloud Speech-to-Text V2 ASR service.
 *
 * Primary ASR provider for Urdu/Roman Urdu/mixed language support.
 * Uses REST API with Application Default Credentials (ADC).
 *
 * SETUP REQUIREMENTS:
 * 1. Enable Cloud Speech-to-Text API in Google Cloud Console
 * 2. Set up ADC: gcloud auth application-default login
 * 3. Set GOOGLE_CLOUD_PROJECT_ID to your project ID
 *
 * Configuration:
 * - GOOGLE_CLOUD_PROJECT_ID: GCP project ID (required)
 * - GOOGLE_SPEECH_LOCATION: Region (default: asia-southeast1)
 * - GOOGLE_SPEECH_MODEL: Model (default: chirp_2)
 *
 * IMPORTANT: Use regional endpoint (e.g., asia-southeast1-speech.googleapis.com)
 * and single language code. Multiple language codes only work in eu/global/us regions.
 */

import { getAdcAccessToken } from './googleAdc';

// ─── Types ──────────────────────────────────────────────────

export interface AsrResult {
  success: boolean;
  transcript: string | null;
  confidence: number | null;
  language: string | null;
  model: string;
  latencyMs: number;
  error: string | null;
}

// ─── Configuration ──────────────────────────────────────────

function getProjectId(): string {
  return process.env.GOOGLE_CLOUD_PROJECT_ID || '';
}

function getLocation(): string {
  return process.env.GOOGLE_SPEECH_LOCATION || 'asia-southeast1';
}

function getModel(): string {
  return process.env.GOOGLE_SPEECH_MODEL || 'chirp_2';
}

/**
 * Check if Google ASR is configured with minimum required credentials.
 */
export function isAsrConfigured(): boolean {
  return !!getProjectId();
}

/**
 * Get the configured model name.
 */
export function getModelName(): string {
  return getModel();
}

// ─── ADC Authentication ─────────────────────────────────────

let cachedAccessToken: string | null = null;
let tokenExpiry: number = 0;

async function getAccessToken(): Promise<string> {
  // Return cached token if still valid (with 5 min buffer)
  if (cachedAccessToken && Date.now() < tokenExpiry - 300000) {
    return cachedAccessToken;
  }

  // Shared cross-platform ADC resolution (env override → gcloud well-known
  // path; supports both authorized_user and service_account credentials).
  const access = await getAdcAccessToken();
  cachedAccessToken = access.token;
  tokenExpiry = access.expiryMs;
  return cachedAccessToken;
}

// ─── ASR Service ────────────────────────────────────────────

/**
 * Transcribe audio using Google Cloud Speech-to-Text V2 REST API.
 *
 * @param audioBuffer - Audio data (WAV, MP3, etc.)
 * @param mimeType - Audio MIME type (default: audio/wav)
 * @param options - Optional language hints and config
 * @returns Normalized ASR result
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  mimeType: string = 'audio/wav',
  options: {
    languageHints?: string[];
    enableAutomaticPunctuation?: boolean;
  } = {}
): Promise<AsrResult> {
  const projectId = getProjectId();
  if (!projectId) {
    return {
      success: false,
      transcript: null,
      confidence: null,
      language: null,
      model: getModel(),
      latencyMs: 0,
      error: 'Google ASR not configured — GOOGLE_CLOUD_PROJECT_ID missing',
    };
  }

  const model = getModel();
  const startTime = Date.now();

  try {
    const result = await callGoogleSpeechV2Rest(audioBuffer, options);
    const latencyMs = Date.now() - startTime;

    console.log('[GoogleASR] model=' + model + ' lang=' + result.language + ' confidence=' + (result.confidence?.toFixed(2) || 'null') + ' latency=' + latencyMs + 'ms success=' + result.success);

    return { ...result, model, latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[GoogleASR] Failed: ' + message.substring(0, 200));

    return {
      success: false,
      transcript: null,
      confidence: null,
      language: null,
      model,
      latencyMs,
      error: message,
    };
  }
}

/**
 * Call Google Cloud Speech-to-Text V2 using REST API with ADC.
 *
 * Uses regional endpoint: https://{LOCATION}-speech.googleapis.com
 * Recognizer path: projects/{PROJECT_ID}/locations/{LOCATION}/recognizers/_
 * Model: chirp_2
 * Language: Single language code (ur-PK default)
 */
async function callGoogleSpeechV2Rest(
  audioBuffer: Buffer,
  options: { languageHints?: string[]; enableAutomaticPunctuation?: boolean }
): Promise<{ success: boolean; transcript: string | null; confidence: number | null; language: string | null; error: string | null }> {
  const projectId = getProjectId();
  const location = getLocation();
  const model = getModel();

  // Get access token from ADC
  const accessToken = await getAccessToken();

  // Convert audio to base64
  const audioContent = audioBuffer.toString('base64');

  // Use single language code (ur-PK default)
  // chirp_2 will auto-detect if audio is in a different language
  const languageCodes = options.languageHints?.slice(0, 1) || ['ur-PK'];

  // Build request body
  const requestBody = {
    config: {
      model: model,
      languageCodes: languageCodes,
      features: {
        enableAutomaticPunctuation: options.enableAutomaticPunctuation !== false,
      },
      autoDecodingConfig: {},
    },
    content: audioContent,
  };

  // Use regional endpoint
  const url = `https://${location}-speech.googleapis.com/v2/projects/${projectId}/locations/${location}/recognizers/_:recognize`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const responseText = await response.text();

    if (!response.ok) {
      const errorData = JSON.parse(responseText);
      const errorMessage = errorData.error?.message || 'Unknown error';
      console.error('[GoogleASR] API error:', errorMessage.substring(0, 300));
      return { success: false, transcript: null, confidence: null, language: null, error: errorMessage };
    }

    const data = JSON.parse(responseText);
    const results = data.results || [];

    if (results.length === 0) {
      return { success: false, transcript: null, confidence: null, language: null, error: 'No transcription results' };
    }

    // Combine all results
    const transcripts: string[] = [];
    let totalConfidence = 0;
    let confidenceCount = 0;
    let detectedLanguage: string | null = null;

    for (const result of results) {
      const alternatives = result.alternatives || [];
      if (alternatives.length > 0) {
        const best = alternatives[0];
        if (best?.transcript) {
          transcripts.push(best.transcript);
          if (typeof best.confidence === 'number') {
            totalConfidence += best.confidence;
            confidenceCount++;
          }
          if (result.languageCode && !detectedLanguage) {
            detectedLanguage = result.languageCode;
          }
        }
      }
    }

    const transcript = transcripts.join(' ').trim();
    const confidence = confidenceCount > 0 ? totalConfidence / confidenceCount : null;

    if (!transcript) {
      return { success: false, transcript: null, confidence, language: detectedLanguage, error: 'Empty transcript' };
    }

    return { success: true, transcript, confidence, language: detectedLanguage, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[GoogleASR] Request failed:', message.substring(0, 300));
    return { success: false, transcript: null, confidence: null, language: null, error: message };
  }
}

// ─── Utilities ──────────────────────────────────────────────

/**
 * Normalize a transcript for display and AI analysis.
 * Also detects Devanagari script leakage (Hindi instead of Urdu).
 */
export function normalizeTranscript(text: string, maxLength = 2000): string {
  const normalized = text
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\n+/g, ' ')
    .substring(0, maxLength);

  // Detect Devanagari script (Hindi) leakage — Google ASR sometimes
  // returns Devanagari when the caller is actually speaking Urdu.
  // Log a warning but keep the text (AI model should handle it).
  const devanagariPattern = /[\u0900-\u097F]/;
  if (devanagariPattern.test(normalized)) {
    console.warn('[GoogleASR] WARNING: Devanagari (Hindi) script detected in ur-PK transcript. This may indicate ASR language misidentification.');
  }

  return normalized;
}

/**
 * Check if text contains Devanagari (Hindi) characters.
 */
export function containsDevanagari(text: string): boolean {
  return /[\u0900-\u097F]/.test(text);
}
