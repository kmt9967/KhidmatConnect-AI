import OpenAI from 'openai';

/**
 * Alibaba Model Studio client using OpenAI-compatible interface.
 *
 * Preferred Singapore endpoint (workspace-specific):
 *   https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1
 *
 * Legacy international fallback (only if explicitly configured):
 *   https://dashscope-intl.aliyuncs.com/compatible-mode/v1
 *
 * Required environment variables:
 *   ALIBABA_MODEL_STUDIO_API_KEY   — API key from Alibaba Cloud Model Studio
 *   ALIBABA_MODEL_STUDIO_BASE_URL  — Workspace-specific endpoint URL
 *   ALIBABA_MODEL_NAME             — Model identifier (default: qwen3.7-plus)
 *
 * If any of API key or base URL are missing, the client is treated as
 * unconfigured and AI enrichment is gracefully skipped.
 */

let _client: OpenAI | null = null;

/**
 * Returns the configured model name, or the default.
 */
export function getModelName(): string {
  return process.env.ALIBABA_MODEL_NAME || 'qwen3.7-plus';
}

/**
 * Check whether all required AI configuration is present.
 * Requires: API key + base URL. Model has a safe default.
 */
export function isAiConfigured(): boolean {
  return !!(
    process.env.ALIBABA_MODEL_STUDIO_API_KEY &&
    process.env.ALIBABA_MODEL_STUDIO_BASE_URL
  );
}

/**
 * Describe which configuration piece is missing (for server logs only).
 * Never logs secrets — only which env var is absent.
 */
export function getAiConfigStatus(): { configured: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!process.env.ALIBABA_MODEL_STUDIO_API_KEY) missing.push('ALIBABA_MODEL_STUDIO_API_KEY');
  if (!process.env.ALIBABA_MODEL_STUDIO_BASE_URL) missing.push('ALIBABA_MODEL_STUDIO_BASE_URL');
  return { configured: missing.length === 0, missing };
}

/**
 * Build or return the cached OpenAI client.
 * Returns null if configuration is incomplete (no silent fallback).
 */
function getClient(): OpenAI | null {
  const apiKey = process.env.ALIBABA_MODEL_STUDIO_API_KEY;
  const baseURL = process.env.ALIBABA_MODEL_STUDIO_BASE_URL;

  // Both are required — no silent fallback to legacy endpoint
  if (!apiKey || !baseURL) {
    return null;
  }

  if (_client) return _client;

  _client = new OpenAI({
    apiKey,
    baseURL,
  });

  return _client;
}

/**
 * Timeout for AI calls in milliseconds.
 *
 * Observed live latency for qwen3.7-plus: ~28–30 seconds.
 * 15s was too aggressive and would cause every call to timeout.
 * 45s provides ~50% headroom over observed p95 latency while keeping
 * the citizen wait reasonable. The case is already persisted before
 * this call, so timeout only affects the enrichment response — not
 * case capture.
 */
const AI_TIMEOUT_MS = 45_000;

export interface ChatCompletionResult {
  content: string;
  model: string;
  finishReason: string | null;
}

/**
 * Send a chat completion request to Alibaba Model Studio (Qwen).
 * Returns null if AI is not configured.
 * Throws on provider/network errors (caller must handle).
 */
export async function chatCompletion(
  systemPrompt: string,
  userMessage: string
): Promise<ChatCompletionResult | null> {
  const client = getClient();
  if (!client) return null;

  const model = getModelName();
  const startTime = Date.now();

  const response = await client.chat.completions.create(
    {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.3,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    },
    { timeout: AI_TIMEOUT_MS }
  );

  const elapsed = Date.now() - startTime;
  const choice = response.choices[0];

  console.log(
    `[AI] model=${model} finish=${choice?.finish_reason ?? 'unknown'} ` +
    `elapsed=${elapsed}ms case=server`
  );

  return {
    content: choice?.message?.content ?? '',
    model: response.model,
    finishReason: choice?.finish_reason ?? null,
  };
}
