/**
 * Alibaba ASR (Automatic Speech Recognition) service.
 *
 * Sends audio to Alibaba Cloud Model Studio for transcription.
 * Uses qwen3-asr-flash via the DashScope multimodal generation API.
 *
 * Architecture:
 * - Accepts WAV audio buffer (from Twilio recording)
 * - Sends to DashScope synchronous multimodal API
 * - Returns normalized transcript text
 * - Handles timeout, errors, and empty results gracefully
 *
 * IMPORTANT: Does NOT delete or modify the emergency case on failure.
 * Caller must handle ASR failure by preserving the case and asking
 * the caller to repeat.
 */

// ─── Types ──────────────────────────────────────────────────

export interface AsrResult {
  success: boolean;
  transcript: string | null;
  language: string | null;
  model: string | null;
  latencyMs: number;
  error: string | null;
}

// ─── Configuration ──────────────────────────────────────────

function getAsrModel(): string {
  return process.env.ALIBABA_ASR_MODEL || 'qwen3-asr-flash';
}

function getAsrApiKey(): string | undefined {
  return process.env.ALIBABA_MODEL_STUDIO_API_KEY;
}

/**
 * Get the DashScope native API base URL.
 * Strips /compatible-mode/v1 from the OpenAI-compatible URL
 * to get the workspace base, then appends /api/v1.
 */
function getDashScopeBase(): string {
  const compatUrl = process.env.ALIBABA_MODEL_STUDIO_BASE_URL;
  if (!compatUrl) return '';
  // Strip /compatible-mode/v1 suffix to get workspace base
  return compatUrl.replace('/compatible-mode/v1', '');
}

/**
 * Check if ASR is configured with minimum required credentials.
 */
export function isAsrConfigured(): boolean {
  return !!getAsrApiKey();
}

// ─── ASR Service ────────────────────────────────────────────

/**
 * Transcribe an audio buffer using Alibaba ASR.
 *
 * @param audioBuffer - WAV audio data from Twilio recording
 * @param mimeType - Audio MIME type (default: audio/wav)
 * @returns Transcription result with transcript text or error
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  mimeType: string = 'audio/wav'
): Promise<AsrResult> {
  const apiKey = getAsrApiKey();
  if (!apiKey) {
    return {
      success: false,
      transcript: null,
      language: null,
      model: null,
      latencyMs: 0,
      error: 'ASR not configured — ALIBABA_MODEL_STUDIO_API_KEY missing',
    };
  }

  const model = getAsrModel();
  const startTime = Date.now();

  try {
    // Convert audio to base64 for API transmission
    const audioBase64 = audioBuffer.toString('base64');

    // Call DashScope native multimodal API
    const result = await callDashScopeAsr(apiKey, model, audioBase64, mimeType);

    const latencyMs = Date.now() - startTime;
    console.log(`[ASR] model=${model} latency=${latencyMs}ms success=${result.success}`);

    return { ...result, model, latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[ASR] Failed: ${message.substring(0, 200)}`);

    return {
      success: false,
      transcript: null,
      language: null,
      model,
      latencyMs,
      error: message,
    };
  }
}

/**
 * Call the DashScope ASR API using the native multimodal generation endpoint.
 *
 * Endpoint: POST {workspaceBase}/api/v1/services/aigc/multimodal-generation/generation
 * Model: qwen3-asr-flash (synchronous, audio < 5 min)
 *
 * Response format (non-standard — NOT OpenAI-compatible):
 * {
 *   "output": {
 *     "output": { "sentence": { "text": "..." } },
 *     "text": "..."
 *   }
 * }
 */
async function callDashScopeAsr(
  apiKey: string,
  model: string,
  audioBase64: string,
  mimeType: string
): Promise<{ success: boolean; transcript: string | null; language: string | null; error: string | null }> {
  const dashScopeBase = getDashScopeBase();
  if (!dashScopeBase) {
    return { success: false, transcript: null, language: null, error: 'Base URL not configured' };
  }

  // Use the DashScope native multimodal generation endpoint
  const endpoint = `${dashScopeBase}/api/v1/services/aigc/multimodal-generation/generation`;

  // Try Qwen3-ASR-Flash format: {"audio": "data:audio/wav;base64,..."}
  const audioDataUri = `data:audio/${mimeType.includes('wav') ? 'wav' : 'mp3'};base64,${audioBase64}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'X-DashScope-SSE': 'disable',
    },
    body: JSON.stringify({
      model,
      input: {
        messages: [
          {
            role: 'user',
            content: [
              {
                audio: audioDataUri,
              },
            ],
          },
        ],
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'No response body');
    console.error(`[ASR] API error ${response.status}: ${errorText.substring(0, 300)}`);
    return {
      success: false,
      transcript: null,
      language: null,
      error: `ASR API returned ${response.status}`,
    };
  }

  const data = await response.json();
  
  // Parse dashScope response format
  // Response: { output: { choices: [{ message: { content: [{ text: "..." }] } }] } }
  let transcript: string | null = null;
  
  // Try the choices format (actual response structure)
  const content = data?.output?.choices?.[0]?.message?.content;
  if (Array.isArray(content) && content.length > 0) {
    const firstText = content.find((item: any) => item.text)?.text;
    if (typeof firstText === 'string' && firstText.trim().length > 0) {
      transcript = firstText.trim();
    }
  }
  
  // Fallback: try nested sentence.text (in case API changes)
  if (!transcript) {
    const sentenceText = data?.output?.output?.sentence?.text;
    if (typeof sentenceText === 'string' && sentenceText.trim().length > 0) {
      transcript = sentenceText.trim();
    }
  }
  
  // Fallback to output.text
  if (!transcript) {
    const outputText = data?.output?.text;
    if (typeof outputText === 'string' && outputText.trim().length > 0) {
      transcript = outputText.trim();
    }
  }

  if (!transcript || transcript.length === 0) {
    return { success: false, transcript: null, language: null, error: 'Empty transcript' };
  }

  // Detect language heuristically from transcript
  const language = detectLanguageFromText(transcript);

  return { success: true, transcript, language, error: null };
}

// ─── Language Detection ─────────────────────────────────────

/**
 * Simple heuristic language detection from transcript text.
 * Checks for Urdu script characters vs Latin characters.
 */
function detectLanguageFromText(text: string): string {
  if (!text) return 'UNKNOWN';

  // Check for Urdu/Arabic script characters (Unicode range)
  const urduChars = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;
  const hasUrdu = urduChars.test(text);

  // Check for Latin characters
  const hasLatin = /[a-zA-Z]/.test(text);

  if (hasUrdu && hasLatin) return 'MIXED';
  if (hasUrdu) return 'URDU';
  if (hasLatin) return 'ENGLISH';
  return 'UNKNOWN';
}

/**
 * Normalize a transcript for display and AI analysis.
 * Trims whitespace, normalizes line breaks, limits length.
 */
export function normalizeTranscript(text: string, maxLength = 2000): string {
  return text
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\n+/g, ' ')
    .substring(0, maxLength);
}
