/**
 * Google Cloud TTS Voice Sample Generator
 * 
 * Generates Urdu voice samples using:
 * 1. Gemini-TTS (gemini-2.5-flash-tts) — ur-PK (Pakistani Urdu)
 * 2. Chirp 3 HD voices — ur-IN (Indian Urdu, for comparison)
 * 
 * Uses ADC authentication (same as Google ASR).
 * Saves samples to scripts/tts-comparison/google/ for human review.
 */

import fs from 'fs';
import path from 'path';

// Load .env.local manually
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

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT_ID || 'the-ease-assocation-member-app';
const OUTPUT_DIR = path.join(__dirname, 'tts-comparison', 'google');

const GREETING_TEXT = 'السلام علیکم، یہ خدمت کنیکٹ اے آئی ایمرجنسی اسسٹنٹ ہے۔ براہِ کرم بتائیں کیا ایمرجنسی ہے؟';
const RESPONSE_TEXT = 'جی، آگ لگنے کی اطلاع محفوظ کر لی گئی ہے۔ براہِ کرم اپنی لوکیشن یا قریب ترین نشان بتائیں۔';

const STYLE_PROMPT = 'Speak in calm, natural Pakistani Urdu. Professional emergency assistant tone. Clear telephone speech. Moderate pace. Reassuring but not emotional. No Hindi accent. No Arabic accent. No English accent unless English words occur naturally.';

const GEMINI_VOICES = ['Kore', 'Aoede', 'Charon', 'Puck'];

const CHIRP3_HD_VOICES = [
  { name: 'ur-IN-Chirp3-HD-Kore', label: 'Kore' },
  { name: 'ur-IN-Chirp3-HD-Charon', label: 'Charon' },
  { name: 'ur-IN-Chirp3-HD-Aoede', label: 'Aoede' },
  { name: 'ur-IN-Chirp3-HD-Puck', label: 'Puck' },
];

// ADC Token Management
let cachedToken: string | null = null;
let tokenExpiry = 0;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry - 60000) return cachedToken;

  const adcPath = path.join(process.env.APPDATA || '', 'gcloud', 'application_default_credentials.json');
  if (!fs.existsSync(adcPath)) {
    throw new Error('ADC credentials not found. Run: gcloud auth application-default login');
  }

  const creds = JSON.parse(fs.readFileSync(adcPath, 'utf8'));
  
  if (creds.type === 'authorized_user') {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: creds.client_id,
        client_secret: creds.client_secret,
        refresh_token: creds.refresh_token,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error('Token refresh failed: ' + response.status + ' - ' + errorText.substring(0, 200));
    }

    const data = await response.json() as { access_token: string; expires_in: number };
    cachedToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in * 1000);
    return cachedToken!;
  }

  throw new Error('Unsupported credential type: ' + creds.type);
}

// Gemini-TTS Synthesis
async function synthesizeGeminiTTS(
  voiceName: string,
  text: string,
  prompt: string,
  languageCode: string = 'ur-PK'
): Promise<{ success: boolean; audioBuffer: Buffer | null; error: string | null }> {
  const accessToken = await getAccessToken();
  
  const requestBody = {
    input: { prompt, text },
    voice: {
      languageCode,
      name: voiceName,
      modelName: 'gemini-2.5-flash-tts',
    },
    audioConfig: {
      audioEncoding: 'LINEAR16',
      sampleRateHertz: 24000,
    },
  };

  const response = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + accessToken,
      'x-goog-user-project': PROJECT_ID,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return { success: false, audioBuffer: null, error: 'HTTP ' + response.status + ': ' + errorText.substring(0, 300) };
  }

  const data = await response.json() as { audioContent: string };
  if (!data.audioContent) {
    return { success: false, audioBuffer: null, error: 'No audioContent in response' };
  }

  return { success: true, audioBuffer: Buffer.from(data.audioContent, 'base64'), error: null };
}

// Chirp 3 HD Synthesis
async function synthesizeChirp3HD(
  voiceName: string,
  text: string,
  languageCode: string = 'ur-IN'
): Promise<{ success: boolean; audioBuffer: Buffer | null; error: string | null }> {
  const accessToken = await getAccessToken();
  
  const requestBody = {
    input: { text },
    voice: { languageCode, name: voiceName },
    audioConfig: { audioEncoding: 'LINEAR16', sampleRateHertz: 24000 },
  };

  const response = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + accessToken,
      'x-goog-user-project': PROJECT_ID,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return { success: false, audioBuffer: null, error: 'HTTP ' + response.status + ': ' + errorText.substring(0, 300) };
  }

  const data = await response.json() as { audioContent: string };
  if (!data.audioContent) {
    return { success: false, audioBuffer: null, error: 'No audioContent in response' };
  }

  return { success: true, audioBuffer: Buffer.from(data.audioContent, 'base64'), error: null };
}

// LINEAR16 from Google is raw PCM — add WAV header for Twilio compatibility
function addWavHeader(pcmData: Buffer, sampleRate: number, channels: number, bitsPerSample: number): Buffer {
  const byteRate = sampleRate * channels * bitsPerSample / 8;
  const blockAlign = channels * bitsPerSample / 8;
  const dataSize = pcmData.length;
  const headerSize = 44;
  
  const buffer = Buffer.alloc(headerSize + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  pcmData.copy(buffer, 44);
  
  return buffer;
}

async function main() {
  console.log('=== Google Cloud TTS Voice Sample Generator ===\n');
  console.log('Project:', PROJECT_ID);
  console.log('Output:', OUTPUT_DIR, '\n');

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Verify ADC
  try {
    const token = await getAccessToken();
    console.log('✓ ADC auth OK (token: ' + token.substring(0, 20) + '...)\n');
  } catch (error) {
    console.error('✗ ADC failed:', error instanceof Error ? error.message : String(error));
    console.error('Run: gcloud auth application-default login');
    process.exit(1);
  }

  const results: Array<{ provider: string; voice: string; type: string; filename: string; success: boolean; error?: string; size?: number }> = [];

  // Gemini-TTS samples
  console.log('--- Gemini-TTS (gemini-2.5-flash-tts) — ur-PK ---\n');

  for (const voice of GEMINI_VOICES) {
    console.log('Voice: ' + voice);

    // Greeting
    const gr = await synthesizeGeminiTTS(voice, GREETING_TEXT, STYLE_PROMPT);
    if (gr.success && gr.audioBuffer) {
      const fn = 'google-gemini-' + voice.toLowerCase() + '-greeting.wav';
      const wav = addWavHeader(gr.audioBuffer, 24000, 1, 16);
      fs.writeFileSync(path.join(OUTPUT_DIR, fn), wav);
      console.log('  ✓ greeting: ' + fn + ' (' + wav.length + ' bytes)');
      results.push({ provider: 'gemini-tts', voice, type: 'greeting', filename: fn, success: true, size: wav.length });
    } else {
      console.log('  ✗ greeting: ' + (gr.error || 'unknown'));
      results.push({ provider: 'gemini-tts', voice, type: 'greeting', filename: '', success: false, error: gr.error || 'unknown' });
    }

    await new Promise(r => setTimeout(r, 500));

    // Response
    const rr = await synthesizeGeminiTTS(voice, RESPONSE_TEXT, STYLE_PROMPT);
    if (rr.success && rr.audioBuffer) {
      const fn = 'google-gemini-' + voice.toLowerCase() + '-response.wav';
      const wav = addWavHeader(rr.audioBuffer, 24000, 1, 16);
      fs.writeFileSync(path.join(OUTPUT_DIR, fn), wav);
      console.log('  ✓ response: ' + fn + ' (' + wav.length + ' bytes)');
      results.push({ provider: 'gemini-tts', voice, type: 'response', filename: fn, success: true, size: wav.length });
    } else {
      console.log('  ✗ response: ' + (rr.error || 'unknown'));
      results.push({ provider: 'gemini-tts', voice, type: 'response', filename: '', success: false, error: rr.error || 'unknown' });
    }

    await new Promise(r => setTimeout(r, 1000));
  }

  // Chirp 3 HD samples
  console.log('\n--- Chirp 3 HD — ur-IN ---\n');

  for (const vc of CHIRP3_HD_VOICES) {
    console.log('Voice: ' + vc.name);

    const gr = await synthesizeChirp3HD(vc.name, GREETING_TEXT);
    if (gr.success && gr.audioBuffer) {
      const fn = 'google-chirp3hd-' + vc.label.toLowerCase() + '-greeting.wav';
      const wav = addWavHeader(gr.audioBuffer, 24000, 1, 16);
      fs.writeFileSync(path.join(OUTPUT_DIR, fn), wav);
      console.log('  ✓ greeting: ' + fn + ' (' + wav.length + ' bytes)');
      results.push({ provider: 'chirp3-hd', voice: vc.label, type: 'greeting', filename: fn, success: true, size: wav.length });
    } else {
      console.log('  ✗ greeting: ' + (gr.error || 'unknown'));
      results.push({ provider: 'chirp3-hd', voice: vc.label, type: 'greeting', filename: '', success: false, error: gr.error || 'unknown' });
    }

    await new Promise(r => setTimeout(r, 500));

    const rr = await synthesizeChirp3HD(vc.name, RESPONSE_TEXT);
    if (rr.success && rr.audioBuffer) {
      const fn = 'google-chirp3hd-' + vc.label.toLowerCase() + '-response.wav';
      const wav = addWavHeader(rr.audioBuffer, 24000, 1, 16);
      fs.writeFileSync(path.join(OUTPUT_DIR, fn), wav);
      console.log('  ✓ response: ' + fn + ' (' + wav.length + ' bytes)');
      results.push({ provider: 'chirp3-hd', voice: vc.label, type: 'response', filename: fn, success: true, size: wav.length });
    } else {
      console.log('  ✗ response: ' + (rr.error || 'unknown'));
      results.push({ provider: 'chirp3-hd', voice: vc.label, type: 'response', filename: '', success: false, error: rr.error || 'unknown' });
    }

    await new Promise(r => setTimeout(r, 1000));
  }

  // Summary
  console.log('\n=== Summary ===\n');
  const ok = results.filter(r => r.success);
  const fail = results.filter(r => !r.success);
  console.log('Generated: ' + ok.length + '/' + results.length + ' samples');
  if (fail.length > 0) {
    console.log('\nFailed:');
    fail.forEach(r => console.log('  - ' + r.provider + '/' + r.voice + '/' + r.type + ': ' + r.error));
  }
  console.log('\nFiles saved to: ' + OUTPUT_DIR);
  console.log('Open scripts/tts-comparison/compare.html in a browser to listen.');
}

main().catch(error => {
  console.error('Fatal:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
