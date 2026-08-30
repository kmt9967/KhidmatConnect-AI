/**
 * Milestone 6 — Offline AI verification tests
 *
 * Tests AI integration logic WITHOUT live API credentials:
 *   1. Zod AI schema — valid complete response
 *   2. Zod AI schema — invalid enum values
 *   3. Zod AI schema — missing required fields
 *   4. Zod AI schema — out-of-range confidence
 *   5. Zod AI schema — unknown category
 *   6. Markdown fence stripping
 *   7. Malformed JSON handling
 *   8. AI not configured behavior
 *   9. buildAnalysisUserMessage — no PII leakage
 *  10. Prompt content verification
 *  11. Transient error detection
 *  12. Schema edge cases (nullable fields, empty arrays)
 *
 * Run: npx tsx scripts/ai-verify-tests.ts
 */

import { z } from 'zod';

// ─── Inline schemas (same as src/lib/ai/schemas.ts) ──────────

const detectedLanguageSchema = z.enum([
  'URDU', 'ENGLISH', 'ROMAN_URDU', 'MIXED', 'UNKNOWN',
]);

const urgencySchema = z.enum([
  'CRITICAL', 'HIGH', 'MEDIUM', 'LOW',
]);

const emergencyCategorySchema = z.enum([
  'RESCUE', 'MEDICAL', 'FOOD', 'WATER', 'SHELTER', 'TRANSPORT', 'SUPPLIES', 'OTHER',
]);

const aiAnalysisResponseSchema = z.object({
  detectedLanguage: detectedLanguageSchema,
  categories: z.array(emergencyCategorySchema).min(1).max(5),
  urgency: urgencySchema,
  summary: z.string().min(1).max(500),
  reasoning: z.string().max(1000),
  keyNeeds: z.array(z.string().max(200)).max(10),
  peopleAffected: z.number().int().min(1).max(10000).nullable(),
  specialNeeds: z.array(z.string().max(200)).max(10),
  locationTextDetected: z.string().max(500),
  missingInformation: z.array(z.string().max(300)).max(5),
  followUpQuestion: z.string().max(500),
  confidence: z.number().min(0).max(1),
  potentiallyCritical: z.boolean(),
});

// ─── Test infrastructure ──────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    failures.push(label);
    console.log(`  ✗ ${label}`);
  }
}

function section(title: string) {
  console.log(`\n── ${title} ──`);
}

// ─── Markdown fence stripping (inline from emergencyAnalysis.ts) ──

function stripMarkdownFences(raw: string): string {
  let cleaned = raw.trim();
  const fenceMatch = cleaned.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }
  return cleaned;
}

// ─── Valid AI response fixture ────────────────────────────────

const validResponse = {
  detectedLanguage: 'ENGLISH' as const,
  categories: ['MEDICAL'] as const,
  urgency: 'CRITICAL' as const,
  summary: 'Unconscious person not responding, ambulance requested near Gulshan Block 7.',
  reasoning: 'Caller reports unconscious non-responsive person indicating immediate life threat.',
  keyNeeds: ['ambulance', 'emergency medical response'],
  peopleAffected: 1,
  specialNeeds: [],
  locationTextDetected: 'Gulshan Block 7',
  missingInformation: ['patient age', 'known medical conditions'],
  followUpQuestion: 'Does your father have any known medical conditions?',
  confidence: 0.92,
  potentiallyCritical: true,
};

// ═══════════════════════════════════════════════════════════════
// TEST SUITE
// ═══════════════════════════════════════════════════════════════

console.log('Milestone 6 — Offline AI Verification Tests\n');

// ─── 1. Valid complete response ───────────────────────────────
section('1. Valid complete AI response');
{
  const result = aiAnalysisResponseSchema.safeParse(validResponse);
  assert(result.success, 'Valid response passes Zod validation');
  if (result.success) {
    assert(result.data.detectedLanguage === 'ENGLISH', 'Language is ENGLISH');
    assert(result.data.categories[0] === 'MEDICAL', 'Category is MEDICAL');
    assert(result.data.urgency === 'CRITICAL', 'Urgency is CRITICAL');
    assert(result.data.potentiallyCritical === true, 'potentiallyCritical is true');
    assert(result.data.peopleAffected === 1, 'peopleAffected is 1');
    assert(result.data.confidence === 0.92, 'confidence is 0.92');
  }
}

// ─── 2. Invalid enum values ───────────────────────────────────
section('2. Invalid enum values');
{
  const bad1 = { ...validResponse, detectedLanguage: 'FRENCH' };
  const r1 = aiAnalysisResponseSchema.safeParse(bad1);
  assert(!r1.success, 'Invalid detectedLanguage rejected');

  const bad2 = { ...validResponse, urgency: 'EXTREME' };
  const r2 = aiAnalysisResponseSchema.safeParse(bad2);
  assert(!r2.success, 'Invalid urgency rejected');

  const bad3 = { ...validResponse, categories: ['FIRE'] };
  const r3 = aiAnalysisResponseSchema.safeParse(bad3);
  assert(!r3.success, 'Unknown category "FIRE" rejected');
}

// ─── 3. Missing required fields ───────────────────────────────
section('3. Missing required fields');
{
  const { summary, ...noSummary } = validResponse;
  const r1 = aiAnalysisResponseSchema.safeParse(noSummary);
  assert(!r1.success, 'Missing summary rejected');

  const { categories: _c, ...noCats } = validResponse;
  const r2 = aiAnalysisResponseSchema.safeParse(noCats);
  assert(!r2.success, 'Missing categories rejected');

  const { confidence: _conf, ...noConf } = validResponse;
  const r3 = aiAnalysisResponseSchema.safeParse(noConf);
  assert(!r3.success, 'Missing confidence rejected');

  const { potentiallyCritical: _pc, ...noPc } = validResponse;
  const r4 = aiAnalysisResponseSchema.safeParse(noPc);
  assert(!r4.success, 'Missing potentiallyCritical rejected');
}

// ─── 4. Out-of-range confidence ───────────────────────────────
section('4. Out-of-range confidence');
{
  const r1 = aiAnalysisResponseSchema.safeParse({ ...validResponse, confidence: 1.5 });
  assert(!r1.success, 'Confidence > 1 rejected');

  const r2 = aiAnalysisResponseSchema.safeParse({ ...validResponse, confidence: -0.1 });
  assert(!r2.success, 'Confidence < 0 rejected');

  const r3 = aiAnalysisResponseSchema.safeParse({ ...validResponse, confidence: 0 });
  assert(r3.success, 'Confidence = 0 accepted');

  const r4 = aiAnalysisResponseSchema.safeParse({ ...validResponse, confidence: 1 });
  assert(r4.success, 'Confidence = 1 accepted');
}

// ─── 5. Unknown category ──────────────────────────────────────
section('5. Category edge cases');
{
  const r1 = aiAnalysisResponseSchema.safeParse({ ...validResponse, categories: [] });
  assert(!r1.success, 'Empty categories array rejected (min 1)');

  const r2 = aiAnalysisResponseSchema.safeParse({
    ...validResponse,
    categories: ['RESCUE', 'MEDICAL', 'FOOD', 'WATER', 'SHELTER', 'TRANSPORT'],
  });
  assert(!r2.success, '6 categories rejected (max 5)');

  const r3 = aiAnalysisResponseSchema.safeParse({
    ...validResponse,
    categories: ['RESCUE', 'MEDICAL', 'FOOD', 'WATER', 'SHELTER'],
  });
  assert(r3.success, '5 categories accepted');

  const r4 = aiAnalysisResponseSchema.safeParse({ ...validResponse, categories: ['OTHER'] });
  assert(r4.success, 'Single OTHER category accepted');
}

// ─── 6. Markdown fence stripping ──────────────────────────────
section('6. Markdown fence stripping');
{
  const fenced = '```json\n{"key": "value"}\n```';
  const stripped = stripMarkdownFences(fenced);
  assert(stripped === '{"key": "value"}', 'Strips ```json fences');

  const fenced2 = '```\n{"key": "value"}\n```';
  const stripped2 = stripMarkdownFences(fenced2);
  assert(stripped2 === '{"key": "value"}', 'Strips ``` fences');

  const plain = '{"key": "value"}';
  const stripped3 = stripMarkdownFences(plain);
  assert(stripped3 === '{"key": "value"}', 'Plain JSON unchanged');

  const withWhitespace = '  \n {"key": "value"} \n  ';
  const stripped4 = stripMarkdownFences(withWhitespace);
  assert(stripped4 === '{"key": "value"}', 'Whitespace trimmed');
}

// ─── 7. Malformed JSON handling ───────────────────────────────
section('7. Malformed JSON handling');
{
  // Simulate parse + validate pipeline
  function parseAndValidate(raw: string): boolean {
    const cleaned = stripMarkdownFences(raw);
    try {
      const parsed = JSON.parse(cleaned);
      const result = aiAnalysisResponseSchema.safeParse(parsed);
      return result.success;
    } catch {
      return false; // JSON parse failed
    }
  }

  assert(!parseAndValidate('{invalid json}'), 'Invalid JSON safely rejected');
  assert(!parseAndValidate(''), 'Empty string rejected');
  assert(!parseAndValidate('null'), 'null rejected');
  assert(!parseAndValidate('[]'), 'Array rejected');
  assert(!parseAndValidate('```json\n{bad}\n```'), 'Fenced invalid JSON rejected');

  // Valid JSON but wrong schema
  assert(!parseAndValidate('{"foo": "bar"}'), 'Wrong schema rejected');
  assert(!parseAndValidate('{"detectedLanguage": "KLINGON"}'), 'Invalid enum in JSON rejected');

  // Valid complete JSON through fence
  const validFenced = '```json\n' + JSON.stringify(validResponse) + '\n```';
  assert(parseAndValidate(validFenced), 'Valid fenced JSON passes');
}

// ─── 8. AI not configured behavior ────────────────────────────
section('8. AI not configured behavior');
{
  // Save originals
  const origKey = process.env.ALIBABA_MODEL_STUDIO_API_KEY;
  const origUrl = process.env.ALIBABA_MODEL_STUDIO_BASE_URL;

  // Inline the corrected isAiConfigured logic (requires BOTH key + URL)
  function isAiConfigured() {
    return !!(
      process.env.ALIBABA_MODEL_STUDIO_API_KEY &&
      process.env.ALIBABA_MODEL_STUDIO_BASE_URL
    );
  }

  function getAiConfigStatus() {
    const missing: string[] = [];
    if (!process.env.ALIBABA_MODEL_STUDIO_API_KEY) missing.push('ALIBABA_MODEL_STUDIO_API_KEY');
    if (!process.env.ALIBABA_MODEL_STUDIO_BASE_URL) missing.push('ALIBABA_MODEL_STUDIO_BASE_URL');
    return { configured: missing.length === 0, missing };
  }

  // Test: nothing set
  delete process.env.ALIBABA_MODEL_STUDIO_API_KEY;
  delete process.env.ALIBABA_MODEL_STUDIO_BASE_URL;
  assert(!isAiConfigured(), 'isAiConfigured false when nothing set');
  const s1 = getAiConfigStatus();
  assert(!s1.configured, 'Config status: not configured');
  assert(s1.missing.includes('ALIBABA_MODEL_STUDIO_API_KEY'), 'Missing: API key');
  assert(s1.missing.includes('ALIBABA_MODEL_STUDIO_BASE_URL'), 'Missing: base URL');

  // Test: only API key set (base URL missing)
  process.env.ALIBABA_MODEL_STUDIO_API_KEY = 'test-key';
  delete process.env.ALIBABA_MODEL_STUDIO_BASE_URL;
  assert(!isAiConfigured(), 'isAiConfigured false with only API key (no base URL)');
  const s2 = getAiConfigStatus();
  assert(s2.missing.length === 1, 'One missing var');
  assert(s2.missing[0] === 'ALIBABA_MODEL_STUDIO_BASE_URL', 'Missing: base URL only');

  // Test: only base URL set (API key missing)
  delete process.env.ALIBABA_MODEL_STUDIO_API_KEY;
  process.env.ALIBABA_MODEL_STUDIO_BASE_URL = 'https://example.com/v1';
  assert(!isAiConfigured(), 'isAiConfigured false with only base URL (no API key)');

  // Test: both set → configured
  process.env.ALIBABA_MODEL_STUDIO_API_KEY = 'test-key';
  process.env.ALIBABA_MODEL_STUDIO_BASE_URL = 'https://example.com/v1';
  assert(isAiConfigured(), 'isAiConfigured true when both set');
  const s3 = getAiConfigStatus();
  assert(s3.configured, 'Config status: configured');
  assert(s3.missing.length === 0, 'No missing vars');

  // Restore
  if (origKey) process.env.ALIBABA_MODEL_STUDIO_API_KEY = origKey; else delete process.env.ALIBABA_MODEL_STUDIO_API_KEY;
  if (origUrl) process.env.ALIBABA_MODEL_STUDIO_BASE_URL = origUrl; else delete process.env.ALIBABA_MODEL_STUDIO_BASE_URL;
}

// ─── 9. buildAnalysisUserMessage — no PII leakage ─────────────
section('9. buildAnalysisUserMessage — no PII leakage');
{
  // Inline the function
  function buildAnalysisUserMessage(input: {
    originalMessage: string;
    source: string;
    locationText?: string | null;
    transcript?: string | null;
  }): string {
    const parts: string[] = [];
    parts.push(`Emergency message: "${input.originalMessage}"`);
    if (input.source) parts.push(`Source: ${input.source}`);
    if (input.locationText) parts.push(`Location provided: ${input.locationText}`);
    if (input.transcript) parts.push(`Voice transcript: "${input.transcript}"`);
    return parts.join('\n');
  }

  const msg = buildAnalysisUserMessage({
    originalMessage: 'My mother is unconscious',
    source: 'WEB',
    locationText: 'Gulshan Block 7',
    transcript: null,
  });

  assert(msg.includes('My mother is unconscious'), 'Includes original message');
  assert(msg.includes('WEB'), 'Includes source');
  assert(msg.includes('Gulshan Block 7'), 'Includes location');
  assert(!msg.includes('phone'), 'Does not include phone field');
  assert(!msg.includes('0300'), 'Does not include phone number');
  assert(!msg.includes('Voice transcript'), 'No transcript section when null');

  const msg2 = buildAnalysisUserMessage({
    originalMessage: 'Test',
    source: 'VOICE_CALL',
    locationText: null,
    transcript: 'Some transcript',
  });
  assert(msg2.includes('Voice transcript'), 'Includes transcript when provided');
  assert(!msg2.includes('Location provided'), 'No location when null');
}

// ─── 10. Prompt content verification ──────────────────────────
section('10. Prompt content verification');
{
  // Read the prompt file content
  const fs = require('fs');
  const path = require('path');
  const promptPath = path.join(__dirname, '..', 'src', 'lib', 'ai', 'prompts.ts');
  const promptContent = fs.readFileSync(promptPath, 'utf-8') as string;

  assert(promptContent.includes('JSON'), 'Prompt mentions JSON output');
  assert(promptContent.includes('NEVER fabricate'), 'Prompt has no-fabrication rule');
  assert(promptContent.includes('URDU'), 'Prompt mentions URDU language');
  assert(promptContent.includes('ROMAN_URDU'), 'Prompt mentions ROMAN_URDU');
  assert(promptContent.includes('MIXED'), 'Prompt mentions MIXED');
  assert(promptContent.includes('CRITICAL'), 'Prompt mentions CRITICAL urgency');
  assert(promptContent.includes('human'), 'Prompt mentions human review');
  assert(promptContent.includes('follow-up') || promptContent.includes('followUp') || promptContent.includes('ONE'), 'Prompt mentions follow-up rule');
  assert(!promptContent.includes('API_KEY'), 'Prompt does not contain API key');
  assert(promptContent.includes('RESCUE') && promptContent.includes('MEDICAL'), 'Prompt defines categories');
}

// ─── 11. Transient error detection ────────────────────────────
section('11. Transient error detection');
{
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

  assert(isTransientError(new Error('timeout of 15000ms exceeded')), 'Timeout is transient');
  assert(isTransientError(new Error('Request timed out after 15s')), 'Timed out is transient');
  assert(isTransientError(new Error('ECONNRESET')), 'ECONNRESET is transient');
  assert(isTransientError(new Error('HTTP 429 Too Many Requests')), '429 is transient');
  assert(isTransientError(new Error('HTTP 502 Bad Gateway')), '502 is transient');
  assert(isTransientError(new Error('socket hang up')), 'Socket hang up is transient');
  assert(!isTransientError(new Error('Invalid API key')), 'Auth error is NOT transient');
  assert(!isTransientError(new Error('Model not found')), 'Not found is NOT transient');
  assert(!isTransientError('string error'), 'Non-Error is NOT transient');
  assert(!isTransientError(null), 'null is NOT transient');
}

// ─── 12. Schema edge cases ────────────────────────────────────
section('12. Schema edge cases');
{
  // Nullable peopleAffected
  const r1 = aiAnalysisResponseSchema.safeParse({ ...validResponse, peopleAffected: null });
  assert(r1.success, 'peopleAffected = null accepted');

  // Zero peopleAffected
  const r2 = aiAnalysisResponseSchema.safeParse({ ...validResponse, peopleAffected: 0 });
  assert(!r2.success, 'peopleAffected = 0 rejected (min 1)');

  // Empty string location
  const r3 = aiAnalysisResponseSchema.safeParse({ ...validResponse, locationTextDetected: '' });
  assert(r3.success, 'Empty locationTextDetected accepted');

  // Empty followUpQuestion
  const r4 = aiAnalysisResponseSchema.safeParse({ ...validResponse, followUpQuestion: '' });
  assert(r4.success, 'Empty followUpQuestion accepted');

  // Empty keyNeeds
  const r5 = aiAnalysisResponseSchema.safeParse({ ...validResponse, keyNeeds: [] });
  assert(r5.success, 'Empty keyNeeds accepted');

  // Multiple categories
  const r6 = aiAnalysisResponseSchema.safeParse({
    ...validResponse,
    categories: ['RESCUE', 'MEDICAL'],
  });
  assert(r6.success, 'Multiple categories accepted');

  // All languages
  for (const lang of ['URDU', 'ENGLISH', 'ROMAN_URDU', 'MIXED', 'UNKNOWN'] as const) {
    const r = aiAnalysisResponseSchema.safeParse({ ...validResponse, detectedLanguage: lang });
    assert(r.success, `Language ${lang} accepted`);
  }

  // All urgencies
  for (const urg of ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const) {
    const r = aiAnalysisResponseSchema.safeParse({ ...validResponse, urgency: urg });
    assert(r.success, `Urgency ${urg} accepted`);
  }

  // Summary max length
  const longSummary = 'a'.repeat(501);
  const r7 = aiAnalysisResponseSchema.safeParse({ ...validResponse, summary: longSummary });
  assert(!r7.success, 'Summary > 500 chars rejected');

  const okSummary = 'a'.repeat(500);
  const r8 = aiAnalysisResponseSchema.safeParse({ ...validResponse, summary: okSummary });
  assert(r8.success, 'Summary = 500 chars accepted');
}

// ─── 13. Configuration source verification ────────────────────
section('13. Configuration source verification');
{
  const fs = require('fs');
  const path = require('path');

  // Read the client source
  const clientPath = path.join(__dirname, '..', 'src', 'lib', 'ai', 'alibabaQwenClient.ts');
  const clientSrc = fs.readFileSync(clientPath, 'utf-8') as string;

  // Model default must be qwen3.7-plus
  assert(clientSrc.includes("'qwen3.7-plus'"), 'Default model is qwen3.7-plus');
  assert(!clientSrc.includes("'qwen-plus'"), 'Old model qwen-plus is NOT present');

  // No silent fallback to legacy URL
  assert(!clientSrc.includes("baseURL: baseURL ||"), 'No silent fallback with || operator');
  assert(!clientSrc.includes("baseURL || 'https"), 'No hardcoded fallback URL');

  // isAiConfigured checks BOTH key and base URL
  assert(clientSrc.includes('ALIBABA_MODEL_STUDIO_API_KEY') && clientSrc.includes('ALIBABA_MODEL_STUDIO_BASE_URL'),
    'isAiConfigured references both API_KEY and BASE_URL');

  // getAiConfigStatus exists
  assert(clientSrc.includes('getAiConfigStatus'), 'getAiConfigStatus function exists');

  // No ALIBABA_MODEL_STUDIO_MODEL_NAME env var (removed in cleanup)
  assert(!clientSrc.includes('ALIBABA_MODEL_STUDIO_MODEL_NAME'), 'No stale ALIBABA_MODEL_STUDIO_MODEL_NAME env var');

  // OpenAI SDK uses configured baseURL
  assert(clientSrc.includes('baseURL,') || clientSrc.includes('baseURL:'),
    'OpenAI SDK receives configured baseURL');

  // Read .env.example
  const envExamplePath = path.join(__dirname, '..', '.env.example');
  const envExample = fs.readFileSync(envExamplePath, 'utf-8') as string;

  assert(envExample.includes('ALIBABA_MODEL_STUDIO_API_KEY='), '.env.example has API_KEY placeholder');
  assert(envExample.includes('ALIBABA_MODEL_STUDIO_BASE_URL='), '.env.example has BASE_URL placeholder');
  assert(envExample.includes('ALIBABA_MODEL_NAME=qwen3.7-plus'), '.env.example default model is qwen3.7-plus');
  assert(!envExample.includes('qwen-plus'), '.env.example does NOT reference old qwen-plus');
  assert(envExample.includes('{WorkspaceId}'), '.env.example documents workspace-specific URL pattern');

  // .env.example BASE_URL should NOT have a hardcoded default
  const baseUrlLine = envExample.split(/\r?\n/).find((l: string) => l.startsWith('ALIBABA_MODEL_STUDIO_BASE_URL='));
  assert(baseUrlLine === 'ALIBABA_MODEL_STUDIO_BASE_URL=', 'BASE_URL has no hardcoded default value');

  // Read emergencyAnalysis.ts
  const analysisPath = path.join(__dirname, '..', 'src', 'lib', 'ai', 'emergencyAnalysis.ts');
  const analysisSrc = fs.readFileSync(analysisPath, 'utf-8') as string;

  assert(analysisSrc.includes('getAiConfigStatus'), 'emergencyAnalysis imports getAiConfigStatus');
  assert(analysisSrc.includes('getAiConfigStatus().missing'), 'Error message uses dynamic missing-var list');
  assert(!analysisSrc.includes('ALIBABA_MODEL_STUDIO_API_KEY missing'),
    'Old hardcoded API-key-only error message removed');

  // No credentials in log output — check that apiKey variable is not inside a template literal in console.log
  const logLines = clientSrc.split(/\r?\n/).filter((l: string) => l.includes('console.log'));
  const apiKeyInLog = logLines.some((l: string) => l.includes('${apiKey}') || l.includes('${process.env.ALIBABA_MODEL_STUDIO_API_KEY}'));
  assert(!apiKeyInLog, 'API key not interpolated in any log statement');

  // Log only safe metadata: model name, finish_reason, elapsed
  const safeLogCheck = logLines.every((l: string) =>
    !l.includes('apiKey') && !l.includes('API_KEY') && !l.includes('tokenHash')
  );
  assert(safeLogCheck, 'Log statements reference only safe metadata (model, finish, elapsed)');
}

// ═══════════════════════════════════════════════════════════════
// RESULTS
// ═══════════════════════════════════════════════════════════════

console.log('\n════════════════════════════════════════════');
console.log(`  Total: ${passed + failed}  |  Passed: ${passed}  |  Failed: ${failed}`);
if (failures.length > 0) {
  console.log('\n  Failed tests:');
  failures.forEach((f) => console.log(`    - ${f}`));
}
console.log('════════════════════════════════════════════\n');

process.exit(failed > 0 ? 1 : 0);
