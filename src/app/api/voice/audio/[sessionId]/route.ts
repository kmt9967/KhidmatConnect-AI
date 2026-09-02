import { NextRequest, NextResponse } from 'next/server';
import { getAudioFromDisk } from '@/lib/voice/audioStorage';

/**
 * GET /api/voice/audio/[sessionId]
 * Serves TTS audio for Twilio to play.
 * 
 * Audio is stored on disk by the orchestration layer.
 * The sessionId can be:
 *   - A voice session ID (looks up responseAudioPath from DB)
 *   - A direct filename (e.g., "greeting_ur.mp3")
 *   - A session ID with suffix (e.g., "{sessionId}_complete")
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;

    if (!sessionId) {
      return new NextResponse('Not found', { status: 404 });
    }

    // Try to find the audio file on disk
    // First, try direct filename match (for pre-generated files like greeting)
    let audio = getAudioFromDisk(sessionId + '.mp3') || getAudioFromDisk(sessionId + '.wav');

    // If not found, try looking up from DB (for session-based audio)
    if (!audio) {
      try {
        const { prisma } = await import('@/lib/db/prisma');
        const session = await prisma.voiceCallSession.findUnique({
          where: { id: sessionId },
          select: { responseAudioPath: true },
        });
        if (session?.responseAudioPath) {
          audio = getAudioFromDisk(session.responseAudioPath);
        }
      } catch {
        // DB lookup failed — continue with direct filename only
      }
    }

    if (!audio) {
      console.log('[Voice/Audio] NOT FOUND: sessionId=' + sessionId.substring(0, 30));
      return new NextResponse('Audio not found or expired', { status: 404 });
    }

    const contentType = audio.format === 'mp3' ? 'audio/mpeg' : 'audio/wav';
    console.log('[Voice/Audio] Serving: sessionId=' + sessionId.substring(0, 30) +
      ' format=' + audio.format + ' size=' + audio.buffer.length + ' contentType=' + contentType);

    return new NextResponse(new Uint8Array(audio.buffer), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': audio.buffer.length.toString(),
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Voice] Audio serve error: ' + msg.substring(0, 200));
    return new NextResponse('Internal error', { status: 500 });
  }
}
