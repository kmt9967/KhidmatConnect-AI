/**
 * Milestone 9 v2 — ASR model discovery.
 *
 * Tests which ASR models are callable in our Alibaba Model Studio workspace.
 * Tests specifically for Urdu recognition quality.
 */

import * as fs from 'fs';
import * as path from 'path';

// ─── Env Loader ─────────────────────────────────────────────

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

// ─── Import TTS to generate test audio ──────────────────────

import { synthesizeSpeech } from '../src/lib/voice/alibabaTts';

// ─── Configuration ──────────────────────────────────────────

const apiKey = process.env.ALIBABA_MODEL_STUDIO_API_KEY!;
const baseUrl = process.env.ALIBABA_MODEL_STUDIO_BASE_URL!.replace('/compatible-mode/v1', '');
const endpoint = `${baseUrl}/api/v1/services/aigc/multimodal-generation/generation`;

// Candidate ASR models to test
const candidateModels = [
  'qwen3-asr-flash',
  'qwen3-asr-flash-2025-09-08',
  'qwen3-asr-flash-realtime',
  'qwen2-asr',
  'qwen-asr-plus',
  'fun-asr',
  'fun-asr-realtime',
  'paraformer-realtime-v2',
  'paraformer-v2',
  'sensevoice-v1',
];

// ─── Test Function ──────────────────────────────────────────

async function testAsrModel(model: string, audioBuffer: Buffer, label: string): Promise<{
  model: string;
  exists: boolean;
  transcript: string | null;
  language: string | null;
  latencyMs: number;
  error: string | null;
}> {
  const startTime = Date.now();
  const audioBase64 = audioBuffer.toString('base64');
  const audioDataUri = `data:audio/wav;base64,${audioBase64}`;

  try {
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
              content: [{ audio: audioDataUri }],
            },
          ],
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });

    const latencyMs = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      return { model, exists: false, transcript: null, language: null, latencyMs, error: `HTTP ${response.status}: ${errorText.substring(0, 100)}` };
    }

    const data = await response.json();

    // Parse response
    let transcript: string | null = null;
    let language: string | null = null;

    const content = data?.output?.choices?.[0]?.message?.content;
    if (Array.isArray(content) && content.length > 0) {
      const firstText = content.find((item: any) => item.text)?.text;
      if (typeof firstText === 'string' && firstText.trim().length > 0) {
        transcript = firstText.trim();
      }
    }

    // Extract language from annotations
    const annotations = data?.output?.choices?.[0]?.message?.annotations;
    if (Array.isArray(annotations)) {
      const audioInfo = annotations.find((a: any) => a.type === 'audio_info');
      if (audioInfo?.language) {
        language = audioInfo.language;
      }
    }

    return { model, exists: true, transcript, language, latencyMs, error: null };
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    return { model, exists: false, transcript: null, language: null, latencyMs, error: err instanceof Error ? err.message : 'Unknown' };
  }
}

// ─── Main ───────────────────────────────────────────────────

async function run() {
  console.log('══════════════════════════════════════════════════');
  console.log('Milestone 9 v2 — ASR Model Discovery');
  console.log('══════════════════════════════════════════════════');
  console.log('Endpoint: ' + endpoint);
  console.log('Models to test: ' + candidateModels.length);

  // Generate test audio using TTS
  // Test 1: Roman Urdu (most likely to work for phone intake)
  console.log('\n── Generating test audio with TTS ──');

  const romanUrduText = 'Meri walida behosh hain, ambulance chahiye.';
  console.log('Roman Urdu text: "' + romanUrduText + '"');

  const ttsResult = await synthesizeSpeech(romanUrduText, 'en');
  if (!ttsResult.success || !ttsResult.audioBuffer) {
    console.error('FATAL: TTS failed — cannot generate test audio: ' + ttsResult.error);
    process.exit(1);
  }
  console.log('TTS generated ' + ttsResult.audioBuffer.length + ' bytes in ' + ttsResult.latencyMs + 'ms');

  // Test 2: Also generate English for comparison
  const englishText = 'My mother is unconscious, I need an ambulance.';
  console.log('English text: "' + englishText + '"');
  const ttsEnResult = await synthesizeSpeech(englishText, 'en');
  if (!ttsEnResult.success || !ttsEnResult.audioBuffer) {
    console.error('FATAL: English TTS failed');
    process.exit(1);
  }
  console.log('English TTS generated ' + ttsEnResult.audioBuffer.length + ' bytes');

  // Test 3: Urdu script
  const urduText = 'میری والدہ بے ہوش ہیں، ایمبولینس چاہیے۔';
  console.log('Urdu text: "' + urduText + '"');
  const ttsUrResult = await synthesizeSpeech(urduText, 'ur');
  if (!ttsUrResult.success || !ttsUrResult.audioBuffer) {
    console.error('FATAL: Urdu TTS failed');
    process.exit(1);
  }
  console.log('Urdu TTS generated ' + ttsUrResult.audioBuffer.length + ' bytes');

  // ═══════════════════════════════════════════════════════════
  // Test each ASR model
  // ═══════════════════════════════════════════════════════════

  console.log('\n══════════════════════════════════════════════════');
  console.log('Testing ASR models with Roman Urdu audio');
  console.log('══════════════════════════════════════════════════');

  const results: any[] = [];

  for (const model of candidateModels) {
    process.stdout.write('Testing ' + model + '... ');

    // Test with Roman Urdu audio
    const romanResult = await testAsrModel(model, ttsResult.audioBuffer!, 'Roman Urdu');

    if (!romanResult.exists) {
      console.log('NOT AVAILABLE (' + romanResult.error?.substring(0, 60) + ')');
      results.push({ model, available: false, error: romanResult.error });
      continue;
    }

    console.log('OK (' + romanResult.latencyMs + 'ms)');
    console.log('  Roman Urdu transcript: "' + (romanResult.transcript || '(empty)') + '"');
    console.log('  Detected language: ' + romanResult.language);

    // Test with English audio
    const enResult = await testAsrModel(model, ttsEnResult.audioBuffer!, 'English');
    console.log('  English transcript: "' + (enResult.transcript || '(empty)') + '"');
    console.log('  English language: ' + enResult.language);

    // Test with Urdu script audio
    const urResult = await testAsrModel(model, ttsUrResult.audioBuffer!, 'Urdu');
    console.log('  Urdu transcript: "' + (urResult.transcript || '(empty)') + '"');
    console.log('  Urdu language: ' + urResult.language);

    // Check keyword preservation for Roman Urdu
    const romanKeywords = ['walida', 'behosh', 'ambulance'];
    const romanFound = romanKeywords.filter(kw => (romanResult.transcript || '').toLowerCase().includes(kw.toLowerCase())).length;

    // Check keyword preservation for English
    const enKeywords = ['mother', 'unconscious', 'ambulance'];
    const enFound = enKeywords.filter(kw => (enResult.transcript || '').toLowerCase().includes(kw.toLowerCase())).length;

    results.push({
      model,
      available: true,
      romanTranscript: romanResult.transcript,
      romanLanguage: romanResult.language,
      romanKeywords: `${romanFound}/${romanKeywords.length}`,
      enTranscript: enResult.transcript,
      enLanguage: enResult.language,
      enKeywords: `${enFound}/${enKeywords.length}`,
      urTranscript: urResult.transcript,
      urLanguage: urResult.language,
      latencyMs: romanResult.latencyMs,
    });
  }

  // ═══════════════════════════════════════════════════════════
  // Summary Table
  // ═══════════════════════════════════════════════════════════

  console.log('\n══════════════════════════════════════════════════');
  console.log('ASR Model Comparison Table');
  console.log('══════════════════════════════════════════════════');

  const available = results.filter(r => r.available);
  const unavailable = results.filter(r => !r.available);

  console.log('\nAVAILABLE MODELS (' + available.length + '):');
  for (const r of available) {
    console.log('  ' + r.model);
    console.log('    Roman Urdu: "' + r.romanTranscript + '" [' + r.romanLanguage + '] keywords=' + r.romanKeywords);
    console.log('    English:    "' + r.enTranscript + '" [' + r.enLanguage + '] keywords=' + r.enKeywords);
    console.log('    Urdu:       "' + r.urTranscript + '" [' + r.urLanguage + ']');
    console.log('    Latency:    ' + r.latencyMs + 'ms');
  }

  console.log('\nUNAVAILABLE MODELS (' + unavailable.length + '):');
  for (const r of unavailable) {
    console.log('  ' + r.model + ' — ' + (r.error || '').substring(0, 80));
  }
}

run().catch((err) => {
  console.error('Fatal: ' + (err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
