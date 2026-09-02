/**
 * Fast voice conversation model — uses qwen-turbo for quick responses.
 *
 * Two-model strategy:
 * - FAST (this module): qwen-turbo for immediate conversational turns (~300-500ms)
 *   Purpose: decide the next question, language matching, short acknowledgement
 * - FULL ANALYSIS (emergencyAnalysis.ts): qwen3.7-plus for deep enrichment (~10s)
 *   Purpose: structured emergency analysis, category/urgency, operator summary
 *
 * The fast model runs synchronously during the call turn.
 * The full analysis runs asynchronously after the fast response is sent.
 *
 * CRITICAL: The fast model NEVER rejects or drops cases.
 * It only generates conversational responses.
 */

import OpenAI from 'openai';

// ─── Configuration ──────────────────────────────────────────

function getFastModel(): string {
  return process.env.ALIBABA_FAST_MODEL_NAME || 'qwen-turbo';
}

function getClient(): OpenAI | null {
  const apiKey = process.env.ALIBABA_MODEL_STUDIO_API_KEY;
  const baseURL = process.env.ALIBABA_MODEL_STUDIO_BASE_URL;
  if (!apiKey || !baseURL) return null;

  // Reuse the same OpenAI client instance
  return new OpenAI({ apiKey, baseURL });
}

const FAST_TIMEOUT_MS = 10_000;

// ─── Types ──────────────────────────────────────────────────

export interface FastVoiceResult {
  success: boolean;
  responseText: string | null;
  language: 'en' | 'ur';
  model: string | null;
  latencyMs: number;
  error: string | null;
}

// ─── System Prompt ──────────────────────────────────────────

const FAST_VOICE_SYSTEM_PROMPT = `You are KhidmatConnect AI, a phone emergency assistant for Pakistan.

RULES:
- Match the caller's language (Urdu script, Roman Urdu, or English).
- Be VERY CONCISE — your response will be spoken aloud. Maximum 15 words.
- NEVER say help/ambulance/fire brigade has been dispatched (you cannot dispatch).
- NEVER invent facts about victims, injuries, or people affected unless the caller explicitly stated them.
- NEVER end the call.
- Ask ONE short follow-up question if you need location or more details.
- If the caller reported a fire/accident/emergency WITHOUT giving location, ask ONLY for location.
- If the caller already gave location + emergency, acknowledge briefly and say coordinator is reviewing.
- For Urdu callers, respond in Urdu script.
- For Roman Urdu callers, respond in Roman Urdu.
- For English callers, respond in English.
- Do NOT wrap your response in quotation marks.

EXAMPLE RESPONSES:
Urdu fire (no location): "جی، آگ کی اطلاع محفوظ ہو گئی۔ براہِ کرم اپنی لوکیشن بتائیں۔"
Urdu medical: "جی، براہِ کرم اپنی لوکیشن یا قریب ترین نشان بتائیں۔"
English: "What is your exact location?"`;

// ─── Fast Voice Conversation ────────────────────────────────

/**
 * Generate a quick conversational response for the current turn.
 *
 * This runs synchronously during the call and must be fast (<2s).
 * It does NOT perform full emergency analysis — that runs async.
 */
export async function fastVoiceResponse(input: {
  callerTranscript: string;
  cumulativeTranscript: string;
  detectedLanguage: string | null;
  turnCount: number;
  hasLocation: boolean;
  hasDescription: boolean;
}): Promise<FastVoiceResult> {
  const client = getClient();
  const model = getFastModel();
  const startTime = Date.now();

  if (!client) {
    return {
      success: false,
      responseText: null,
      language: 'en',
      model: null,
      latencyMs: 0,
      error: 'AI client not configured',
    };
  }

  // Determine response language from detected language or transcript heuristic
  const lang = detectResponseLanguage(input.detectedLanguage, input.callerTranscript);

  // Build a context-aware user message
  const contextParts: string[] = [];
  contextParts.push(`Caller said: "${input.callerTranscript}"`);

  if (input.hasLocation) {
    contextParts.push('Location: KNOWN');
  } else {
    contextParts.push('Location: UNKNOWN — ask for it if not provided yet');
  }

  if (input.hasDescription) {
    contextParts.push('Emergency description: PROVIDED');
  } else {
    contextParts.push('Emergency description: UNKNOWN — ask what happened');
  }

  contextParts.push(`Turn: ${input.turnCount}`);
  contextParts.push(`Language preference: ${lang}`);

  const userMessage = contextParts.join('. ') + '.';

  try {
    const response = await client.chat.completions.create(
      {
        model,
        messages: [
          { role: 'system', content: FAST_VOICE_SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.3,
        max_tokens: 100,
      },
      { timeout: FAST_TIMEOUT_MS }
    );

    const latencyMs = Date.now() - startTime;
    const content = response.choices[0]?.message?.content || '';
    let responseText = content.trim();
    // Strip surrounding quotes that some models add
    if ((responseText.startsWith('"') && responseText.endsWith('"')) ||
        (responseText.startsWith('\u201c') && responseText.endsWith('\u201d'))) {
      responseText = responseText.slice(1, -1).trim();
    }

    if (!responseText.trim()) {
      // Fallback to static acknowledgement
      const fallbackText = getStaticAcknowledgement(lang);
      console.log('[FastVoice] Empty response, using fallback. latency=' + latencyMs + 'ms');
      return {
        success: true,
        responseText: fallbackText,
        language: lang,
        model,
        latencyMs,
        error: null,
      };
    }

    console.log('[FastVoice] model=' + model + ' lang=' + lang + ' latency=' + latencyMs + 'ms response="' + responseText.substring(0, 80) + '"');

    return {
      success: true,
      responseText: responseText,
      language: lang,
      model,
      latencyMs,
      error: null,
    };
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[FastVoice] Failed: ' + message.substring(0, 200));

    // Fallback to static acknowledgement — NEVER fail silently
    const fallbackText = getStaticAcknowledgement(lang);
    return {
      success: true, // Still return success with fallback text
      responseText: fallbackText,
      language: lang,
      model,
      latencyMs,
      error: message,
    };
  }
}

// ─── Helpers ────────────────────────────────────────────────

function detectResponseLanguage(detectedLanguage: string | null, transcript: string): 'en' | 'ur' {
  if (detectedLanguage === 'URDU' || detectedLanguage === 'MIXED') return 'ur';

  // Heuristic: check for Urdu script characters
  const urduChars = /[\u0600-\u06FF]/;
  if (urduChars.test(transcript)) return 'ur';

  return 'en';
}

function getStaticAcknowledgement(lang: 'en' | 'ur'): string {
  if (lang === 'ur') {
    return 'جی، میں آپ کی معلومات محفوظ کر رہا ہوں۔';
  }
  return 'Okay, I am recording your emergency information.';
}
