/**
 * Pre-generate greeting and acknowledgement audio files using Alibaba TTS.
 * 
 * These are fixed-text audio clips that don't need live AI generation.
 * Pre-generating gives: instant playback, consistent pronunciation, lower latency, lower cost.
 * 
 * Files are saved to .audio-cache/ directory for serving via /api/voice/audio/[sessionId].
 */

import path from 'path';
import fs from 'fs';

// Load .env.local manually (no dotenv dependency)
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const eqIdx = trimmed.indexOf('=');
      const key = trimmed.substring(0, eqIdx).trim();
      let value = trimmed.substring(eqIdx + 1).trim();
      // Remove surrounding quotes
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

const AUDIO_DIR = path.join(process.cwd(), '.audio-cache');

// Ensure directory exists
if (!fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
}

// ─── TTS API Call ───────────────────────────────────────────

async function callTtsApi(text: string, language: 'ur' | 'en', voice: string): Promise<Buffer | null> {
  const apiKey = process.env.ALIBABA_MODEL_STUDIO_API_KEY;
  if (!apiKey) {
    console.error('ALIBABA_MODEL_STUDIO_API_KEY not set');
    return null;
  }

  // Derive DashScope base from ALIBABA_MODEL_STUDIO_BASE_URL
  const compatUrl = process.env.ALIBABA_MODEL_STUDIO_BASE_URL || '';
  const dashScopeBase = compatUrl.replace('/compatible-mode/v1', '');
  if (!dashScopeBase) {
    console.error('ALIBABA_MODEL_STUDIO_BASE_URL not set');
    return null;
  }

  const model = process.env.ALIBABA_TTS_MODEL || 'qwen3-tts-flash';
  const languageType = language === 'ur' ? 'Auto' : 'English';

  const endpoint = `${dashScopeBase}/api/v1/services/aigc/multimodal-generation/generation`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: {
        text: text.substring(0, 1000),
        voice,
        language_type: languageType,
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`TTS API error ${response.status}: ${errorText.substring(0, 300)}`);
    return null;
  }

  const data = await response.json();
  const audioUrl = data?.output?.audio?.url;
  const audioData = data?.output?.audio?.data;

  if (audioUrl && typeof audioUrl === 'string' && audioUrl.length > 0) {
    const audioResponse = await fetch(audioUrl, { signal: AbortSignal.timeout(10_000) });
    if (audioResponse.ok) {
      const arrayBuffer = await audioResponse.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }
  } else if (audioData && typeof audioData === 'string' && audioData.length > 0) {
    return Buffer.from(audioData, 'base64');
  }

  return null;
}

// ─── Audio Generation ───────────────────────────────────────

async function generateAudioFile(
  filename: string,
  text: string,
  language: 'ur' | 'en',
  voice: string
): Promise<boolean> {
  const filePath = path.join(AUDIO_DIR, filename);

  // Skip if already exists and is recent
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    const ageMinutes = (Date.now() - stats.mtimeMs) / 60_000;
    if (ageMinutes < 60) {
      console.log(`[Skip] ${filename} already exists (${Math.round(ageMinutes)}min old)`);
      return true;
    }
  }

  console.log(`[Generate] ${filename}: "${text.substring(0, 60)}..." voice=${voice} lang=${language}`);
  const startTime = Date.now();

  const buffer = await callTtsApi(text, language, voice);
  if (!buffer || buffer.length < 100) {
    console.error(`[FAIL] ${filename}: TTS returned no audio`);
    return false;
  }

  fs.writeFileSync(filePath, buffer);
  const elapsed = Date.now() - startTime;
  console.log(`[OK] ${filename}: ${buffer.length} bytes in ${elapsed}ms`);
  return true;
}

// ─── Main ───────────────────────────────────────────────────

async function main() {
  console.log('=== Pre-generating voice audio files ===\n');

  // Available voices for qwen3-tts-flash:
  // Cherry (female), Ethan (male), Serena (female), Ethan (male)
  // We'll test a few voices for Urdu quality

  const voices = ['Cherry', 'Serena', 'Ethan'];
  const greetingUr = 'السلام علیکم، یہ خدمت کنیکٹ اے آئی ایمرجنسی اسسٹنٹ ہے۔ براہِ کرم بتائیں کیا ایمرجنسی ہے؟';
  const greetingEnShort = 'You can also speak in English.';
  const ackUr = 'جی، ایک لمحہ۔';

  // Generate acknowledgement (short — used while processing)
  console.log('--- Acknowledgement ---');
  await generateAudioFile('acknowledgement_ur.wav', ackUr, 'ur', 'Cherry');

  // Generate greeting with different voices for comparison
  console.log('\n--- Greeting (Urdu) — voice comparison ---');
  for (const voice of voices) {
    await generateAudioFile(`greeting_ur_${voice.toLowerCase()}.wav`, greetingUr, 'ur', voice);
  }

  // Generate English phrase
  console.log('\n--- Greeting (English) ---');
  for (const voice of voices) {
    await generateAudioFile(`greeting_en_${voice.toLowerCase()}.wav`, greetingEnShort, 'en', voice);
  }

  // Generate the default greeting (Cherry voice — our best choice)
  console.log('\n--- Default greeting files ---');
  await generateAudioFile('greeting_ur.wav', greetingUr, 'ur', 'Cherry');
  await generateAudioFile('greeting_en.wav', greetingEnShort, 'en', 'Cherry');

  console.log('\n=== Done! ===');
  console.log(`Audio files saved to: ${AUDIO_DIR}`);

  // List generated files
  const files = fs.readdirSync(AUDIO_DIR);
  console.log('\nGenerated files:');
  for (const file of files) {
    const stats = fs.statSync(path.join(AUDIO_DIR, file));
    console.log(`  ${file}: ${stats.size} bytes`);
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
