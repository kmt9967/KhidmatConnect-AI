/**
 * Alibaba TTS (Text-to-Speech) service.
 *
 * Converts text responses to audio using Alibaba Cloud Model Studio.
 * Uses qwen3-tts-flash via the DashScope multimodal generation API.
 *
 * Architecture:
 * - Accepts text (English or Urdu)
 * - Sends to DashScope native multimodal TTS endpoint
 * - Returns audio buffer (WAV)
 * - Handles timeout and errors gracefully
 *
 * IMPORTANT: TTS failure must NOT break the call.
 * Caller should fall back to Twilio <Say> if TTS fails.
 */

// ─── Types ──────────────────────────────────────────────────

export interface TtsResult {
  success: boolean;
  audioBuffer: Buffer | null;
  audioFormat: string;
  model: string | null;
  latencyMs: number;
  error: string | null;
}

// ─── Configuration ──────────────────────────────────────────

function getTtsModel(): string {
  return process.env.ALIBABA_TTS_MODEL || 'qwen3-tts-flash';
}

function getTtsApiKey(): string | undefined {
  return process.env.ALIBABA_MODEL_STUDIO_API_KEY;
}

/**
 * Get the DashScope native API base URL.
 * Strips /compatible-mode/v1 from the OpenAI-compatible URL.
 */
function getDashScopeBase(): string {
  const compatUrl = process.env.ALIBABA_MODEL_STUDIO_BASE_URL;
  if (!compatUrl) return '';
  return compatUrl.replace('/compatible-mode/v1', '');
}

/**
 * Check if TTS is configured with minimum required credentials.
 */
export function isTtsConfigured(): boolean {
  return !!getTtsApiKey();
}

// ─── TTS Service ────────────────────────────────────────────

/**
 * Convert text to speech audio using Alibaba TTS.
 *
 * @param text - Text to synthesize (English or Urdu)
 * @param language - 'en' or 'ur' for voice selection
 * @returns TTS result with audio buffer or error
 */
export async function synthesizeSpeech(
  text: string,
  language: 'en' | 'ur' = 'en'
): Promise<TtsResult> {
  const apiKey = getTtsApiKey();
  if (!apiKey) {
    return {
      success: false,
      audioBuffer: null,
      audioFormat: 'wav',
      model: null,
      latencyMs: 0,
      error: 'TTS not configured - ALIBABA_MODEL_STUDIO_API_KEY missing',
    };
  }

  if (!text || text.trim().length === 0) {
    return {
      success: false,
      audioBuffer: null,
      audioFormat: 'wav',
      model: getTtsModel(),
      latencyMs: 0,
      error: 'Empty text input',
    };
  }

  const model = getTtsModel();
  const startTime = Date.now();

  try {
    const result = await callTtsApi(apiKey, model, text, language);
    const latencyMs = Date.now() - startTime;

    console.log('[TTS] model=' + model + ' lang=' + language + ' latency=' + latencyMs + 'ms success=' + result.success);

    return { ...result, latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[TTS] Failed: ' + message.substring(0, 200));

    return {
      success: false,
      audioBuffer: null,
      audioFormat: 'wav',
      model,
      latencyMs,
      error: message,
    };
  }
}

/**
 * Call the DashScope TTS API using the native multimodal generation endpoint.
 *
 * Endpoint: POST {workspaceBase}/api/v1/services/aigc/multimodal-generation/generation
 * Model: qwen3-tts-flash
 *
 * Request:
 * {
 *   "model": "qwen3-tts-flash",
 *   "input": { "text": "...", "voice": "Cherry", "language_type": "English" }
 * }
 *
 * Response:
 * {
 *   "output": {
 *     "audio": {
 *       "url": "http://...",   // temporary URL to WAV file (24h)
 *       "data": "",             // base64 (empty in non-streaming)
 *     }
 *   }
 * }
 */
async function callTtsApi(
  apiKey: string,
  model: string,
  text: string,
  language: 'en' | 'ur'
): Promise<{ success: boolean; audioBuffer: Buffer | null; audioFormat: string; model: string | null; error: string | null }> {
  const dashScopeBase = getDashScopeBase();
  if (!dashScopeBase) {
    return { success: false, audioBuffer: null, audioFormat: 'wav', model: null, error: 'Base URL not configured' };
  }

  // Use the DashScope native multimodal generation endpoint
  const endpoint = `${dashScopeBase}/api/v1/services/aigc/multimodal-generation/generation`;

  // Select voice based on language
  // qwen3-tts-flash voices: Cherry (female), Ethan (male), etc.
  const voice = language === 'ur' ? 'Cherry' : 'Cherry';

  // Map language to DashScope language_type
  // Supported: Chinese, English, German, Italian, Portuguese, Spanish, Japanese, Korean, French, Russian
  // Urdu is NOT in the official list — use "Auto" for Urdu and let the model try
  const languageType = language === 'ur' ? 'Auto' : 'English';

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey,
    },
    body: JSON.stringify({
      model: model,
      input: {
        text: text.substring(0, 1000),
        voice: voice,
        language_type: languageType,
      },
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'No response body');
    console.error('[TTS] API error ' + response.status + ': ' + errorText.substring(0, 300));
    return {
      success: false,
      audioBuffer: null,
      audioFormat: 'wav',
      model: model,
      error: 'TTS API returned ' + response.status,
    };
  }

  const data = await response.json();

  // Extract audio from response
  const audioUrl = data?.output?.audio?.url;
  const audioData = data?.output?.audio?.data;

  let audioBuffer: Buffer | null = null;

  if (audioUrl && typeof audioUrl === 'string' && audioUrl.length > 0) {
    // Download audio from temporary URL
    try {
      const audioResponse = await fetch(audioUrl, {
        signal: AbortSignal.timeout(10_000),
      });
      if (audioResponse.ok) {
        const arrayBuffer = await audioResponse.arrayBuffer();
        audioBuffer = Buffer.from(arrayBuffer);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to download audio';
      console.error('[TTS] Audio download failed: ' + msg.substring(0, 200));
    }
  } else if (audioData && typeof audioData === 'string' && audioData.length > 0) {
    // Decode base64 audio data
    audioBuffer = Buffer.from(audioData, 'base64');
  }

  if (!audioBuffer || audioBuffer.length < 100) {
    return {
      success: false,
      audioBuffer: null,
      audioFormat: 'wav',
      model: model,
      error: 'TTS returned no usable audio data',
    };
  }

  // Enforce max size (5MB)
  if (audioBuffer.length > 5 * 1024 * 1024) {
    return {
      success: false,
      audioBuffer: null,
      audioFormat: 'wav',
      model: model,
      error: 'TTS audio too large: ' + audioBuffer.length + ' bytes',
    };
  }

  return {
    success: true,
    audioBuffer: audioBuffer,
    audioFormat: 'wav',
    model: model,
    error: null,
  };
}

// ─── Response Text Builders ─────────────────────────────────

/**
 * Build the AI greeting response text.
 */
export function buildGreetingText(language: 'en' | 'ur' = 'en'): string {
  if (language === 'ur') {
    return 'یہ خدمت کنیکٹ اے آئی ایمرجنسی اسسٹنٹ ہے۔ براہِ کرم بتائیں کیا ہنگامی صورتحال ہے۔';
  }
  return 'KhidmatConnect AI Emergency Assistant. Please tell me what emergency is happening.';
}

/**
 * Build a follow-up question response text.
 */
export function buildFollowUpText(question: string, language: 'en' | 'ur' = 'en'): string {
  if (language === 'ur') {
    return 'براہِ کرم مزید بتائیں: ' + question;
  }
  return question;
}

/**
 * Build the call completion response text.
 */
export function buildCompletionText(caseCode: string, language: 'en' | 'ur' = 'en'): string {
  if (language === 'ur') {
    return 'آپ کی ہنگامی درخواست درج کر لی گئی ہے اور کوآرڈینیٹر کو بھیجی جا رہی ہے۔ آپ کا کیس نمبر ' + caseCode + ' ہے۔';
  }
  return 'Your emergency request has been recorded and sent for coordinator review. Please stay available on this number. Your case number is ' + caseCode + '.';
}

/**
 * Build the ASR failure retry text.
 */
export function buildRetryText(language: 'en' | 'ur' = 'en'): string {
  if (language === 'ur') {
    return 'معذرت، میں واضح طور پر نہیں سمجھ سکا۔ براہِ کرم ہنگامی صورتحال دہرائیں۔';
  }
  return 'Sorry, I could not clearly understand that. Please repeat the emergency briefly.';
}

/**
 * Build a short acknowledgement text (for "processing" state).
 */
export function buildAcknowledgementText(language: 'en' | 'ur' = 'en'): string {
  if (language === 'ur') {
    return 'جی، میں آپ کی معلومات محفوظ کر رہا ہوں۔';
  }
  return 'Okay, I am recording your emergency information.';
}
