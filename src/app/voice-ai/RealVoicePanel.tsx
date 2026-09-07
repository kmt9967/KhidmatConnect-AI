'use client';

/**
 * RealVoicePanel — M17 REAL browser voice emergency (Parts C / E / F).
 *
 * This is the PRIMARY /voice-ai experience. It places a REAL Retell browser
 * voice call using the official `retell-client-js-sdk` Web SDK. It reuses the
 * SAME production agent + webhooks + update_case custom function as PSTN, so a
 * browser call flows through the identical backend:
 *
 *   browser mic → Retell realtime agent
 *     → /api/voice/retell/update-case  (custom function)
 *     → /api/voice/retell/webhook      (call lifecycle)
 *     → EmergencyCase → async Alibaba Qwen → Human Operator
 *
 * SECURITY: the permanent RETELL_API_KEY is NEVER sent to the browser. We POST
 * /api/voice/retell/web-call, which mints a SHORT-LIVED access token server-side
 * and returns only { accessToken, callId }. The SDK is loaded with a dynamic
 * import so it stays out of the SSR bundle and only runs in the browser.
 *
 * HONESTY: this SDK version emits call_started / call_ended /
 * agent_start_talking / agent_stop_talking / error / call_ready — it does NOT
 * expose a live word-by-word transcript. So we do NOT fake one. Instead we poll
 * GET /api/voice/retell/web-call?callId= for the REAL case number, session
 * status, urgency, turn count and AI analysis status. The waveform is driven by
 * the SDK's real audio analyser (agent voice volume), not invented numbers.
 *
 * SAFETY: no dispatch wording, ever. A visible safe note states that AI only
 * supports a human coordinator. If the call cannot start, we show a non-blocking
 * fallback pointing to the emergency form and the hotline.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import type { RetellWebClient } from 'retell-client-js-sdk';
import {
  Mic, MicOff, PhoneOff, Radio, ShieldCheck, Clock, FileText, AlertTriangle,
  Loader2, Bot, Volume2, Activity, ChevronRight, Phone,
} from 'lucide-react';
import type { getTranslation } from '@/i18n/translations';

type Translation = ReturnType<typeof getTranslation>;

type RealCallPhase = 'idle' | 'connecting' | 'live' | 'ended' | 'error';
type RealVoiceState = 'listening' | 'speaking';

/** Mirrors WebCallStatus from src/lib/voice/retellWebCall.ts (server). */
interface WebCallStatus {
  found: boolean;
  caseCode: string | null;
  sessionStatus: string | null;
  caseStatus: string | null;
  urgency: string | null;
  analysisStatus: 'not_found' | 'pending' | 'analyzed' | 'needs_human_review';
  turnCount: number;
  humanReviewRequired: boolean;
}

interface Props {
  t: Translation;
  isUrdu: boolean;
}

const BAR_COUNT = 24;

export default function RealVoicePanel({ t, isUrdu }: Props) {
  const [phase, setPhase] = useState<RealCallPhase>('idle');
  const [voice, setVoice] = useState<RealVoiceState>('listening');
  const [muted, setMuted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [callId, setCallId] = useState<string | null>(null);
  const [status, setStatus] = useState<WebCallStatus | null>(null);
  const [volume, setVolume] = useState(0);

  // Refs (not state) so async SDK callbacks never read stale values.
  const clientRef = useRef<RetellWebClient | null>(null);
  const volRafRef = useRef<number | null>(null);
  const endedRef = useRef(false);

  const live = phase === 'live';
  const connecting = phase === 'connecting';
  const ended = phase === 'ended';
  const failed = phase === 'error';
  const busy = connecting || live;

  // ─── Elapsed timer (real, from call_started) ───────────────
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [live]);

  // ─── Poll the REAL backend for this call's case status ─────
  useEffect(() => {
    if (!callId) return;
    let cancelled = false;
    const url = `/api/voice/retell/web-call?callId=${encodeURIComponent(callId)}`;
    async function poll() {
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const data = (await res.json()) as WebCallStatus;
        if (!cancelled) setStatus(data);
      } catch {
        // Non-fatal: keep the last known status; the call still works.
      }
    }
    void poll();
    const id = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [callId]);

  // ─── Unmount cleanup: never leave a call or rAF running ────
  useEffect(() => {
    return () => {
      try {
        clientRef.current?.stopCall();
      } catch {
        /* already torn down */
      }
      if (volRafRef.current) cancelAnimationFrame(volRafRef.current);
      clientRef.current = null;
    };
  }, []);

  // Real waveform: read the SDK analyser (agent voice volume) at ~16fps.
  const startVolumeMeter = useCallback(() => {
    if (volRafRef.current) return;
    let last = 0;
    const loop = (ts: number) => {
      if (ts - last >= 60) {
        last = ts;
        const c = clientRef.current;
        if (c?.analyzerComponent) {
          try {
            setVolume(c.analyzerComponent.calculateVolume());
          } catch {
            /* analyser not ready yet */
          }
        }
      }
      volRafRef.current = requestAnimationFrame(loop);
    };
    volRafRef.current = requestAnimationFrame(loop);
  }, []);

  const stopVolumeMeter = useCallback(() => {
    if (volRafRef.current) {
      cancelAnimationFrame(volRafRef.current);
      volRafRef.current = null;
    }
    setVolume(0);
  }, []);

  const markEnded = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    setPhase((p) => (p === 'error' ? 'error' : 'ended'));
    stopVolumeMeter();
  }, [stopVolumeMeter]);

  // ─── START VOICE EMERGENCY ─────────────────────────────────
  const handleStart = useCallback(async () => {
    if (busy) return;
    endedRef.current = false;
    setPhase('connecting');
    setElapsed(0);
    setStatus(null);
    setCallId(null);
    setVoice('listening');
    setMuted(false);

    try {
      // 1) Server mints a SHORT-LIVED token; RETELL_API_KEY never reaches us.
      const res = await fetch('/api/voice/retell/web-call', { method: 'POST' });
      if (!res.ok) {
        // 503 unconfigured · 429 rate-limited · 502 upstream → safe fallback.
        endedRef.current = true;
        setPhase('error');
        return;
      }
      const data = (await res.json()) as { accessToken?: string; callId?: string };
      if (!data?.accessToken) {
        endedRef.current = true;
        setPhase('error');
        return;
      }
      setCallId(data.callId ?? null);

      // 2) Load the browser-only SDK on demand (kept out of the SSR bundle).
      const { RetellWebClient } = await import('retell-client-js-sdk');
      const client = new RetellWebClient();
      clientRef.current = client;

      // 3) Wire ONLY events this SDK version actually emits.
      client.on('call_started', () => {
        setPhase('live');
        setVoice('listening');
        startVolumeMeter();
      });
      client.on('call_ended', markEnded);
      client.on('agent_start_talking', () => setVoice('speaking'));
      client.on('agent_stop_talking', () => setVoice('listening'));
      client.on('error', () => {
        endedRef.current = true;
        setPhase('error');
        stopVolumeMeter();
      });

      // 4) Start the call. emitRawAudioSamples enables the real analyser used
      //    by the waveform meter above. A rejected/failed start surfaces via the
      //    SDK 'error' event (startCall resolves even on failure).
      await client.startCall({ accessToken: data.accessToken, emitRawAudioSamples: true });

      // 5) Satisfy the browser autoplay policy within the user-gesture task.
      try {
        await client.startAudioPlayback();
      } catch {
        // Autoplay may be blocked; the call still works and the agent audio
        // resumes on the next interaction. Non-fatal.
      }
    } catch {
      endedRef.current = true;
      setPhase('error');
      stopVolumeMeter();
    }
  }, [busy, markEnded, startVolumeMeter, stopVolumeMeter]);

  // ─── END CALL ──────────────────────────────────────────────
  const handleEnd = useCallback(() => {
    try {
      clientRef.current?.stopCall();
    } catch {
      /* ignore */
    }
    markEnded();
  }, [markEnded]);

  // ─── MUTE / UNMUTE (SDK-supported) ─────────────────────────
  const handleToggleMute = useCallback(() => {
    const c = clientRef.current;
    if (!c || !live) return;
    if (muted) {
      c.unmute();
      setMuted(false);
    } else {
      c.mute();
      setMuted(true);
    }
  }, [muted, live]);

  // ─── Reset back to idle so the citizen can try again ───────
  const handleReset = useCallback(() => {
    try {
      clientRef.current?.stopCall();
    } catch {
      /* ignore */
    }
    clientRef.current = null;
    endedRef.current = false;
    stopVolumeMeter();
    setPhase('idle');
    setVoice('listening');
    setMuted(false);
    setElapsed(0);
    setCallId(null);
    setStatus(null);
  }, [stopVolumeMeter]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // ─── Derived status copy ───────────────────────────────────
  const stateLabel = failed
    ? t.voiceCallDisconnected
    : ended
    ? t.voiceCallEnded
    : connecting
    ? t.voiceConnecting
    : live
    ? voice === 'speaking'
      ? t.voiceAiSpeaking
      : muted
      ? t.voiceMute
      : t.voiceListening
    : t.voiceStandby;

  const analysisLabel =
    status?.analysisStatus === 'analyzed'
      ? t.voiceAnalysisAnalyzed
      : status?.analysisStatus === 'needs_human_review'
      ? t.voiceAnalysisNeedsReview
      : status?.analysisStatus === 'pending'
      ? t.voiceAnalysisPending
      : t.voiceAnalysisNotFound;

  const urgency = status?.urgency?.toUpperCase() ?? null;

  // ─── Render ────────────────────────────────────────────────
  return (
    <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-5 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6">
      {/* ─── LEFT: Live browser call ─── */}
      <section className="lg:col-span-7 flex flex-col gap-4">
        <div className="p-5 sm:p-6 rounded-3xl bg-[#11161F] border border-[#30363D] shadow-xl space-y-5 relative overflow-hidden">
          <div
            className={`absolute -top-14 -right-14 w-40 h-40 rounded-full blur-3xl pointer-events-none transition-all duration-700 ${
              failed ? 'bg-red-600/15' : live && voice === 'speaking' ? 'bg-blue-600/20' : 'bg-emerald-600/20'
            }`}
          />

          {/* Title + state */}
          <div className="flex items-start justify-between gap-3 relative z-10">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  failed
                    ? 'bg-red-600/20 text-red-400 border border-red-500/30'
                    : live && voice === 'speaking'
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                    : 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
                }`}
              >
                {failed ? <PhoneOff className="w-4 h-4" /> : live && voice === 'speaking' ? <Volume2 className="w-4 h-4 animate-pulse" /> : <Mic className="w-4 h-4" />}
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-mono text-gray-400 uppercase tracking-wider block">{t.voiceBrowserTitle}</span>
                <div className="text-sm font-black text-white flex items-center gap-1.5">
                  {failed ? (
                    <span className="text-red-400">{stateLabel}</span>
                  ) : connecting ? (
                    <span className="text-amber-400 flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      {stateLabel}
                    </span>
                  ) : live ? (
                    <span className="text-emerald-400 flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${voice === 'speaking' ? 'bg-blue-400' : 'bg-emerald-400'} animate-ping`} />
                      {stateLabel}
                    </span>
                  ) : (
                    <span className="text-gray-300">{stateLabel}</span>
                  )}
                </div>
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className="text-[10px] font-mono text-gray-400 uppercase block">{t.voiceElapsed}</span>
              <span className="text-sm font-bold text-white font-mono" dir="ltr">{formatTime(elapsed)}</span>
            </div>
          </div>

          {/* Waveform — driven by the SDK's REAL audio analyser */}
          <div className="p-3.5 rounded-2xl bg-[#0B0E14] border border-[#30363D] flex items-center justify-between gap-2 h-20 relative">
            <div className="flex items-center gap-1.5 flex-1 justify-center h-full">
              {Array.from({ length: BAR_COUNT }).map((_, i) => {
                const shape = 0.5 + Math.sin(i * 0.7) * 0.5; // stable per-bar variance
                const h = live ? Math.max(5, Math.round(6 + volume * 58 * shape)) : 5;
                return (
                  <div
                    key={i}
                    style={{ height: `${h}px` }}
                    className={`w-1 rounded-full transition-all duration-100 ${
                      failed ? 'bg-red-800' : live && voice === 'speaking' ? 'bg-blue-400' : live ? 'bg-emerald-400' : 'bg-[#21262D]'
                    }`}
                  />
                );
              })}
            </div>
            <div className="text-[10px] font-mono text-gray-400 text-right shrink-0 border-l border-[#30363D] pl-3 flex flex-col items-end gap-1">
              <span className="flex items-center gap-1 text-gray-500">
                <Activity className="w-3 h-3" />
                {live && voice === 'speaking' ? t.voiceAiSpeaking : t.voiceRetellPowered}
              </span>
              {live && (
                <span className={`font-bold ${muted ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {muted ? t.voiceMute : t.voiceLiveBadge}
                </span>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-2.5 relative z-10">
            {!busy && !ended && !failed && (
              <button
                onClick={handleStart}
                className="flex-1 min-w-[200px] py-3.5 px-5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm tracking-wide shadow-xl shadow-emerald-900/40 active:scale-95 transition-all flex items-center justify-center gap-2 min-h-[52px]"
              >
                <Mic className="w-5 h-5" />
                <span>{t.voiceStartVoiceEmergency}</span>
              </button>
            )}
            {connecting && (
              <div className="flex-1 min-w-[200px] py-3.5 px-5 rounded-2xl bg-[#161B22] border border-[#30363D] text-gray-300 font-bold text-sm flex items-center justify-center gap-2 min-h-[52px]">
                <Loader2 className="w-5 h-5 animate-spin text-amber-400" />
                <span>{t.voiceStartingCall}</span>
              </div>
            )}
            {live && (
              <>
                <button
                  onClick={handleToggleMute}
                  className={`py-3.5 px-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 min-h-[52px] transition-colors border ${
                    muted
                      ? 'bg-amber-600/20 border-amber-500/40 text-amber-300 hover:bg-amber-600/30'
                      : 'bg-[#161B22] border-[#30363D] text-gray-200 hover:bg-[#21262D]'
                  }`}
                >
                  {muted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  <span>{muted ? t.voiceUnmute : t.voiceMute}</span>
                </button>
                <button
                  onClick={handleEnd}
                  className="flex-1 py-3.5 px-5 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-black text-sm shadow-xl shadow-red-900/40 active:scale-95 transition-all flex items-center justify-center gap-2 min-h-[52px]"
                >
                  <PhoneOff className="w-5 h-5" />
                  <span>{t.voiceEndCall}</span>
                </button>
              </>
            )}
            {(ended || failed) && (
              <button
                onClick={handleReset}
                className="flex-1 min-w-[200px] py-3.5 px-5 rounded-2xl bg-[#161B22] hover:bg-[#21262D] border border-[#30363D] text-gray-200 font-bold text-sm flex items-center justify-center gap-2 min-h-[52px] transition-colors"
              >
                <Phone className="w-5 h-5 text-emerald-400" />
                <span>{t.voiceStartVoiceEmergency}</span>
              </button>
            )}
          </div>

          {/* Idle guidance / permission note */}
          {!busy && !ended && !failed && (
            <div className="text-xs text-gray-300 bg-[#161B22] p-3 rounded-xl border border-[#30363D] space-y-1.5">
              <p className="leading-relaxed">{t.voiceStartPrompt}</p>
              <p className="text-[11px] text-gray-500 flex items-center gap-1.5">
                <Mic className="w-3.5 h-3.5" />
                {t.voiceMicPermission}
              </p>
            </div>
          )}

          {/* Failure fallback (Part F) — non-blocking, points to form + hotline */}
          {failed && (
            <div className="p-4 rounded-2xl bg-red-950/40 border-2 border-red-500/50 text-xs space-y-3">
              <div className="flex items-center gap-2 text-red-300 font-black text-sm">
                <AlertTriangle className="w-5 h-5" />
                <span>{t.voiceFallback}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/emergency"
                  className="py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-2 transition-colors"
                >
                  <FileText className="w-4 h-4" />
                  <span>{t.voiceUseForm}</span>
                </Link>
                <a
                  href="tel:1122"
                  className="py-2.5 px-4 rounded-xl bg-[#161B22] hover:bg-[#21262D] border border-[#30363D] text-gray-200 font-bold flex items-center gap-2 transition-colors"
                >
                  <Phone className="w-4 h-4 text-blue-400" />
                  <span dir="ltr">{t.voiceCallHotline}</span>
                </a>
              </div>
            </div>
          )}

          {/* Safe note (Part F) — always visible in real mode */}
          <div className="flex items-start gap-2 text-[11px] text-emerald-300/90 bg-emerald-950/20 border border-emerald-500/25 p-2.5 rounded-xl">
            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
            <span className="leading-relaxed">{t.voiceSafeNote}</span>
          </div>
        </div>
      </section>

      {/* ─── RIGHT: REAL case status (polled from backend) ─── */}
      <section className="lg:col-span-5 flex flex-col gap-4">
        <div className="p-5 sm:p-6 rounded-3xl bg-[#11161F] border border-[#30363D] shadow-2xl flex-1 flex flex-col gap-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#30363D]">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-red-600/20 border border-red-500/40 text-red-400 flex items-center justify-center font-bold text-xs">KC</div>
              <div>
                <h2 className="text-sm font-extrabold text-white">{t.voiceRealCaseNumber}</h2>
                <span className="text-[10px] font-mono text-gray-400 block">{t.voiceBrowserSubtitle}</span>
              </div>
            </div>
            {live && (
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-mono font-bold flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                {t.voiceLiveBadge}
              </span>
            )}
          </div>

          {/* Case number */}
          <div className="p-4 rounded-2xl bg-[#0B0E14] border border-[#30363D]">
            <span className="text-[10px] font-mono text-gray-500 uppercase block font-semibold">{t.voiceRealCaseNumber}</span>
            {status?.caseCode ? (
              <p className="font-mono text-lg font-black text-white" dir="ltr">{status.caseCode}</p>
            ) : (
              <p className="font-mono text-sm font-bold text-gray-500 flex items-center gap-2">
                {(connecting || live) && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
                {t.voiceWaitingCase}
              </p>
            )}
          </div>

          {/* Session + turns */}
          <div className="grid grid-cols-2 gap-2">
            <div className="p-3 rounded-2xl bg-[#0B0E14] border border-[#30363D] space-y-0.5">
              <span className="text-[10px] font-mono text-gray-500 uppercase block font-semibold">{t.voiceSessionStatus}</span>
              <p className="text-xs font-bold text-white">{status?.sessionStatus ?? '—'}</p>
            </div>
            <div className="p-3 rounded-2xl bg-[#0B0E14] border border-[#30363D] space-y-0.5">
              <span className="text-[10px] font-mono text-gray-500 uppercase block font-semibold">{t.voiceTurnCount}</span>
              <p className="text-xs font-bold text-white" dir="ltr">{status?.turnCount ?? 0}</p>
            </div>
          </div>

          {/* Urgency */}
          <div className="p-3 rounded-2xl bg-[#0B0E14] border border-red-500/25 space-y-0.5">
            <span className="text-[10px] font-mono text-red-400 uppercase block font-semibold">{t.voiceUrgency}</span>
            <div className="flex items-center gap-1.5">
              {urgency === 'CRITICAL' && <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />}
              <p className={`font-mono text-sm font-black ${urgency === 'CRITICAL' ? 'text-red-400' : urgency === 'HIGH' ? 'text-orange-400' : urgency === 'MEDIUM' ? 'text-amber-400' : 'text-gray-300'}`} dir="ltr">
                {urgency ?? '—'}
              </p>
            </div>
          </div>

          {/* AI analysis */}
          <div className="p-3 rounded-2xl bg-blue-950/20 border border-blue-500/30 space-y-1.5">
            <span className="text-[10px] font-mono text-blue-400 uppercase font-bold flex items-center gap-1">
              <Bot className="w-3 h-3" />{t.voiceAnalysis}
            </span>
            <p
              className={`text-xs font-bold ${
                status?.analysisStatus === 'analyzed'
                  ? 'text-emerald-300'
                  : status?.analysisStatus === 'needs_human_review'
                  ? 'text-amber-300'
                  : 'text-gray-300'
              }`}
            >
              {analysisLabel}
            </p>
            {status?.humanReviewRequired && (
              <p className="text-[11px] text-amber-300 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                {t.voiceHumanReviewFlag}
              </p>
            )}
          </div>

          {/* Transcript honesty note */}
          <div className="p-3 rounded-2xl bg-[#0B0E14] border border-[#30363D] text-[11px] text-gray-400 leading-relaxed flex items-start gap-2">
            <FileText className="w-4 h-4 shrink-0 mt-0.5 text-gray-500" />
            <span>{t.voiceTranscriptNote}</span>
          </div>

          {/* Operator handoff (real case only) */}
          <div className="pt-1 mt-auto space-y-2">
            {status?.caseCode ? (
              <Link
                href="/operator"
                className="block w-full py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs sm:text-sm tracking-wide shadow-xl active:scale-95 transition-all text-center"
              >
                <span className="inline-flex items-center gap-2">
                  {t.voiceOpenOperatorConsole}
                  <ChevronRight className="w-4 h-4" />
                </span>
              </Link>
            ) : (
              <div className="w-full py-3.5 px-4 rounded-2xl bg-[#161B22] border border-[#30363D] text-gray-500 font-bold text-xs sm:text-sm text-center">
                {t.voiceOpenOperatorConsole}
              </div>
            )}
            <p className="text-[10px] text-gray-500 text-center font-mono flex items-center justify-center gap-1.5">
              <Radio className="w-3 h-3 text-blue-400" />
              {t.voiceRetellPowered}
            </p>
            <p className="text-[10px] text-gray-600 text-center font-mono flex items-center justify-center gap-1" dir={isUrdu ? 'rtl' : 'ltr'}>
              <Clock className="w-3 h-3" />
              {t.voiceCaptureFirst}
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
