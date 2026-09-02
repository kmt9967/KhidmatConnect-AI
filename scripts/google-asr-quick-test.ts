/**
 * Quick test: Generate TTS audio, then test Google ASR with real audio.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

import { SpeechClient } from '@google-cloud/speech';

async function testWithRealAudio() {
  console.log('══════════════════════════════════════════════════');
  console.log('Google ASR Test with Real TTS Audio');
  console.log('══════════════════════════════════════════════════\n');

  const projectId = 'the-ease-assocation-member-app';
  const location = 'asia-southeast1';
  const model = 'chirp_2';

  // Step 1: Generate TTS audio
  console.log('Step 1: Generating TTS audio...');
  const apiKey = process.env.ALIBABA_MODEL_STUDIO_API_KEY;
  if (!apiKey) {
    console.error('ALIBABA_MODEL_STUDIO_API_KEY not set');
    return;
  }

  const ttsResponse = await fetch('https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'qwen3-tts-flash',
      input: {
        messages: [{ role: 'user', content: [{ text: 'My father is unconscious and we need an ambulance.' }] }],
      },
      parameters: {
        voice: 'alloy',
        format: 'wav',
        sample_rate: 8000,
      },
    }),
  });

  const ttsData = await ttsResponse.json() as any;
  const audioBase64 = ttsData.output?.audio?.data;
  
  if (!audioBase64) {
    console.error('No audio in TTS response');
    console.log('Response:', JSON.stringify(ttsData, null, 2));
    return;
  }

  console.log('✓ TTS audio generated:', audioBase64.length, 'chars');
  console.log();

  // Step 2: Test Google ASR
  console.log('Step 2: Testing Google ASR with chirp_2...');
  const client = new SpeechClient({ projectId });

  try {
    const [result] = await client.recognize({
      recognizer: `projects/${projectId}/locations/${location}/recognizers/_`,
      config: {
        model: model,
        languageCodes: ['en-US'],
        features: {
          enableAutomaticPunctuation: true,
        },
      },
      audio: {
        content: audioBase64,
      },
    });

    console.log('✓ Google ASR succeeded!');
    console.log();
    console.log('Results:');
    const results = result.results || [];
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const alt = r.alternatives?.[0];
      if (alt) {
        console.log(`  [${i}] Transcript: "${alt.transcript}"`);
        console.log(`      Confidence: ${alt.confidence}`);
        console.log(`      Language: ${alt.languageCode}`);
      }
    }
  } catch (error) {
    console.error('✗ Google ASR failed:', error instanceof Error ? error.message : error);
  }
}

testWithRealAudio().catch(console.error);
