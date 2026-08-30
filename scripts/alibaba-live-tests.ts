/**
 * Milestone 6 — Live Alibaba Model Studio (Qwen) Validation
 *
 * Runs 5 real emergency messages through the configured Qwen endpoint,
 * validates structured JSON responses against the PRODUCTION Zod contract,
 * and verifies AI behavioral correctness.
 *
 * No credentials are printed.
 */

import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';

// ─── Load .env.local ────────────────────────────────────────────
const envPath = path.join(__dirname, '..', '.env.local');
for (const line of fs.readFileSync(envPath, 'utf-8').split(/\r?\n/)) {
  const m = line.match(/^(\w+)=(.*)$/);
  if (m) {
    const key = m[1];
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

// ─── Production Zod schema (exact copy of src/lib/ai/schemas.ts) ─
const detectedLanguageSchema = z.enum(['URDU', 'ENGLISH', 'ROMAN_URDU', 'MIXED', 'UNKNOWN']);
const urgencySchema = z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);
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

// ─── Production prompt (exact copy of src/lib/ai/prompts.ts) ────
const EMERGENCY_ANALYSIS_SYSTEM_PROMPT = `You are an AI emergency triage assistant for KhidmatConnect — a humanitarian disaster relief platform operated by Alkhidmat Foundation in Pakistan.

## YOUR ROLE
- Analyze emergency messages and classify them for human operators.
- You DO NOT accept or reject requests.
- You DO NOT dispatch resources.
- You RECOMMEND classification only. A human operator makes all decisions.

## OUTPUT FORMAT
Respond with ONLY a valid JSON object. No markdown, no code fences, no explanation outside JSON.

The JSON structure must be:
{
  "detectedLanguage": "URDU" | "ENGLISH" | "ROMAN_URDU" | "MIXED" | "UNKNOWN",
  "categories": ["RESCUE" | "MEDICAL" | "FOOD" | "WATER" | "SHELTER" | "TRANSPORT" | "SUPPLIES" | "OTHER"],
  "urgency": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
  "summary": "short operational summary (max 500 chars)",
  "reasoning": "brief operational justification, not chain-of-thought (max 1000 chars)",
  "keyNeeds": ["specific needs identified"],
  "peopleAffected": number | null,
  "specialNeeds": ["elderly", "children", "pregnant", "disabled", "medical conditions" etc.],
  "locationTextDetected": "location extracted from message or empty string",
  "missingInformation": ["what critical info is missing"],
  "followUpQuestion": "ONE useful follow-up question or empty string",
  "confidence": 0.0 to 1.0,
  "potentiallyCritical": true | false
}

## LANGUAGE DETECTION
- "ENGLISH": Message is primarily in English
- "URDU": Message is in Urdu/Arabic script
- "ROMAN_URDU": Message is Urdu written in Latin/Roman script
- "MIXED": Message code-switches between English and Urdu
- "UNKNOWN": Cannot determine language

## CATEGORIES
Select 1-5 that apply. Use only these values:
- RESCUE: Person trapped, stranded, needs extraction (flood, collapse, fire)
- MEDICAL: Medical emergency, injury, illness, unconscious person
- FOOD: Food insecurity, hunger
- WATER: Clean water needed
- SHELTER: Displaced, needs safe shelter
- TRANSPORT: Needs evacuation or transport
- SUPPLIES: Needs material supplies (medicine, blankets, etc.)
- OTHER: Does not fit above categories

## URGENCY CLASSIFICATION
- CRITICAL: Immediate threat to life — unconscious, cannot breathe, trapped in active danger, severe bleeding, fire
- HIGH: Serious but stable — vulnerable person stranded, urgent medical need, evacuation concern
- MEDIUM: Meaningful humanitarian need with no immediate life threat
- LOW: Information/support request without immediate danger

## CRITICAL RULES
1. NEVER fabricate location, number of people, or medical conditions.
2. If information is unknown, set peopleAffected to null, locationTextDetected to empty string.
3. Low confidence must NOT prevent classification — set confidence low but still classify.
4. If potentiallyCritical is true, the emergency is life-threatening. Still classify even with incomplete info.
5. Provide at most ONE follow-up question. It should be the single most useful missing piece.
6. The "reasoning" field is a short operational justification, NOT step-by-step thinking.
7. Do not diagnose medical conditions. Classify reported symptoms only.
8. If the message is in Urdu or Roman Urdu, the summary should still be in English for operator use.

## EXAMPLE
Input: "My father is unconscious and not responding. We need an ambulance near Gulshan Block 7."
Output:
{
  "detectedLanguage": "ENGLISH",
  "categories": ["MEDICAL"],
  "urgency": "CRITICAL",
  "summary": "Unconscious person not responding, ambulance requested near Gulshan Block 7.",
  "reasoning": "Caller reports unconscious non-responsive person indicating immediate life threat.",
  "keyNeeds": ["ambulance", "emergency medical response"],
  "peopleAffected": 1,
  "specialNeeds": [],
  "locationTextDetected": "Gulshan Block 7",
  "missingInformation": ["patient age", "known medical conditions"],
  "followUpQuestion": "Does your father have any known medical conditions like diabetes or heart disease?",
  "confidence": 0.92,
  "potentiallyCritical": true
}`;

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

// ─── Test cases ─────────────────────────────────────────────────
const testCases = [
  {
    name: 'English — clear medical emergency',
    input: {
      originalMessage: 'My mother collapsed and is not breathing. We are at home in Lahore. Please send an ambulance immediately!',
      source: 'WEB',
      locationText: 'Lahore',
    },
    expect: {
      language: 'ENGLISH',
      urgencies: ['CRITICAL', 'HIGH'],
      categories: ['MEDICAL', 'RESCUE'],
      hasFollowUp: false,
      peopleAffectedMin: 1,
    },
  },
  {
    name: 'Urdu — family emergency (script)',
    input: {
      originalMessage: 'میری بیٹی کو شدید بخار ہے اور وہ بےہوش ہو گئی ہے۔ ہم کراچی میں ہیں۔ براہ کرم مدد کریں۔',
      source: 'WEB',
      locationText: 'Karachi',
    },
    expect: {
      language: 'URDU',
      urgencies: ['CRITICAL', 'HIGH'],
      categories: ['MEDICAL'],
      hasFollowUp: false,
      peopleAffectedMin: 1,
    },
  },
  {
    name: 'Roman Urdu — traffic accident',
    input: {
      originalMessage: 'Meri gaari ka accident ho gaya hai motorway pe. Mere 2 dost zakhmi hain. Jaldi ambulance bhejein. Location: Lahore-Islamabad Motorway near Sheikhupura interchange.',
      source: 'PHONE',
      locationText: 'Lahore-Islamabad Motorway',
    },
    expect: {
      language: 'ROMAN_URDU',
      urgencies: ['CRITICAL', 'HIGH'],
      categories: ['RESCUE', 'MEDICAL', 'TRANSPORT'],
      hasFollowUp: false,
      peopleAffectedMin: 2,
    },
  },
  {
    name: 'Mixed language — fire emergency',
    input: {
      originalMessage: 'Ghar mein aag lag gayi hai! Fire brigade chahiye urgently. Hum Rawalpindi mein hain. Children are trapped inside.',
      source: 'WEB',
      locationText: 'Rawalpindi',
    },
    expect: {
      language: 'MIXED',
      urgencies: ['CRITICAL'],
      categories: ['RESCUE', 'MEDICAL'],
      hasFollowUp: false,
      peopleAffectedMin: 1,
    },
  },
  {
    name: 'Vague/ambiguous — should generate follow-up question',
    input: {
      originalMessage: 'Kuch theek nahi hai. Madad chahiye.',
      source: 'WEB',
      locationText: null,
    },
    expect: {
      language: 'ROMAN_URDU',
      urgencies: ['MEDIUM', 'LOW', 'HIGH'],
      categories: ['OTHER', 'FOOD', 'WATER', 'SHELTER'],
      hasFollowUp: true,
      peopleAffectedMin: 1,
    },
  },
];

// ─── Helpers ────────────────────────────────────────────────────
function stripMarkdownFences(raw: string): string {
  let cleaned = raw.trim();
  const fenceMatch = cleaned.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  if (fenceMatch) cleaned = fenceMatch[1].trim();
  return cleaned;
}

// ─── Main ───────────────────────────────────────────────────────
async function main() {
  const apiKey = process.env.ALIBABA_MODEL_STUDIO_API_KEY;
  const baseURL = process.env.ALIBABA_MODEL_STUDIO_BASE_URL;
  const model = process.env.ALIBABA_MODEL_NAME || 'qwen3.7-plus';

  if (!apiKey || !baseURL) {
    console.error('ERROR: ALIBABA_MODEL_STUDIO_API_KEY or ALIBABA_MODEL_STUDIO_BASE_URL not set');
    process.exit(1);
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Milestone 6 — Live Alibaba Model Studio Validation');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Model:    ${model}`);
  console.log(`  Endpoint: [redacted — workspace MaaS]`);
  console.log(`  API Key:  [redacted — ${apiKey.length} chars]`);
  console.log(`  Tests:    ${testCases.length}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  const client = new OpenAI({ apiKey, baseURL });

  let passed = 0;
  let failed = 0;
  const failures: string[] = [];

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    console.log(`── Test ${i + 1}: ${tc.name} ──`);

    const userMessage = buildAnalysisUserMessage(tc.input);
    const startTime = Date.now();

    try {
      const response = await client.chat.completions.create(
        {
          model,
          messages: [
            { role: 'system', content: EMERGENCY_ANALYSIS_SYSTEM_PROMPT },
            { role: 'user', content: userMessage },
          ],
          temperature: 0.3,
          max_tokens: 2000,
          response_format: { type: 'json_object' },
        },
        { timeout: 60_000 }
      );

      const elapsed = Date.now() - startTime;
      const raw = response.choices[0]?.message?.content || '';
      const finishReason = response.choices[0]?.finish_reason;

      console.log(`  Model: ${response.model} | Finish: ${finishReason} | Time: ${elapsed}ms`);

      // Parse JSON
      const cleaned = stripMarkdownFences(raw);
      let parsed: unknown;
      try {
        parsed = JSON.parse(cleaned);
      } catch (e) {
        console.log(`  ✗ JSON parse failed`);
        console.log(`  Raw (first 500): ${raw.substring(0, 500)}`);
        failed++;
        failures.push(`Test ${i + 1}: JSON parse failed`);
        continue;
      }

      // Validate with production Zod schema
      const result = aiAnalysisResponseSchema.safeParse(parsed);
      if (!result.success) {
        console.log(`  ✗ Zod validation failed`);
        console.log(`  Issues: ${JSON.stringify(result.error.issues).substring(0, 500)}`);
        console.log(`  Raw keys: ${Object.keys(parsed as object).join(', ')}`);
        // Print actual values for problematic fields
        const p = parsed as Record<string, unknown>;
        if (p.detectedLanguage) console.log(`  detectedLanguage value: "${p.detectedLanguage}"`);
        if (p.potentiallyCritical !== undefined) console.log(`  potentiallyCritical value: ${p.potentiallyCritical} (${typeof p.potentiallyCritical})`);
        else console.log(`  potentiallyCritical: MISSING`);
        if (p.confidence !== undefined) console.log(`  confidence value: ${p.confidence} (${typeof p.confidence})`);
        else console.log(`  confidence: MISSING`);
        failed++;
        failures.push(`Test ${i + 1}: Zod validation failed`);
        continue;
      }

      const data = result.data;
      console.log(`  Language: ${data.detectedLanguage}`);
      console.log(`  Urgency:  ${data.urgency}`);
      console.log(`  Categories: ${data.categories.join(', ')}`);
      console.log(`  Critical: ${data.potentiallyCritical} | Confidence: ${data.confidence}`);
      console.log(`  People:   ${data.peopleAffected}`);
      console.log(`  Summary:  ${data.summary.substring(0, 120)}${data.summary.length > 120 ? '...' : ''}`);
      if (data.followUpQuestion) {
        console.log(`  Follow-up: "${data.followUpQuestion}"`);
      }
      if (data.keyNeeds.length > 0) {
        console.log(`  Key needs: ${data.keyNeeds.join('; ')}`);
      }
      if (data.missingInformation.length > 0) {
        console.log(`  Missing:   ${data.missingInformation.join('; ')}`);
      }

      // Behavioral assertions
      let testPassed = true;

      // Language check
      if (data.detectedLanguage !== tc.expect.language) {
        console.log(`  ✗ Expected language ${tc.expect.language}, got ${data.detectedLanguage}`);
        testPassed = false;
      }

      // Urgency check
      if (!tc.expect.urgencies.includes(data.urgency)) {
        console.log(`  ✗ Expected urgency in [${tc.expect.urgencies.join(', ')}], got ${data.urgency}`);
        testPassed = false;
      }

      // Category overlap check
      const categoryOverlap = data.categories.some((c) => tc.expect.categories.includes(c));
      if (!categoryOverlap) {
        console.log(`  ✗ No expected categories [${tc.expect.categories.join(', ')}] found in [${data.categories.join(', ')}]`);
        testPassed = false;
      }

      // Follow-up question check
      if (tc.expect.hasFollowUp && (!data.followUpQuestion || data.followUpQuestion.length < 5)) {
        console.log(`  ✗ Expected follow-up question but none/empty generated`);
        testPassed = false;
      }
      if (!tc.expect.hasFollowUp && data.followUpQuestion && data.followUpQuestion.length > 5) {
        console.log(`  ~ Unexpected follow-up (soft): "${data.followUpQuestion}"`);
      }

      // People affected
      if (data.peopleAffected !== null && data.peopleAffected < tc.expect.peopleAffectedMin) {
        console.log(`  ✗ Expected peopleAffected >= ${tc.expect.peopleAffectedMin}, got ${data.peopleAffected}`);
        testPassed = false;
      }

      // Reasoning not empty
      if (!data.reasoning || data.reasoning.length < 5) {
        console.log(`  ✗ Reasoning too short or empty`);
        testPassed = false;
      }

      if (testPassed) {
        console.log(`  ✓ PASSED`);
        passed++;
      } else {
        failed++;
        failures.push(`Test ${i + 1}: behavioral assertion failed`);
      }
    } catch (err) {
      const elapsed = Date.now() - startTime;
      const msg = err instanceof Error ? err.message.substring(0, 200) : String(err);
      console.log(`  ✗ API call failed (${elapsed}ms): ${msg}`);
      failed++;
      failures.push(`Test ${i + 1}: API error — ${msg.substring(0, 100)}`);
    }

    console.log('');
  }

  // ─── Summary ──────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Total: ${passed + failed}  |  Passed: ${passed}  |  Failed: ${failed}`);
  if (failures.length > 0) {
    console.log('\n  Failed tests:');
    failures.forEach((f) => console.log(`    - ${f}`));
  }
  console.log('═══════════════════════════════════════════════════════════════\n');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
