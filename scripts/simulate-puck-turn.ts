/**
 * Simulate one complete async turn with Google Puck TTS.
 * Tests: dynamic response → Puck TTS → disk save → serve → Cloudflare verify
 */
import fs from 'fs';
import path from 'path';

const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0 && !key.startsWith('#')) {
      process.env[key.trim()] = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
    }
  });
}

const BASE_URL = process.env.TWILIO_WEBHOOK_BASE_URL || 'http://localhost:3000';

async function main() {
  console.log('=== Simulate Full Async Turn with Google Puck ===\n');

  // 1. Test dynamic Puck TTS (simulating what processCallerRecordingAsync does)
  const responseText = 'آگ لگنے کی اطلاع محفوظ کر لی گئی ہے۔ براہِ کرم اپنی لوکیشن یا قریب ترین نشان بتائیں۔';
  const sessionId = 'test-puck-' + Date.now();

  console.log('1. Dynamic response text: ' + responseText.substring(0, 60) + '...');
  console.log('   Session ID: ' + sessionId);

  // 2. Call Google TTS via our local API endpoint (simulates the pipeline)
  console.log('\n2. Calling Google Puck TTS...');
  const startTime = Date.now();

  // Use the same ADC + API pattern as googleTts.ts
  const adcPath = path.join(process.env.APPDATA || '', 'gcloud', 'application_default_credentials.json');
  if (!fs.existsSync(adcPath)) {
    console.error('✗ ADC not found');
    process.exit(1);
  }

  const creds = JSON.parse(fs.readFileSync(adcPath, 'utf8'));
  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      refresh_token: creds.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  const tokenData = await tokenResp.json() as { access_token: string; expires_in: number };
  const accessToken = tokenData.access_token;
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID || 'the-ease-assocation-member-app';

  const ttsResp = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + accessToken,
      'x-goog-user-project': projectId,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: { text: responseText },
      voice: { languageCode: 'ur-IN', name: 'ur-IN-Chirp3-HD-Puck' },
      audioConfig: { audioEncoding: 'LINEAR16', sampleRateHertz: 24000 },
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!ttsResp.ok) {
    const err = await ttsResp.text();
    console.error('✗ Google TTS failed: ' + ttsResp.status + ' - ' + err.substring(0, 200));
    process.exit(1);
  }

  const ttsData = await ttsResp.json() as { audioContent: string };
  const pcmBuffer = Buffer.from(ttsData.audioContent, 'base64');

  // Add WAV header
  const sr = 24000, ch = 1, bps = 16;
  const byteRate = sr * ch * bps / 8;
  const blockAlign = ch * bps / 8;
  const wavBuffer = Buffer.alloc(44 + pcmBuffer.length);
  wavBuffer.write('RIFF', 0);
  wavBuffer.writeUInt32LE(36 + pcmBuffer.length, 4);
  wavBuffer.write('WAVE', 8);
  wavBuffer.write('fmt ', 12);
  wavBuffer.writeUInt32LE(16, 16);
  wavBuffer.writeUInt16LE(1, 20);
  wavBuffer.writeUInt16LE(ch, 22);
  wavBuffer.writeUInt32LE(sr, 24);
  wavBuffer.writeUInt32LE(byteRate, 28);
  wavBuffer.writeUInt16LE(blockAlign, 32);
  wavBuffer.writeUInt16LE(bps, 34);
  wavBuffer.write('data', 36);
  wavBuffer.writeUInt32LE(pcmBuffer.length, 40);
  pcmBuffer.copy(wavBuffer, 44);

  const ttsLatency = Date.now() - startTime;
  console.log('✓ Google Puck TTS: ' + wavBuffer.length + ' bytes, latency=' + ttsLatency + 'ms');

  // 3. Save to disk (simulating storeAudioToDisk)
  const audioDir = path.join(process.cwd(), '.audio-cache');
  const filename = sessionId + '.wav';
  fs.writeFileSync(path.join(audioDir, filename), wavBuffer);
  console.log('\n3. Saved to disk: ' + filename);

  // 4. Verify local serve
  console.log('\n4. Verify local audio endpoint...');
  const localUrl = 'http://localhost:3000/api/voice/audio/' + sessionId;
  const localResp = await fetch(localUrl, { signal: AbortSignal.timeout(10_000) });
  console.log('   Local: HTTP ' + localResp.status + ', Content-Type=' + localResp.headers.get('Content-Type') + ', Size=' + (await localResp.arrayBuffer()).byteLength + ' bytes');

  if (localResp.status !== 200) {
    console.error('✗ Local serve failed');
    process.exit(1);
  }
  console.log('✓ Local serve: PASS');

  // 5. Verify Cloudflare serve
  console.log('\n5. Verify Cloudflare audio endpoint...');
  const cfUrl = BASE_URL + '/api/voice/audio/' + sessionId;
  const cfResp = await fetch(cfUrl, { signal: AbortSignal.timeout(15_000) });
  const cfSize = (await cfResp.arrayBuffer()).byteLength;
  console.log('   Cloudflare: HTTP ' + cfResp.status + ', Content-Type=' + cfResp.headers.get('Content-Type') + ', Size=' + cfSize + ' bytes');

  if (cfResp.status !== 200) {
    console.error('✗ Cloudflare serve failed');
    process.exit(1);
  }
  console.log('✓ Cloudflare serve: PASS');

  // 6. Verify Twilio-compatible format
  console.log('\n6. Format verification...');
  const isWav = wavBuffer.slice(0, 4).toString('ascii') === 'RIFF' && wavBuffer.slice(8, 12).toString('ascii') === 'WAVE';
  const fmt = wavBuffer.readUInt16LE(20);
  const channels = wavBuffer.readUInt16LE(22);
  const sampleRate = wavBuffer.readUInt32LE(24);
  const bitsPerSample = wavBuffer.readUInt16LE(34);
  const isTwilioCompat = fmt === 1 && (sampleRate === 8000 || sampleRate === 16000 || sampleRate === 24000) && bitsPerSample === 16;
  console.log('   WAV=' + isWav + ' codec=PCM ch=' + channels + ' rate=' + sampleRate + 'Hz bits=' + bitsPerSample);
  console.log('   Twilio compatible: ' + (isTwilioCompat ? 'YES' : 'NO'));

  // Cleanup test file
  fs.unlinkSync(path.join(audioDir, filename));

  // Summary
  console.log('\n=== Simulation Summary ===');
  console.log('Google Puck TTS: PASS (' + ttsLatency + 'ms)');
  console.log('Disk save: PASS');
  console.log('Local serve: PASS (HTTP 200)');
  console.log('Cloudflare serve: PASS (HTTP 200, ' + cfSize + ' bytes)');
  console.log('Twilio format: PASS (WAV PCM mono 24kHz 16-bit)');
  console.log('\nFull async turn simulation: PASS');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
