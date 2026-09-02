/**
 * Check audio file format by examining file headers.
 * Verifies Twilio <Play> compatibility.
 */
import fs from 'fs';
import path from 'path';

const AUDIO_DIR = path.join(process.cwd(), '.audio-cache');

function checkAudioFile(filename: string): void {
  const filePath = path.join(AUDIO_DIR, filename);
  if (!fs.existsSync(filePath)) {
    console.log(`[MISSING] ${filename}`);
    return;
  }

  const buffer = fs.readFileSync(filePath);
  const size = buffer.length;

  // Check WAV header (RIFF....WAVE)
  const isWav = buffer.slice(0, 4).toString('ascii') === 'RIFF' &&
                buffer.slice(8, 12).toString('ascii') === 'WAVE';

  // Check MP3 header (ID3 tag or sync word)
  const isMp3 = buffer.slice(0, 3).toString('ascii') === 'ID3' ||
                (buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0);

  let format = 'UNKNOWN';
  let details = '';

  if (isWav) {
    format = 'WAV';
    // Parse WAV header for codec info
    const audioFormat = buffer.readUInt16LE(20);
    const channels = buffer.readUInt16LE(22);
    const sampleRate = buffer.readUInt32LE(24);
    const bitsPerSample = buffer.readUInt16LE(34);

    const formatNames: Record<number, string> = {
      1: 'PCM', 3: 'IEEE Float', 6: 'A-law', 7: 'μ-law', 0x55: 'MP3', 0xFFFE: 'Extensible'
    };
    const formatName = formatNames[audioFormat] || `Unknown(0x${audioFormat.toString(16)})`;

    details = `codec=${formatName} ch=${channels} rate=${sampleRate}Hz bits=${bitsPerSample}`;

    // Twilio compatibility check
    const isTwilioCompat = audioFormat === 1 && (sampleRate === 8000 || sampleRate === 16000 || sampleRate === 24000) && bitsPerSample === 16;
    if (!isTwilioCompat) {
      details += ' ⚠️ May need conversion for Twilio (expects PCM 8/16/24kHz 16-bit mono)';
    } else {
      details += ' ✅ Twilio compatible';
    }
  } else if (isMp3) {
    format = 'MP3';
    details = '✅ Twilio compatible';
  } else {
    // Show first 16 bytes for debugging
    const hex = Array.from(buffer.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' ');
    details = `Unknown format. First 16 bytes: ${hex}`;
  }

  console.log(`${filename}: ${size} bytes [${format}] ${details}`);
}

// Check all files
const files = fs.readdirSync(AUDIO_DIR).filter(f => f.endsWith('.wav') || f.endsWith('.mp3'));
console.log('=== Audio Format Verification ===\n');
for (const file of files) {
  checkAudioFile(file);
}
