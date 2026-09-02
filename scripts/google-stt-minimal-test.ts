/**
 * Minimal Google Speech-to-Text V2 test to debug configuration issues.
 */

import { SpeechClient } from '@google-cloud/speech';
import * as fs from 'fs';
import * as path from 'path';

async function testMinimal() {
  console.log('══════════════════════════════════════════════════');
  console.log('Minimal Google Speech-to-Text V2 Test');
  console.log('══════════════════════════════════════════════════\n');

  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID || 'the-ease-assocation-member-app';
  const location = process.env.GOOGLE_SPEECH_LOCATION || 'asia-southeast1';
  const model = process.env.GOOGLE_SPEECH_MODEL || 'chirp_2';

  console.log('Project ID:', projectId);
  console.log('Location:', location);
  console.log('Model:', model);
  console.log('Recognizer:', `projects/${projectId}/locations/${location}/recognizers/_`);
  console.log();

  // Initialize client
  const client = new SpeechClient({ projectId });
  console.log('✓ SpeechClient initialized\n');

  // Try to recognize a simple audio file
  // Use a test audio file if available, or create a minimal WAV
  const testAudioPath = path.join(__dirname, 'test-audio.wav');
  
  let audioBuffer: Buffer;
  if (fs.existsSync(testAudioPath)) {
    console.log('Using existing test audio:', testAudioPath);
    audioBuffer = fs.readFileSync(testAudioPath);
  } else {
    console.log('No test audio found, creating minimal WAV...');
    // Create a minimal silent WAV file (1 second, 8kHz, 16-bit, mono)
    const sampleRate = 8000;
    const duration = 1;
    const numSamples = sampleRate * duration;
    const buffer = Buffer.alloc(44 + numSamples * 2);
    
    // WAV header
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + numSamples * 2, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16); // chunk size
    buffer.writeUInt16LE(1, 20); // PCM format
    buffer.writeUInt16LE(1, 22); // mono
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * 2, 28); // byte rate
    buffer.writeUInt16LE(2, 32); // block align
    buffer.writeUInt16LE(16, 34); // bits per sample
    buffer.write('data', 36);
    buffer.writeUInt32LE(numSamples * 2, 40);
    
    audioBuffer = buffer;
    console.log('Created minimal WAV:', audioBuffer.length, 'bytes');
  }

  const audioContent = audioBuffer.toString('base64');
  console.log('Audio base64 length:', audioContent.length);
  console.log();

  // Test 1: Minimal config (no language codes)
  console.log('Test 1: Minimal config (no language codes)');
  try {
    const request = {
      recognizer: `projects/${projectId}/locations/${location}/recognizers/_`,
      config: {
        model: model,
        autoDecodingConfig: {},
      },
      audio: {
        content: audioContent,
      },
    };
    
    console.log('Request:', JSON.stringify({
      recognizer: request.recognizer,
      config: request.config,
      audioLength: request.audio.content.length,
    }, null, 2));
    
    const [response] = await client.recognize(request);
    console.log('✓ Success!');
    console.log('Response:', JSON.stringify(response, null, 2));
  } catch (error) {
    console.error('✗ Failed:', error instanceof Error ? error.message : error);
  }
  console.log();

  // Test 2: With language code
  console.log('Test 2: With language code (ur-PK)');
  try {
    const request = {
      recognizer: `projects/${projectId}/locations/${location}/recognizers/_`,
      config: {
        model: model,
        languageCodes: ['ur-PK'],
        autoDecodingConfig: {},
      },
      audio: {
        content: audioContent,
      },
    };
    
    const [response] = await client.recognize(request);
    console.log('✓ Success!');
    console.log('Response:', JSON.stringify(response, null, 2));
  } catch (error) {
    console.error('✗ Failed:', error instanceof Error ? error.message : error);
  }
  console.log();

  // Test 3: Try different model (latest_long)
  console.log('Test 3: Try different model (latest_long)');
  try {
    const request = {
      recognizer: `projects/${projectId}/locations/${location}/recognizers/_`,
      config: {
        model: 'latest_long',
        autoDecodingConfig: {},
      },
      audio: {
        content: audioContent,
      },
    };
    
    const [response] = await client.recognize(request);
    console.log('✓ Success!');
    console.log('Response:', JSON.stringify(response, null, 2));
  } catch (error) {
    console.error('✗ Failed:', error instanceof Error ? error.message : error);
  }
}

testMinimal().catch(console.error);
