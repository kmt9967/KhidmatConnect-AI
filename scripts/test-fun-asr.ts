/**
 * Quick test: fun-asr API format.
 * fun-asr may use a different endpoint or request format.
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

const apiKey = process.env.ALIBABA_MODEL_STUDIO_API_KEY!;
const baseUrl = process.env.ALIBABA_MODEL_STUDIO_BASE_URL!.replace('/compatible-mode/v1', '');

async function testFunAsr() {
  // Try different endpoints and formats for fun-asr
  const tests = [
    {
      name: 'fun-asr via multimodal endpoint',
      url: `${baseUrl}/api/v1/services/aigc/multimodal-generation/generation`,
      body: {
        model: 'fun-asr',
        input: {
          messages: [
            { role: 'user', content: [{ audio: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=' }] },
          ],
        },
      },
    },
    {
      name: 'fun-asr via audio/transcription',
      url: `${baseUrl}/api/v1/services/audio/asr/transcription`,
      body: {
        model: 'fun-asr',
        input: {
          audio: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=',
        },
      },
    },
    {
      name: 'fun-asr via speech-recognition',
      url: `${baseUrl}/api/v1/services/audio/speech-recognition`,
      body: {
        model: 'fun-asr',
        input: {
          audio: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=',
        },
      },
    },
    {
      name: 'fun-asr via compatible-mode /audio/transcriptions',
      url: `${process.env.ALIBABA_MODEL_STUDIO_BASE_URL}/audio/transcriptions`,
      body: null, // multipart — skip for now
    },
    {
      name: 'sensevoice-v1 via multimodal',
      url: `${baseUrl}/api/v1/services/aigc/multimodal-generation/generation`,
      body: {
        model: 'sensevoice-v1',
        input: {
          messages: [
            { role: 'user', content: [{ audio: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=' }] },
          ],
        },
      },
    },
    {
      name: 'paraformer-v2 via multimodal',
      url: `${baseUrl}/api/v1/services/aigc/multimodal-generation/generation`,
      body: {
        model: 'paraformer-v2',
        input: {
          messages: [
            { role: 'user', content: [{ audio: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=' }] },
          ],
        },
      },
    },
  ];

  for (const test of tests) {
    try {
      const response = await fetch(test.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'X-DashScope-SSE': 'disable',
        },
        body: JSON.stringify(test.body),
        signal: AbortSignal.timeout(5000),
      });

      const text = await response.text();
      console.log(`\n${test.name}:`);
      console.log(`  Status: ${response.status}`);
      console.log(`  Body: ${text.substring(0, 200)}`);
    } catch (err) {
      console.log(`\n${test.name}:`);
      console.log(`  Error: ${(err as Error).message}`);
    }
  }

  // Also try the OpenAI-compatible endpoint for ASR
  console.log('\n── OpenAI-compatible /audio/transcriptions ──');
  try {
    // Create a minimal WAV file
    const sampleRate = 16000;
    const numSamples = sampleRate; // 1 second
    const buffer = Buffer.alloc(44 + numSamples * 2);
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + numSamples * 2, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(1, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * 2, 28);
    buffer.writeUInt16LE(2, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(numSamples * 2, 40);

    const formData = new FormData();
    formData.append('file', new Blob([buffer], { type: 'audio/wav' }), 'test.wav');
    formData.append('model', 'qwen3-asr-flash');

    const response = await fetch(`${process.env.ALIBABA_MODEL_STUDIO_BASE_URL}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: formData,
      signal: AbortSignal.timeout(10_000),
    });

    console.log(`  Status: ${response.status}`);
    console.log(`  Body: ${(await response.text()).substring(0, 300)}`);
  } catch (err) {
    console.log(`  Error: ${(err as Error).message}`);
  }
}

testFunAsr().catch(console.error);
