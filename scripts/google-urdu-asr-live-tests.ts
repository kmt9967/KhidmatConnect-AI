/**
 * Google Cloud Speech-to-Text V2 — Urdu ASR Live Tests
 *
 * Tests Chirp 2 model with:
 * A. Urdu script emergency
 * B. Urdu script location
 * C. Roman Urdu emergency
 * D. Mixed Urdu/English
 * E. English emergency
 *
 * Uses TTS to generate test audio, then transcribes with Google ASR.
 * Evaluates emergency meaning preservation.
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

import { transcribeAudio, isAsrConfigured, normalizeTranscript } from '../src/lib/voice/googleAsr';
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
    name: 'A. Urdu Emergency',
    text: 'یہ صرف ایک ٹیسٹ ہے، میری والدہ بے ہوش ہیں۔',
    language: 'ur' as const,
    ttsLang: 'ur' as const,
    expectedKeywords: ['ٹیسٹ', 'والدہ', 'بے ہوش'],
    emergencyMeaning: 'mother unconscious',
  },
  {
    name: 'B. Urdu Location',
    text: 'ہم گلشن بلاک سات میں ہیں اور ہمیں ایمبولینس چاہیے۔',
    language: 'ur' as const,
    ttsLang: 'ur' as const,
    expectedKeywords: ['گلشن', 'بلاک', 'ایمبولینس'],
    emergencyMeaning: 'location Gulshan Block + ambulance needed',
  },
  {
    name: 'C. Roman Urdu Emergency',
    text: 'Ye sirf test hai, meri walida behosh hain aur ambulance chahiye.',
    language: 'en' as const,
    ttsLang: 'en' as const,
    expectedKeywords: ['test', 'walida', 'behosh', 'ambulance'],
    emergencyMeaning: 'test + mother unconscious + ambulance',
  },
  {
    name: 'D. Mixed Urdu/English',
    text: 'Ye test call hai, meri mother behosh hain and ambulance urgently chahiye.',
    language: 'en' as const,
    ttsLang: 'en' as const,
    expectedKeywords: ['test', 'mother', 'behosh', 'ambulance'],
    emergencyMeaning: 'test + mother unconscious + ambulance',
  },
  {
    name: 'E. English Emergency',
    text: 'My mother is unconscious. We are near Gulshan Block 7. Need an ambulance.',
    language: 'en' as const,
    ttsLang: 'en' as const,
    expectedKeywords: ['mother', 'unconscious', 'Gulshan', 'Block', 'ambulance'],
    emergencyMeaning: 'mother unconscious + location + ambulance',
  },
  {
    name: 'F. Urdu Greeting Response',
    text: 'یہ خدمت کنیکٹ اے آئی ایمرجنسی اسسٹنٹ ہے۔',
    language: 'ur' as const,
    ttsLang: 'ur' as const,
    expectedKeywords: ['خدمت', 'کنیکٹ', 'ایمرجنسی'],
    emergencyMeaning: 'KhidmatConnect AI emergency assistant',
  },
  {
    name: 'G. Urdu Short Emergency',
    text: 'میری امی بے ہوش ہیں۔',
    language: 'ur' as const,
    ttsLang: 'ur' as const,
    expectedKeywords: ['امی', 'بے ہوش'],
    emergencyMeaning: 'mother unconscious',
  },
];

// ─── Multi-language strategy tests ──────────────────────────

const languageStrategies = [
  {
    name: 'Default (ur-PK + en-US + en-IN + hi-IN)',
    hints: ['ur-PK', 'en-US', 'en-IN', 'hi-IN'],
  },
  {
    name: 'Urdu-only (ur-PK)',
    hints: ['ur-PK'],
  },
  {
    name: 'English-only (en-US)',
    hints: ['en-US'],
  },
  {
    name: 'Urdu + English only (ur-PK + en-US)',
    hints: ['ur-PK', 'en-US'],
  },
];

// ─── Main ───────────────────────────────────────────────────

async function run() {
  console.log('══════════════════════════════════════════════════');
  console.log('Google Cloud Speech-to-Text V2 — Urdu ASR Live Tests');
  console.log('══════════════════════════════════════════════════');
  console.log('Model: ' + (process.env.GOOGLE_SPEECH_MODEL || 'chirp_2'));
  console.log('Location: ' + (process.env.GOOGLE_SPEECH_LOCATION || 'asia-southeast1'));
  console.log('Configured: ' + isAsrConfigured());

  if (!isAsrConfigured()) {
    console.error('\nFATAL: Google ASR not configured. Set GOOGLE_SPEECH_API_KEY in .env.local');
    process.exit(1);
  }

  // ═══════════════════════════════════════════════════════════
  // Part 1: Standard tests with default language hints
  // ═══════════════════════════════════════════════════════════

  console.log('\n══════════════════════════════════════════════════');
  console.log('Part 1: Standard ASR Tests (default language hints)');
  console.log('══════════════════════════════════════════════════');

  const results: any[] = [];

  for (const tc of testCases) {
    section(tc.name);
    console.log('  Original: "' + tc.text.substring(0, 80) + (tc.text.length > 80 ? '...' : '') + '"');

    // Step 1: Generate speech with TTS
    const ttsStart = Date.now();
    const ttsResult = await synthesizeSpeech(tc.text, tc.ttsLang);
    const ttsLatency = Date.now() - ttsStart;

    if (!ttsResult.success || !ttsResult.audioBuffer) {
      console.log('  [TTS failed: ' + ttsResult.error + ']');
      assert(false, 'TTS succeeded for ' + tc.name);
      continue;
    }

    console.log('  [TTS: ' + ttsLatency + 'ms, ' + ttsResult.audioBuffer.length + ' bytes]');

    // Step 2: Transcribe with Google ASR
    const asrStart = Date.now();
    const asrResult = await transcribeAudio(ttsResult.audioBuffer, 'audio/wav');
    const asrLatency = Date.now() - asrStart;

    console.log('  [Google ASR: ' + asrLatency + 'ms, success=' + asrResult.success + ']');

    if (asrResult.success && asrResult.transcript) {
      const normalized = normalizeTranscript(asrResult.transcript);
      console.log('  [Transcript: "' + normalized.substring(0, 120) + '"]');
      console.log('  [Detected language: ' + asrResult.language + ']');
      console.log('  [Confidence: ' + (asrResult.confidence?.toFixed(3) || 'null') + ']');

      // Check keyword preservation
      let keywordsFound = 0;
      const foundKeywords: string[] = [];
      for (const kw of tc.expectedKeywords) {
        if (normalized.includes(kw)) {
          keywordsFound++;
          foundKeywords.push(kw);
        }
      }
      const keywordRatio = keywordsFound / tc.expectedKeywords.length;
      console.log('  [Keywords: ' + keywordsFound + '/' + tc.expectedKeywords.length + ' (' + Math.round(keywordRatio * 100) + '%) — found: ' + foundKeywords.join(', ') + ']');
      console.log('  [Emergency meaning: ' + tc.emergencyMeaning + ']');

      // Evaluate emergency meaning preservation
      const meaningPreserved = keywordRatio >= 0.3; // At least 30% keywords
      assert(meaningPreserved, 'Emergency meaning preserved (>=30% keywords) for ' + tc.name);
      assert(asrLatency < 10000, 'ASR latency < 10s (' + asrLatency + 'ms) for ' + tc.name);

      results.push({
        name: tc.name,
        language: tc.text.substring(0, 20),
        transcript: normalized.substring(0, 80),
        detectedLang: asrResult.language,
        confidence: asrResult.confidence?.toFixed(3),
        keywords: keywordsFound + '/' + tc.expectedKeywords.length,
        keywordPct: Math.round(keywordRatio * 100),
        latency: asrLatency,
        meaningPreserved,
      });
    } else {
      console.log('  [ASR error: ' + (asrResult.error || 'unknown') + ']');
      assert(false, 'ASR recognized audio for ' + tc.name);
      results.push({
        name: tc.name,
        language: tc.text.substring(0, 20),
        transcript: '(FAILED)',
        detectedLang: '-',
        confidence: '-',
        keywords: '0/' + tc.expectedKeywords.length,
        keywordPct: 0,
        latency: asrLatency,
        meaningPreserved: false,
      });
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Part 2: Language strategy comparison (Roman Urdu test)
  // ═══════════════════════════════════════════════════════════

  console.log('\n══════════════════════════════════════════════════');
  console.log('Part 2: Language Strategy Comparison (Roman Urdu)');
  console.log('══════════════════════════════════════════════════');

  const romanUrduText = 'Meri walida behosh hain, ambulance chahiye.';
  console.log('Test text: "' + romanUrduText + '"');

  // Generate TTS audio once
  const ttsResult = await synthesizeSpeech(romanUrduText, 'en');
  if (!ttsResult.success || !ttsResult.audioBuffer) {
    console.error('TTS failed for strategy comparison');
  } else {
    for (const strategy of languageStrategies) {
      process.stdout.write('  Strategy: ' + strategy.name + '... ');
      const start = Date.now();
      const result = await transcribeAudio(ttsResult.audioBuffer, 'audio/wav', {
        languageHints: strategy.hints,
      });
      const latency = Date.now() - start;

      if (result.success && result.transcript) {
        const keywords = ['walida', 'behosh', 'ambulance', 'test'];
        const found = keywords.filter(kw => result.transcript!.toLowerCase().includes(kw.toLowerCase())).length;
        console.log('OK (' + latency + 'ms)');
        console.log('    Transcript: "' + result.transcript.substring(0, 100) + '"');
        console.log('    Language: ' + result.language + ' | Confidence: ' + (result.confidence?.toFixed(3) || 'null') + ' | Keywords: ' + found + '/' + keywords.length);
      } else {
        console.log('FAILED (' + latency + 'ms): ' + (result.error || 'unknown'));
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Summary Table
  // ═══════════════════════════════════════════════════════════

  console.log('\n══════════════════════════════════════════════════');
  console.log('RESULTS TABLE');
  console.log('══════════════════════════════════════════════════');
  console.log('');
  console.log('TEST'.padEnd(25) + 'LANG'.padEnd(8) + 'TRANSCRIPT'.padEnd(40) + 'KEYWORDS'.padEnd(10) + 'LATENCY'.padEnd(10) + 'MEANING');
  console.log('-'.repeat(105));

  for (const r of results) {
    console.log(
      r.name.padEnd(25) +
      (r.detectedLang || '-').padEnd(8) +
      r.transcript.substring(0, 38).padEnd(40) +
      r.keywords.padEnd(10) +
      (r.latency + 'ms').padEnd(10) +
      (r.meaningPreserved ? '✓ YES' : '✗ NO')
    );
  }

  // ═══════════════════════════════════════════════════════════
  // Comparison with Alibaba ASR
  // ═══════════════════════════════════════════════════════════

  console.log('\n══════════════════════════════════════════════════');
  console.log('COMPARISON: Google Chirp 2 vs Alibaba qwen3-asr-flash');
  console.log('══════════════════════════════════════════════════');
  console.log('');
  console.log('Language       | Google Chirp 2          | Alibaba qwen3-asr-flash');
  console.log('---------------|-------------------------|------------------------');
  console.log('English        | ✓ Perfect (100%)        | ✓ Perfect (100%)');
  console.log('Urdu script    | [TESTING]               | ✗ FAILS (0%)');
  console.log('Roman Urdu     | [TESTING]               | ⚠️ Partial (50%)');
  console.log('Mixed Urdu/En  | [TESTING]               | ✗ FAILS (0%)');

  // ═══════════════════════════════════════════════════════════
  // Final Summary
  // ═══════════════════════════════════════════════════════════

  console.log('\n══════════════════════════════════════════════════');
  console.log('Google ASR Tests: ' + passed + ' passed, ' + failed + ' failed, ' + (passed + failed) + ' total');
  console.log('══════════════════════════════════════════════════');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal: ' + (err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
