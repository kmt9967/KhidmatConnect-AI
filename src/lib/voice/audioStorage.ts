/**
 * Disk-based audio storage for Twilio playback.
 * 
 * Replaces the in-memory audioCache which doesn't survive across
 * Next.js dev server worker processes. Audio files are written to
 * disk so any process can serve them.
 */

import fs from 'fs';
import path from 'path';

/**
 * Storage location is configurable so production can point at a persistent
 * data directory (e.g. VOICE_AUDIO_DIR=/var/lib/khidmatconnect/audio)
 * instead of relying on the app working directory. Falls back to
 * .audio-cache under cwd for local development.
 */
const AUDIO_DIR =
  process.env.VOICE_AUDIO_DIR || path.join(process.cwd(), '.audio-cache');

// Ensure directory exists on module load. Failure here must NOT crash the
// whole app (voice is secondary); store/read operations will surface their
// own errors if the directory is unusable.
try {
  if (!fs.existsSync(AUDIO_DIR)) {
    fs.mkdirSync(AUDIO_DIR, { recursive: true });
  }
} catch (err) {
  console.error('[audioStorage] Unable to create audio dir — voice playback may fail:', err);
}

/**
 * Store audio buffer to disk.
 * Returns the relative path (from project root) for DB storage.
 */
export function storeAudioToDisk(sessionId: string, buffer: Buffer, format: string): string {
  const filename = `${sessionId}.${format === 'mp3' ? 'mp3' : 'wav'}`;
  const filePath = path.join(AUDIO_DIR, filename);
  fs.writeFileSync(filePath, buffer);

  // Clean old files (older than 10 minutes)
  cleanOldAudioFiles();

  return filename;
}

/**
 * Retrieve audio buffer from disk.
 * Returns null if not found or expired.
 * Pre-generated files (greeting_*, acknowledgement_*) never expire.
 */
export function getAudioFromDisk(filename: string): { buffer: Buffer; format: string } | null {
  const filePath = path.join(AUDIO_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  // Check file age — but pre-generated files never expire
  const isPreGenerated = filename.startsWith('greeting_') || filename.startsWith('acknowledgement_');
  if (!isPreGenerated) {
    const stats = fs.statSync(filePath);
    const ageMs = Date.now() - stats.mtimeMs;
    if (ageMs > 10 * 60 * 1000) {
      fs.unlinkSync(filePath);
      return null;
    }
  }

  const buffer = fs.readFileSync(filePath);
  const format = filename.endsWith('.mp3') ? 'mp3' : 'wav';
  return { buffer, format };
}

/**
 * Get the absolute path for a stored audio file.
 */
export function getAudioFilePath(filename: string): string | null {
  const filePath = path.join(AUDIO_DIR, filename);
  if (fs.existsSync(filePath)) {
    return filePath;
  }
  return null;
}

/**
 * Clean audio files older than 10 minutes.
 */
function cleanOldAudioFiles(): void {
  try {
    const files = fs.readdirSync(AUDIO_DIR);
    const now = Date.now();

    for (const file of files) {
      const filePath = path.join(AUDIO_DIR, file);
      const stats = fs.statSync(filePath);
      if (now - stats.mtimeMs > 10 * 60 * 1000) {
        fs.unlinkSync(filePath);
      }
    }
  } catch {
    // Ignore cleanup errors
  }
}
