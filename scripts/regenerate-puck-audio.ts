/**
 * Regenerate fixed audio files (greeting + acknowledgement) with Google Puck.
 * Saves to .audio-cache/ for the voice pipeline.
 */
import fs from 'fs';
import path from 'path';

// Load .env.local
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
const AUDIO_DIR = path.join(process.cwd(), '.audio-cache');

const GREETING_UR = 'السلام علیکم، یہ خدمت کنیکٹ اے آئی ایمرجنسی اسسٹنٹ ہے۔ براہِ کرم بتائیں کیا ایمرجنسی ہے؟';
const ACK_UR = 'جی، ایک لمحہ۔';

let cachedToken: string | null = null;
let tokenExpiry = 0;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry - 60000) return cachedToken;
  const adcPath = path.join(process.env.APPDATA || '', 'gcloud', 'application_default_credentials.json');
  if (!fs.existsSync(adcPath)) throw new Error('ADC not found');
  const creds = JSON.parse(fs.readFileSync(adcPath, 'utf8'));
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
  if (!response.ok) throw new Error('Token refresh failed: ' + response.status);
  const data = await response.json() as { access_token: string; expires_in: number };
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in * 1000);
  return cachedToken!;
}

function addWavHeader(pcmData: Buffer, sampleRate: number, channels: number, bitsPerSample: number): Buffer {
  const byteRate = sampleRate * channels * bitsPerSample / 8;
  const blockAlign = channels * bitsPerSample / 8;
  const dataSize = pcmData.length;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
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

async function synthesize(text: string, voiceName: string, langCode: string): Promise<Buffer> {
  const accessToken = await getAccessToken();
  const response = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + accessToken,
      'x-goog-user-project': PROJECT_ID,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: langCode, name: voiceName },
      audioConfig: { audioEncoding: 'LINEAR16', sampleRateHertz: 24000 },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error('HTTP ' + response.status + ': ' + err.substring(0, 300));
  }
  const data = await response.json() as { audioContent: string };
  const pcm = Buffer.from(data.audioContent, 'base64');
  return addWavHeader(pcm, 24000, 1, 16);
}

async function main() {
  console.log('=== Regenerate Fixed Audio with Google Puck ===\n');

  if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR, { recursive: true });

  try {
    await getAccessToken();
    console.log('✓ ADC auth OK\n');
  } catch (e) {
    console.error('✗ ADC failed:', e instanceof Error ? e.message : String(e));
    process.exit(1);
  }

  // Greeting Urdu
  console.log('Generating greeting_ur.wav (Puck, ur-IN)...');
  try {
    const greetingWav = await synthesize(GREETING_UR, 'ur-IN-Chirp3-HD-Puck', 'ur-IN');
    fs.writeFileSync(path.join(AUDIO_DIR, 'greeting_ur.wav'), greetingWav);
    console.log('✓ greeting_ur.wav: ' + greetingWav.length + ' bytes\n');
  } catch (e) {
    console.error('✗ greeting failed:', e instanceof Error ? e.message : String(e));
  }

  await new Promise(r => setTimeout(r, 500));

  // Acknowledgement Urdu
  console.log('Generating acknowledgement_ur.wav (Puck, ur-IN)...');
  try {
    const ackWav = await synthesize(ACK_UR, 'ur-IN-Chirp3-HD-Puck', 'ur-IN');
    fs.writeFileSync(path.join(AUDIO_DIR, 'acknowledgement_ur.wav'), ackWav);
    console.log('✓ acknowledgement_ur.wav: ' + ackWav.length + ' bytes\n');
  } catch (e) {
    console.error('✗ acknowledgement failed:', e instanceof Error ? e.message : String(e));
  }

  // Verify files
  console.log('=== Verification ===');
  for (const fn of ['greeting_ur.wav', 'acknowledgement_ur.wav']) {
    const fp = path.join(AUDIO_DIR, fn);
    if (fs.existsSync(fp)) {
      const buf = fs.readFileSync(fp);
      const isWav = buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WAVE';
      const sr = buf.readUInt32LE(24);
      const ch = buf.readUInt16LE(22);
      const bps = buf.readUInt16LE(34);
      console.log(fn + ': ' + buf.length + ' bytes, WAV=' + isWav + ', rate=' + sr + 'Hz, ch=' + ch + ', bits=' + bps);
    } else {
      console.log(fn + ': MISSING');
    }
  }

  console.log('\nDone.');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
