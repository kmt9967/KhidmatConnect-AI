import { chatCompletion, isAiConfigured, getModelName, getAiConfigStatus } from './alibabaQwenClient';
import { EMERGENCY_ANALYSIS_SYSTEM_PROMPT, buildAnalysisUserMessage } from './prompts';
import { aiAnalysisResponseSchema, type AiAnalysisResponse } from './schemas';

/**
 * Result of an emergency AI analysis attempt.
 */
export interface EmergencyAnalysisResult {
  success: boolean;
  analysis: AiAnalysisResponse | null;
  error: string | null;
  model: string | null;
}

/**
 * Strip markdown code fences from AI response if present.
 * Handles ```json ... ``` and ``` ... ``` patterns.
 */
function stripMarkdownFences(raw: string): string {
  let cleaned = raw.trim();
  // Remove ```json ... ``` or ``` ... ```
  const fenceMatch = cleaned.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }
  return cleaned;
}

/**
 * Parse and validate AI response defensively.
 * Handles: markdown fences, extra whitespace, malformed JSON, missing fields, wrong enums.
 */
function parseAnalysisResponse(raw: string): AiAnalysisResponse | null {
  const cleaned = stripMarkdownFences(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.error('[AI] Failed to parse JSON response');
    return null;
  }

  const result = aiAnalysisResponseSchema.safeParse(parsed);
  if (!result.success) {
    console.error('[AI] Zod validation failed:', JSON.stringify(result.error.issues).substring(0, 300));
    return null;
  }

  return result.data;
}

/**
 * Analyze an emergency message using Alibaba Qwen.
 *
 * Architecture:
 * 1. If AI is not configured → returns { success: false, error: 'not_configured' }
 * 2. Calls Qwen with system prompt + emergency message
 * 3. Parses and validates structured JSON response
 * 4. On any failure → returns { success: false, error: ... }
 *
 * The caller (API route) must ensure case creation succeeds regardless of AI outcome.
 */
export async function analyzeEmergency(input: {
  originalMessage: string;
  source: string;
  locationText?: string | null;
  transcript?: string | null;
}): Promise<EmergencyAnalysisResult> {
  if (!isAiConfigured()) {
    return {
      success: false,
      analysis: null,
      error: `AI not configured — missing: ${getAiConfigStatus().missing.join(', ')}`,
      model: null,
    };
  }

  const userMessage = buildAnalysisUserMessage(input);

  // Attempt with one retry for transient failures
  let lastError: string | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await chatCompletion(EMERGENCY_ANALYSIS_SYSTEM_PROMPT, userMessage);

      if (!result) {
        return {
          success: false,
          analysis: null,
          error: 'AI client returned no result',
          model: null,
        };
      }

      if (!result.content) {
        lastError = 'Empty AI response';
        continue; // retry
      }

      const analysis = parseAnalysisResponse(result.content);

      if (!analysis) {
        lastError = 'AI response failed validation';
        continue; // retry
      }

      return {
        success: true,
        analysis,
        error: null,
        model: result.model,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[AI] Attempt ${attempt + 1} failed: ${message.substring(0, 200)}`);
      lastError = message;

      // Only retry on transient errors (timeout, network)
      if (!isTransientError(err)) {
        break;
      }
    }
  }

  return {
    success: false,
    analysis: null,
    error: lastError,
    model: getModelName(),
  };
}

/**
 * Check if an error is transient (timeout, network) and worth retrying.
 */
function isTransientError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return (
      msg.includes('timeout') ||
      msg.includes('timed out') ||
      msg.includes('econnreset') ||
      msg.includes('econnrefused') ||
      msg.includes('enetunreach') ||
      msg.includes('socket hang up') ||
      msg.includes('429') ||
      msg.includes('500') ||
      msg.includes('502') ||
      msg.includes('503')
    );
  }
  return false;
}
