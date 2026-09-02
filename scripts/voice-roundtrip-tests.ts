/**
 * Milestone 9 v2 — Round-trip ASR/TTS test.
 *
 * Uses TTS to generate speech audio for English, Urdu, Roman Urdu, and mixed.
 * Then feeds that audio back to ASR to verify transcription quality.
 *
 * This proves whether the full voice pipeline works end-to-end.
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

// ─── Import services ────────────────────────────────────────

import { transcribeAudio } from '../src/lib/voice/alibabaAsr';
import { synthesizeSpeech } from '../src/lib/voice/alibabaTts';

// ─── Test Harness ───────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++;
    console.log('  ✓ ' + label);
  } else {
    failed++;
    console.error('  ✗ ' + label);
  }
}

function section(name: string) {
  console.log('\n══════ ' + name + ' ══════');
}

// ─── Test Cases ─────────────────────────────────────────────

const testCases = [
  {
    name: 'A. English Emergency',
    text: 'My mother is unconscious. We are near Gulshan Block 7.',
    language: 'en' as const,
    expectedKeywords: ['mother', 'unconscious'],
  },
  {
    name: 'B. Urdu Emergency',
    text: 'یہ صرف ایک ٹیسٹ ہے، میری والدہ بے ہوش ہیں۔',
    language: 'ur' as const,
    expectedKeywords: ['ٹیسٹ', 'والدہ', 'بے ہوش'],
  },
  {
    name: 'C. Urdu Location',
    text: 'ہم گلشن بلاک سات میں ہیں اور ہمیں ایمبولینس چاہیے۔',
    language: 'ur' as const,
    expectedKeywords: ['گلشن', 'بلاک', 'ایمبولینس'],
  },
  {
    name: 'D. Roman Urdu Emergency',
    text: 'Ye sirf test hai, meri walida behosh hain aur ambulance chahiye.',
    language: 'en' as const, // Roman Urdu uses Latin script
    expectedKeywords: ['test', 'walida', 'behosh', 'ambulance'],
  },
  {
    name: 'E. Mixed Urdu/English',
    text: 'Ye test call hai, meri mother behosh hain and ambulance urgently chahiye.',
    language: 'en' as const, // Mixed uses Latin script
    expectedKeywords: ['test', 'mother', 'behosh', 'ambulance'],
  },
  {
    name: 'F. Urdu Greeting',
    text: 'یہ خدمت کنیکٹ اے آئی ایمرجنسی اسسٹنٹ ہے۔',
    language: 'ur' as const,
    expectedKeywords: ['خدمت', 'کنیکٹ', 'ایمرجنسی'],
  },
  {
    name: 'G. Urdu Confirmation',
    text: 'آپ کی درخواست محفوظ ہو گئی ہے۔ براہِ کرم اپنی لوکیشن بتائیں۔',
    language: 'ur' as const,
    expectedKeywords: ['درخواست', 'محفوظ'],
  },
];

async function run() {
  console.log('══════════════════════════════════════════════════');
  console.log('Milestone 9 v2 — Round-Trip ASR/TTS Test');
  console.log('══════════════════════════════════════════════════');

  for (const tc of testCases) {
    section(tc.name);
    console.log('  Original: "' + tc.text.substring(0, 80) + (tc.text.length > 80 ? '...' : '') + '"');

    // Step 1: Generate speech with TTS
    const ttsStart = Date.now();
    const ttsResult = await synthesizeSpeech(tc.text, tc.language);
    const ttsLatency = Date.now() - ttsStart;

    if (!ttsResult.success || !ttsResult.audioBuffer) {
      console.log('  [TTS failed: ' + ttsResult.error + ']');
      assert(false, 'TTS succeeded for ' + tc.name);
      continue;
    }

    console.log('  [TTS: ' + ttsLatency + 'ms, ' + ttsResult.audioBuffer.length + ' bytes]');
    assert(true, 'TTS produced audio for ' + tc.name);

    // Step 2: Feed audio back to ASR
    const asrStart = Date.now();
    const asrResult = await transcribeAudio(ttsResult.audioBuffer, 'audio/wav');
    const asrLatency = Date.now() - asrStart;

    console.log('  [ASR: ' + asrLatency + 'ms, success=' + asrResult.success + ']');

    if (asrResult.success && asrResult.transcript) {
      console.log('  [Transcript: "' + asrResult.transcript.substring(0, 120) + '"]');
      console.log('  [Detected language: ' + asrResult.language + ']');

      // Check if emergency meaning survives
      let keywordsFound = 0;
      for (const kw of tc.expectedKeywords) {
        if (asrResult.transcript.toLowerCase().includes(kw.toLowerCase())) {
          keywordsFound++;
        }
      }
      const keywordRatio = keywordsFound / tc.expectedKeywords.length;
      console.log('  [Keywords: ' + keywordsFound + '/' + tc.expectedKeywords.length + ' found (' + Math.round(keywordRatio * 100) + '%)]');

      assert(keywordRatio >= 0.3, 'Emergency meaning preserved (>=30% keywords) for ' + tc.name);

      // Total round-trip latency
      const totalLatency = ttsLatency + asrLatency;
      console.log('  [Total round-trip: ' + totalLatency + 'ms]');
    } else {
      console.log('  [ASR error: ' + (asrResult.error || 'unknown') + ']');
      // TTS-synthesized speech should be recognizable by ASR
      assert(false, 'ASR recognized TTS audio for ' + tc.name);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════

  console.log('\n══════════════════════════════════════════════════');
  console.log('Round-Trip Tests: ' + passed + ' passed, ' + failed + ' failed, ' + (passed + failed) + ' total');
  console.log('══════════════════════════════════════════════════');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal: ' + (err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
