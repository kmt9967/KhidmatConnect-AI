/**
 * Milestone 9 v2 — TTS audio output + fast model discovery.
 *
 * Part 1: Generate and save TTS audio for listening evaluation.
 * Part 2: Test fast Qwen Flash models for conversational turns.
 */

import * as fs from 'fs';
import * as path from 'path';

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.substring(0, eqIdx);
    let val = trimmed.substring(eqIdx + 1);
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

import { synthesizeSpeech } from '../src/lib/voice/alibabaTts';

// ─── Part 1: TTS Audio Generation ───────────────────────────

async function generateTtsSamples() {
  console.log('══════════════════════════════════════════════════');
  console.log('Part 1: TTS Audio Samples for Listening Evaluation');
  console.log('══════════════════════════════════════════════════');

  const outputDir = path.resolve(process.cwd(), 'scripts/tts-samples');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const samples = [
    { name: '01-english-greeting', text: 'This is KhidmatConnect AI Emergency Assistant.', lang: 'en' as const },
    { name: '02-urdu-greeting', text: 'یہ خدمت کنیکٹ اے آئی ایمرجنسی اسسٹنٹ ہے۔', lang: 'ur' as const },
    { name: '03-urdu-followup', text: 'آپ کی درخواست محفوظ ہو گئی ہے۔ براہِ کرم اپنی لوکیشن بتائیں۔', lang: 'ur' as const },
    { name: '04-urdu-acknowledgement', text: 'جی، میں آپ کی معلومات محفوظ کر رہا ہوں۔', lang: 'ur' as const },
    { name: '05-mixed', text: 'آپ کی emergency request محفوظ ہو گئی ہے۔', lang: 'ur' as const },
    { name: '06-urdu-completion', text: 'آپ کی ہنگامی درخواست درج کر لی گئی ہے اور کوآرڈینیٹر کو بھیجی جا رہی ہے۔', lang: 'ur' as const },
    { name: '07-english-completion', text: 'Your emergency request has been recorded and sent for coordinator review. Please stay available on this number.', lang: 'en' as const },
    { name: '08-urdu-emergency', text: 'میری والدہ بے ہوش ہیں۔ ہم گلشن بلاک سات میں ہیں۔', lang: 'ur' as const },
  ];

  for (const sample of samples) {
    process.stdout.write(`Generating ${sample.name}... `);
    const result = await synthesizeSpeech(sample.text, sample.lang);

    if (result.success && result.audioBuffer) {
      const filePath = path.join(outputDir, `${sample.name}.wav`);
      fs.writeFileSync(filePath, result.audioBuffer);
      console.log(`OK (${result.latencyMs}ms, ${result.audioBuffer.length} bytes) → ${filePath}`);
    } else {
      console.log(`FAILED: ${result.error}`);
    }
  }

  console.log('\nAll samples saved to: ' + outputDir);
  console.log('Listen to these files to evaluate Urdu TTS quality.');
}

// ─── Part 2: Fast Model Discovery ───────────────────────────

async function testFastModels() {
  console.log('\n══════════════════════════════════════════════════');
  console.log('Part 2: Fast Qwen Model Discovery');
  console.log('══════════════════════════════════════════════════');

  const apiKey = process.env.ALIBABA_MODEL_STUDIO_API_KEY!;
  const baseUrl = process.env.ALIBABA_MODEL_STUDIO_BASE_URL!;

  const candidateModels = [
    'qwen-turbo',
    'qwen-turbo-latest',
    'qwen3-flash',
    'qwen3-flash-2025-09-08',
    'qwen3-235b-a22b',
    'qwen3-32b',
    'qwen3-30b-a3b',
    'qwen2.5-72b-instruct',
    'qwen-plus',
    'qwen-plus-latest',
    'qwen3.7-plus',  // our current full analysis model
  ];

  const testPrompt = `You are a phone emergency assistant. A caller says: "Meri walida behosh hain." 
Respond in one short sentence asking for their location. Keep it under 15 words.`;

  for (const model of candidateModels) {
    process.stdout.write(`Testing ${model}... `);

    const startTime = Date.now();
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: 'You are KhidmatConnect AI, a phone emergency assistant. Respond concisely.' },
            { role: 'user', content: testPrompt },
          ],
          max_tokens: 100,
          temperature: 0.3,
        }),
        signal: AbortSignal.timeout(15_000),
      });

      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        console.log(`NOT AVAILABLE (${response.status})`);
        continue;
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content || '(empty)';
      const usage = data?.usage;

      console.log(`OK (${latencyMs}ms)`);
      console.log(`  Response: "${content.substring(0, 120)}"`);
      if (usage) {
        console.log(`  Tokens: ${usage.total_tokens} (prompt: ${usage.prompt_tokens}, completion: ${usage.completion_tokens})`);
      }
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      console.log(`ERROR (${latencyMs}ms): ${(err as Error).message.substring(0, 80)}`);
    }
  }
}

// ─── Main ───────────────────────────────────────────────────

async function run() {
  await generateTtsSamples();
  await testFastModels();
}

run().catch((err) => {
  console.error('Fatal: ' + (err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
