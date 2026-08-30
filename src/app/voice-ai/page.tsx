'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/i18n/LanguageContext';
import { getTranslation } from '@/i18n/translations';
import { mockConversationTurns, mockVoiceCaseDraft } from '@/data/mockData';
import type { VoiceCallPhase, AiVoiceState, VoiceCaseDraft, TranscriptMessage } from '@/types';
import {
  ArrowLeft, Bot, Check, ChevronDown, ChevronRight, Clock, FileText,
  Globe, Mic, Pause, Phone, PhoneCall, PhoneOff, Play, Radio, RotateCcw,
  AlertOctagon, AlertTriangle, ExternalLink, MapPin, ShieldCheck,
  Sparkles, Terminal, User, Volume2,
} from 'lucide-react';

type MobileTab = 'call' | 'case';

export default function VoiceAiPage() {
  const { lang, toggleLang } = useLanguage();
  const t = getTranslation(lang);
  const isUrdu = lang === 'ur';

  // Call lifecycle
  const [callPhase, setCallPhase] = useState<VoiceCallPhase>('active');
  const [callSeconds, setCallSeconds] = useState(42);
  const [voiceState, setVoiceState] = useState<AiVoiceState>('listening');
  const [currentTurnIndex, setCurrentTurnIndex] = useState(3);
  const [isCriticalDetected, setIsCriticalDetected] = useState(true);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioPlaybackProgress, setAudioPlaybackProgress] = useState(65);
  const [showTechDetails, setShowTechDetails] = useState(false);
  const [activeMobileTab, setActiveMobileTab] = useState<MobileTab>('call');
  const [isLowConfidence, setIsLowConfidence] = useState(false);

  // Live case draft
  const [extractedCase, setExtractedCase] = useState<VoiceCaseDraft>(mockVoiceCaseDraft);

  // Conversation
  const conversationTurns: TranscriptMessage[] = mockConversationTurns;

  // Timer
  useEffect(() => {
    if (callPhase !== 'active') return;
    const interval = setInterval(() => setCallSeconds(s => s + 1), 1000);
    return () => clearInterval(interval);
  }, [callPhase]);

  // Voice state from turn
  useEffect(() => {
    if (callPhase !== 'active') return;
    const turn = conversationTurns[Math.min(currentTurnIndex - 1, conversationTurns.length - 1)];
    if (!turn) return;
    setVoiceState(turn.speaker === 'caller' ? 'listening' : 'speaking');
  }, [currentTurnIndex, callPhase]);

  // Scroll transcript
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentTurnIndex, callPhase]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // ─── Demo Actions ──────────────────────────────────────────
  const handleStartDemoCall = () => {
    setCallPhase('active');
    setCallSeconds(12);
    setCurrentTurnIndex(1);
    setIsCriticalDetected(true);
    setIsLowConfidence(false);
    setVoiceState('listening');
    setExtractedCase({
      id: 'KC-2026-1058', urgency: 'critical', category: 'MEDICAL',
      need: 'Ambulance', location: 'Gulshan (Identifying...)',
      people: '1 Patient', contact: '+92 300 8241992',
      status: 'Case Pre-Created',
      aiSummaryEn: 'Unconscious caller reported. Pre-creating dispatch case immediately.',
      aiSummaryUr: 'بے ہوش مریض کی رپورٹ۔ فوری کیس پری کریٹ کر دیا گیا۔',
      missingInfo: 'Exact street / landmark', confidence: 'High (96%)',
    });
    setTimeout(() => { setCurrentTurnIndex(2); setVoiceState('speaking'); }, 2800);
    setTimeout(() => {
      setCurrentTurnIndex(3); setVoiceState('listening');
      setExtractedCase(prev => ({
        ...prev, location: 'Gulshan Block 7 (Near Disco Bakery, Street 4)',
        need: 'ALS Ambulance with Oxygen Support', status: 'Capturing Information', missingInfo: null,
        aiSummaryEn: 'Unconscious female patient. Ambulance requested near Gulshan Block 7.',
      }));
    }, 6000);
    setTimeout(() => {
      setCurrentTurnIndex(4); setVoiceState('speaking');
      setExtractedCase(prev => ({ ...prev, status: 'Case Sent to Operator' }));
    }, 9500);
  };

  const handleSimulateCritical = () => {
    setCallPhase('active'); setCallSeconds(35); setCurrentTurnIndex(3);
    setIsCriticalDetected(true); setIsLowConfidence(false); setVoiceState('speaking');
    setExtractedCase({
      id: 'KC-2026-1058', urgency: 'critical', category: 'MEDICAL',
      need: 'ALS Ambulance & Trauma Team', location: 'Gulshan Block 7 (Near Disco Bakery)',
      people: '1 Patient (Elderly female, unconscious)', contact: '+92 300 8241992',
      status: 'Case Pre-Created',
      aiSummaryEn: 'Unconscious female patient. Ambulance requested near Gulshan Block 7.',
      aiSummaryUr: 'بے ہوش خاتون مریضہ۔ گلشن بلاک 7 کے قریب ایمبولینس کی فوری ضرورت۔',
      missingInfo: null, confidence: 'High (96%)',
    });
  };

  const handleSimulateLowConfidence = () => {
    setCallPhase('active'); setCallSeconds(28); setCurrentTurnIndex(2);
    setIsCriticalDetected(false); setIsLowConfidence(true); setVoiceState('thinking');
    setExtractedCase({
      id: 'KC-2026-1061', urgency: 'medium', category: 'GENERAL',
      need: 'Assessment Required', location: 'Approximate area only',
      people: 'Unknown', contact: '+92 300 8241992',
      status: 'Capturing Information',
      aiSummaryEn: 'Vague emergency reported. AI unable to determine exact nature. Human review needed.',
      aiSummaryUr: 'مبہم ہنگامی صورتحال۔ AI درست نوعیت کا تعین نہیں کر سکا۔ انسانی جائزہ درکار۔',
      missingInfo: 'Nature of emergency, exact location, number of people',
      confidence: 'Low (Requires Review)',
    });
  };

  const handleSimulateCallDrop = () => {
    setCallPhase('dropped'); setVoiceState('muted');
    setExtractedCase(prev => ({ ...prev, status: 'UNDER REVIEW', confidence: 'Medium (78%)' }));
  };

  const handleResetDemo = () => {
    setCallPhase('idle'); setCallSeconds(0); setCurrentTurnIndex(0);
    setIsPlayingAudio(false); setVoiceState('muted'); setIsLowConfidence(false);
    setExtractedCase({
      id: 'Pending', urgency: 'medium', category: 'Triage Pending',
      need: 'Awaiting Voice Input', location: 'Detecting Location...',
      people: 'Unknown', contact: '+92 300 8241992', status: 'Capturing Information',
      aiSummaryEn: 'Awaiting caller voice transmission.',
      aiSummaryUr: 'کالر کی آواز کا انتظار ہے۔',
      missingInfo: 'Location and nature of emergency', confidence: 'High (96%)',
    });
  };

  const handleSendToOperator = () => {
    setExtractedCase(prev => ({ ...prev, status: 'Case Sent to Operator' }));
  };

  // ─── Render ────────────────────────────────────────────────
  return (
    <div dir={isUrdu ? 'rtl' : 'ltr'} className="min-h-screen bg-[#0B0E14] text-[#E6EDF3] flex flex-col font-sans">
      {/* ═══ HEADER ═══ */}
      <header className="bg-[#0D1117] border-b border-[#30363D] px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3 shrink-0 z-20">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/" className="p-2 rounded-xl bg-[#161B22] hover:bg-[#21262D] text-gray-300 hover:text-white border border-[#30363D] transition-colors shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-sm sm:text-base font-extrabold text-white tracking-tight">
                KhidmatConnect AI Emergency Assistant
              </h1>
              {callPhase === 'active' && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-mono font-bold flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  {t.voiceLiveCall}
                </span>
              )}
              {callPhase === 'dropped' && (
                <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/40 text-[10px] font-mono font-bold flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                  {t.voiceCallDisconnected}
                </span>
              )}
              {callPhase === 'idle' && (
                <span className="px-2 py-0.5 rounded-full bg-gray-500/10 text-gray-400 border border-gray-500/30 text-[10px] font-mono font-bold">
                  {t.voiceStandby}
                </span>
              )}
            </div>
            <p className="text-[11px] text-gray-400 hidden sm:block truncate">{t.voiceAiTagline}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#161B22] border border-[#30363D] text-[11px] font-mono text-gray-300">
            <Radio className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
            <span className="text-gray-400">Telephony:</span>
            <span className="text-white font-semibold">1122 Gateway</span>
            <span className="text-gray-500">•</span>
            <span className="text-blue-400">Qwen AI</span>
          </div>
          <button onClick={toggleLang} className="px-2.5 py-1.5 rounded-xl bg-[#161B22] hover:bg-[#21262D] border border-[#30363D] text-xs font-mono text-gray-200 hover:text-white flex items-center gap-1 transition-colors min-h-[36px]">
            <Globe className="w-3.5 h-3.5 text-blue-400" />
            <span>{isUrdu ? 'EN' : 'اردو'}</span>
          </button>
        </div>
      </header>

      {/* ═══ CALL METADATA STRIP ═══ */}
      <section className="bg-[#11161F] border-b border-[#30363D] px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3 text-xs font-mono flex-wrap">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Phone className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-gray-400">{t.voiceCaller}:</span>
            <span className="text-white font-bold tracking-wider" dir="ltr">+92 300 8241992</span>
            <span className="text-[10px] text-gray-500 bg-[#0B0E14] px-1.5 py-0.5 rounded border border-[#30363D]">{t.voiceCellTower} GL-18</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-gray-400">{t.voiceCallDuration}:</span>
            <span className="text-white font-bold" dir="ltr">{formatTime(callSeconds)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-gray-400">{t.voiceDetectedLanguage}:</span>
            <span className="text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">Urdu / Mixed</span>
          </div>
        </div>
        <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-blue-600/20 border border-blue-500/40 text-blue-300 text-[11px] font-bold">
          <Bot className="w-3.5 h-3.5" />
          <span>{t.voiceAiAssistantTag}</span>
        </div>
      </section>

      {/* ═══ MOBILE TAB TOGGLE ═══ */}
      <div className="lg:hidden bg-[#0D1117] border-b border-[#30363D] p-2 flex gap-2">
        <button onClick={() => setActiveMobileTab('call')} className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${activeMobileTab === 'call' ? 'bg-blue-600 text-white shadow' : 'bg-[#161B22] text-gray-400'}`}>
          <Phone className="w-3.5 h-3.5" />
          <span>{isUrdu ? 'لائیو کال' : 'Live Call'}</span>
        </button>
        <button onClick={() => setActiveMobileTab('case')} className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${activeMobileTab === 'case' ? 'bg-blue-600 text-white shadow' : 'bg-[#161B22] text-gray-400'}`}>
          <FileText className="w-3.5 h-3.5" />
          <span>{isUrdu ? 'کیس ڈرافٹ' : 'Case Draft'}</span>
          {isCriticalDetected && <span className="w-2 h-2 rounded-full bg-red-400 animate-ping" />}
        </button>
      </div>

      {/* ═══ MAIN WORKSPACE ═══ */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-5 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6">

        {/* ─── LEFT: Live Call & Transcript ─── */}
        <section className={`lg:col-span-7 flex flex-col gap-4 ${activeMobileTab === 'case' ? 'hidden lg:flex' : 'flex'}`}>

          {/* Voice Waveform */}
          <div className="p-4 sm:p-5 rounded-3xl bg-[#11161F] border border-[#30363D] shadow-xl space-y-4 relative overflow-hidden">
            <div className={`absolute -top-12 -right-12 w-36 h-36 rounded-full blur-3xl pointer-events-none transition-all duration-700 ${callPhase === 'dropped' ? 'bg-red-600/15' : voiceState === 'speaking' ? 'bg-blue-600/20' : 'bg-emerald-600/20'}`} />

            <div className="flex items-center justify-between gap-2 relative z-10">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${callPhase === 'dropped' ? 'bg-red-600/20 text-red-400 border border-red-500/30' : voiceState === 'speaking' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'}`}>
                  {callPhase === 'dropped' ? <PhoneOff className="w-4 h-4" /> : voiceState === 'speaking' ? <Volume2 className="w-4 h-4 animate-pulse" /> : <Mic className="w-4 h-4 animate-bounce" />}
                </div>
                <div>
                  <span className="text-[10px] font-mono text-gray-400 uppercase tracking-wider block">{t.voiceAiVoiceInterface}</span>
                  <div className="text-xs font-black text-white flex items-center gap-1.5">
                    {callPhase === 'dropped' ? (
                      <span className="text-red-400">{t.voiceCallDisconnected}</span>
                    ) : voiceState === 'listening' ? (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <span>{t.voiceListening}</span>
                        <span className="text-gray-400 font-normal">&ldquo;{t.voiceCallerSpeakingUrdu}&rdquo;</span>
                      </span>
                    ) : voiceState === 'thinking' ? (
                      <span className="text-amber-400 flex items-center gap-1">
                        <span>{t.voiceThinking}</span>
                        <span className="text-gray-400 font-normal">&ldquo;{t.voiceExtractingCoords}&rdquo;</span>
                      </span>
                    ) : (
                      <span className="text-blue-400 flex items-center gap-1">
                        <span>{t.voiceSpeaking}</span>
                        <span className="text-gray-400 font-normal">&ldquo;{t.voiceAiReplyingUrdu}&rdquo;</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-mono text-gray-400 uppercase block">{t.voiceLanguageMatch}</span>
                <span className="text-[11px] font-bold text-white font-mono">{t.voiceAutoNoPress1}</span>
              </div>
            </div>

            {/* Waveform bars */}
            <div className="p-3.5 rounded-2xl bg-[#0B0E14] border border-[#30363D] flex items-center justify-between gap-2 h-16 relative">
              <div className="flex items-center gap-1.5 flex-1 justify-center">
                {[14, 28, 45, 20, 60, 35, 75, 40, 90, 65, 40, 85, 30, 70, 25, 55, 30, 65, 20, 40].map((h, i) => (
                  <div key={i} style={{ height: callPhase === 'active' ? `${Math.max(6, (h * (voiceState === 'speaking' ? 0.9 : 0.6)) * (0.5 + Math.sin(i + callSeconds) * 0.4))}px` : '4px' }} className={`w-1 rounded-full transition-all duration-150 ${callPhase === 'dropped' ? 'bg-red-800' : voiceState === 'speaking' ? 'bg-blue-400 shadow-sm shadow-blue-500/50' : 'bg-emerald-400 shadow-sm shadow-emerald-500/50'}`} />
                ))}
              </div>
              <div className="text-[10px] font-mono text-gray-400 text-right shrink-0 border-l border-[#30363D] pl-3">
                <span className="text-gray-500 block">{t.voiceAsrLatency}</span>
                <span className="text-emerald-400 font-bold">180ms</span>
              </div>
            </div>

            {/* Live voice prompt */}
            <div className="text-xs text-gray-300 bg-[#161B22] p-2.5 rounded-xl border border-[#30363D] flex items-center justify-between gap-2">
              <span className="text-gray-400 font-mono text-[10px] uppercase shrink-0">{voiceState === 'speaking' ? t.voiceAiOutput : t.voiceCallerInput}</span>
              <p className="font-semibold text-white truncate text-right font-sans" dir="rtl">
                {voiceState === 'speaking' ? '\u201C\u0628\u0631\u0627\u06C1 \u06A9\u0631\u0645 \u0627\u067E\u0646\u06CC \u0644\u0648\u06A9\u06CC\u0634\u0646 \u06CC\u0627 \u0642\u0631\u06CC\u0628 \u062A\u0631\u06CC\u0646 \u0646\u0634\u0627\u0646 \u0628\u062A\u0627\u0626\u06CC\u06BA\u201D' : '\u201C\u0645\u06CC\u0631\u06CC \u0627\u0645\u06CC \u0628\u06CC\u06C1 \u06C1\u0648\u0634 \u06C1\u06CC\u06BA\u060C \u06C1\u0645\u06CC\u06BA \u0641\u0648\u0631\u0627\u064B \u0627\u06CC\u0645\u0628\u0648\u0644\u06CC\u0646\u0633 \u0686\u0627\u06C1\u06CC\u06D2\u201D'}
              </p>
            </div>
          </div>

          {/* Call Drop Resilience Banner */}
          {callPhase === 'dropped' && (
            <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-r from-red-950/80 via-[#161B22] to-[#161B22] border-2 border-red-500/60 shadow-2xl text-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-red-400 font-black text-sm">
                  <AlertOctagon className="w-5 h-5 text-red-400 animate-bounce" />
                  <span>{t.voiceCallDroppedZeroLoss}</span>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-red-600 text-white font-mono font-bold text-[10px]">{t.voiceResilientPreservation}</span>
              </div>
              <p className="text-gray-200 leading-relaxed">
                <strong className="text-white font-bold">{t.voiceCaseCreatedFromCapture}</strong>
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[11px]">
                <div className="p-2 rounded-xl bg-[#0B0E14] border border-[#30363D]">
                  <span className="text-gray-500 text-[10px] block">{t.voiceCaseId}</span>
                  <span className="text-white font-bold">{extractedCase.id}</span>
                </div>
                <div className="p-2 rounded-xl bg-[#0B0E14] border border-[#30363D]">
                  <span className="text-gray-500 text-[10px] block">{t.voiceTranscript}</span>
                  <span className="text-emerald-400 font-bold flex items-center gap-1"><Check className="w-3 h-3" /> {t.voiceSaved}</span>
                </div>
                <div className="p-2 rounded-xl bg-[#0B0E14] border border-[#30363D]">
                  <span className="text-gray-500 text-[10px] block">{t.voiceRecording}</span>
                  <span className="text-emerald-400 font-bold flex items-center gap-1"><Check className="w-3 h-3" /> {t.voiceSaved}</span>
                </div>
                <div className="p-2 rounded-xl bg-[#0B0E14] border border-[#30363D]">
                  <span className="text-gray-500 text-[10px] block">{t.voiceOperatorReview}</span>
                  <span className="text-amber-400 font-bold">{t.voiceRequired}</span>
                </div>
              </div>
            </div>
          )}

          {/* Low Confidence Banner */}
          {isLowConfidence && callPhase === 'active' && (
            <div className="p-4 rounded-3xl bg-amber-950/30 border-2 border-amber-500/50 shadow-xl text-xs space-y-2">
              <div className="flex items-center gap-2 text-amber-400 font-black text-sm">
                <AlertTriangle className="w-5 h-5" />
                <span>{t.voiceLowConfidence} — {t.voiceHumanReviewRequired}</span>
              </div>
              <p className="text-amber-200/90">{t.voiceAiLowConfidenceNotice}</p>
            </div>
          )}

          {/* Live Transcript */}
          <div className="p-4 sm:p-5 rounded-3xl bg-[#11161F] border border-[#30363D] shadow-xl flex-1 flex flex-col min-h-[300px] max-h-[460px]">
            <div className="flex items-center justify-between pb-3 border-b border-[#30363D] mb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-400" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">{t.voiceTranscriptTitle}</h3>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[11px] font-mono text-emerald-400 font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span>{callPhase === 'active' ? t.voiceTranscriptAutosaved : t.voiceSaved}</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3.5 pr-1">
              {conversationTurns.slice(0, currentTurnIndex).map((turn) => {
                const isCaller = turn.speaker === 'caller';
                return (
                  <div key={turn.id} className={`p-3.5 rounded-2xl text-xs space-y-1.5 ${isCaller ? 'bg-[#161B22] border border-[#30363D] text-gray-200 ml-2 sm:ml-4' : 'bg-blue-950/40 border border-blue-500/30 text-blue-100 mr-2 sm:mr-4'}`}>
                    <div className="flex items-center justify-between text-[10px] font-mono text-gray-400 pb-1 border-b border-[#30363D]/40">
                      <span className={`font-bold flex items-center gap-1.5 ${isCaller ? 'text-emerald-400' : 'text-blue-300'}`}>
                        {isCaller ? <><User className="w-3 h-3" /><span>(+92 300 8241992)</span></> : <><Bot className="w-3 h-3" /><span>KhidmatConnect AI</span></>}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-500">{turn.detectedLanguage}</span>
                        <span className="text-gray-400" dir="ltr">{turn.timestamp}</span>
                      </div>
                    </div>
                    {turn.textUr && (
                      <p dir="rtl" className="text-sm font-sans font-semibold text-white leading-relaxed text-right pt-0.5">{turn.textUr}</p>
                    )}
                    <p className="text-xs text-gray-300 leading-relaxed font-sans">{turn.text}</p>
                  </div>
                );
              })}
              <div ref={transcriptEndRef} />
            </div>

            {/* Recording bar */}
            <div className="pt-3 mt-3 border-t border-[#30363D] flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <button onClick={() => setIsPlayingAudio(!isPlayingAudio)} className="w-8 h-8 rounded-xl bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center shrink-0 shadow transition-colors">
                  {isPlayingAudio ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
                </button>
                <div className="min-w-0">
                  <span className="text-[10px] font-mono text-gray-400 block truncate">{t.voiceRecording}: {formatTime(callSeconds)} &bull; {t.voiceDemoAudio}</span>
                  <div className="w-28 sm:w-44 h-1.5 bg-[#0B0E14] rounded-full overflow-hidden mt-1 border border-[#30363D]">
                    <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${audioPlaybackProgress}%` }} />
                  </div>
                </div>
              </div>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30 shrink-0">{t.voiceContinuousSync}</span>
            </div>
          </div>
        </section>

        {/* ─── RIGHT: Case Extraction ─── */}
        <section className={`lg:col-span-5 flex flex-col gap-4 ${activeMobileTab === 'call' ? 'hidden lg:flex' : 'flex'}`}>
          <div className="p-5 sm:p-6 rounded-3xl bg-[#11161F] border border-[#30363D] shadow-2xl flex-1 flex flex-col justify-between space-y-4">

            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#30363D]">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-red-600/20 border border-red-500/40 text-red-400 flex items-center justify-center font-bold text-xs">KC</div>
                <div>
                  <h2 className="text-sm font-extrabold text-white">{t.voiceCaseDraft}</h2>
                  <span className="text-[10px] font-mono text-gray-400 block">{t.voiceRealTimeExtraction}</span>
                </div>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-black uppercase border ${extractedCase.status === 'Case Pre-Created' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : extractedCase.status === 'UNDER REVIEW' ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : extractedCase.status === 'Case Sent to Operator' ? 'bg-blue-500/20 text-blue-300 border-blue-500/40' : 'bg-gray-500/20 text-gray-300 border-gray-500/40'}`}>
                {extractedCase.status}
              </span>
            </div>

            {/* Fields */}
            <div className="space-y-2.5 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 rounded-2xl bg-[#0B0E14] border border-[#30363D] space-y-0.5">
                  <span className="text-[10px] font-mono text-gray-500 uppercase block font-semibold">{t.voiceCaseId}</span>
                  <p className="font-mono text-sm font-black text-white">{extractedCase.id}</p>
                </div>
                <div className="p-3 rounded-2xl bg-[#0B0E14] border border-red-500/30 space-y-0.5">
                  <span className="text-[10px] font-mono text-red-400 uppercase block font-semibold">{t.voiceUrgency}</span>
                  <div className="flex items-center gap-1.5">
                    {extractedCase.urgency === 'critical' && <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />}
                    <p className={`font-mono text-sm font-black ${extractedCase.urgency === 'critical' ? 'text-red-400' : extractedCase.urgency === 'medium' ? 'text-amber-400' : 'text-gray-300'}`}>
                      {extractedCase.urgency.toUpperCase()}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 rounded-2xl bg-[#0B0E14] border border-[#30363D] space-y-0.5">
                  <span className="text-[10px] font-mono text-gray-500 uppercase block font-semibold">{t.voiceCategory}</span>
                  <p className="font-mono text-xs font-bold text-white uppercase">{extractedCase.category}</p>
                </div>
                <div className="p-3 rounded-2xl bg-[#0B0E14] border border-[#30363D] space-y-0.5">
                  <span className="text-[10px] font-mono text-gray-500 uppercase block font-semibold">{t.voiceRequiredNeed}</span>
                  <p className="text-xs font-bold text-blue-300 truncate">{extractedCase.need}</p>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-[#0B0E14] border border-[#30363D] space-y-0.5">
                <span className="text-[10px] font-mono text-blue-400 uppercase block font-semibold flex items-center gap-1">
                  <MapPin className="w-3 h-3" />{t.voiceLocation}
                </span>
                <p className="text-xs font-bold text-white leading-snug">{extractedCase.location}</p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 rounded-2xl bg-[#0B0E14] border border-[#30363D] space-y-0.5">
                  <span className="text-[10px] font-mono text-gray-500 uppercase block font-semibold">{t.voicePeopleAffected}</span>
                  <p className="text-xs font-bold text-gray-200 truncate">{extractedCase.people}</p>
                </div>
                <div className="p-3 rounded-2xl bg-[#0B0E14] border border-[#30363D] space-y-0.5">
                  <span className="text-[10px] font-mono text-gray-500 uppercase block font-semibold">{t.voiceContact}</span>
                  <p className="font-mono text-xs font-bold text-emerald-400" dir="ltr">{extractedCase.contact}</p>
                </div>
              </div>

              {/* AI Summary */}
              <div className="p-3 rounded-2xl bg-blue-950/20 border border-blue-500/30 space-y-1">
                <span className="text-[10px] font-mono text-blue-400 uppercase font-bold flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />{t.voiceAiSummary}
                </span>
                <p className="text-xs font-semibold text-white leading-relaxed">&ldquo;{isUrdu ? extractedCase.aiSummaryUr : extractedCase.aiSummaryEn}&rdquo;</p>
              </div>

              {/* Missing Info */}
              {extractedCase.missingInfo && (
                <div className="p-3 rounded-2xl bg-amber-950/20 border border-amber-500/40 text-amber-200 text-xs space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-amber-400 text-[11px] font-mono">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>{t.voiceMissingInfo}: {extractedCase.missingInfo}</span>
                  </div>
                  <p className="text-[11px] text-amber-200/90 italic font-sans" dir="rtl">
                    {t.voiceAiFollowUp}: &ldquo;\u0628\u0631\u0627\u06C1 \u06A9\u0631\u0645 \u0642\u0631\u06CC\u0628 \u062A\u0631\u06CC\u0646 \u0646\u0634\u0627\u0646 \u06CC\u0627 \u0641\u0644\u06CC\u0679 \u0646\u0645\u0628\u0631 \u0628\u062A\u0627\u0626\u06CC\u06BA\u06D4&amp;&rdquo;
                  </p>
                </div>
              )}

              {/* Confidence */}
              <div className="p-2.5 rounded-xl bg-[#0B0E14] border border-[#30363D] flex items-center justify-between text-[11px] font-mono">
                <div className="flex items-center gap-1.5 text-gray-400">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{t.voiceConfidence}: <strong className={extractedCase.confidence.includes('Low') ? 'text-amber-400' : 'text-white'}>{extractedCase.confidence}</strong></span>
                </div>
                <span className="text-[10px] text-emerald-400 font-bold">{t.voiceCaptureFirst}</span>
              </div>
            </div>

            {/* Operator Handoff */}
            <div className="space-y-2 pt-2">
              {extractedCase.status === 'Case Sent to Operator' ? (
                <Link href="/operator" className="block w-full py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs sm:text-sm tracking-wide shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2 min-h-[48px]">
                  <span>{t.voiceOpenOperatorConsole}</span>
                  <ChevronRight className="w-4 h-4" />
                </Link>
              ) : (
                <button onClick={handleSendToOperator} className="w-full py-3.5 px-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-black text-xs sm:text-sm tracking-wide shadow-xl shadow-blue-900/40 active:scale-95 transition-all flex items-center justify-center gap-2 min-h-[48px]">
                  <span>{t.voiceOpenOperatorConsole}</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
              <p className="text-[10px] text-gray-500 text-center font-mono">{t.voiceAllDataSaved}</p>
            </div>

            {/* Technical Details (collapsible) */}
            <div className="pt-2 border-t border-[#30363D]">
              <button onClick={() => setShowTechDetails(!showTechDetails)} className="w-full flex items-center justify-between text-[11px] font-mono text-gray-400 hover:text-white py-1 transition-colors">
                <span className="flex items-center gap-1.5"><Terminal className="w-3.5 h-3.5 text-gray-500" /><span>{t.voiceTechnicalDetails}</span></span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showTechDetails ? 'rotate-180' : ''}`} />
              </button>
              {showTechDetails && (
                <div className="mt-2 p-3 rounded-xl bg-[#0B0E14] border border-[#30363D] space-y-2 text-[10px] font-mono text-gray-300">
                  <div className="flex justify-between"><span className="text-gray-500">{t.voiceTelephonyProtocol}:</span><span className="text-blue-300">PSTN Inbound SIP</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">{t.voiceAsrModel}:</span><span className="text-emerald-300">Qwen-Voice-Realtime-Urdu</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">{t.voiceExtractionIntent}:</span><span className="text-white font-bold">EMERGENCY_MEDICAL_ALS</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">{t.voiceAudioSync}:</span><span className="text-emerald-400 font-bold">WebSocket 16kHz PCM</span></div>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* ═══ DEMO CONTROLS ═══ */}
      <footer className="bg-[#0B0E14] border-t border-[#30363D] px-4 sm:px-6 py-3 shrink-0 z-20">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-gray-500 uppercase font-bold tracking-wider">{t.voiceDemoControls}:</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={handleStartDemoCall} className="py-2 px-3 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 text-xs font-bold font-mono flex items-center gap-1.5 transition-colors">
              <PhoneCall className="w-3.5 h-3.5" /><span>{t.voiceStartDemoCall}</span>
            </button>
            <button onClick={handleSimulateCritical} className="py-2 px-3 rounded-xl bg-red-600/20 hover:bg-red-600/30 border border-red-500/40 text-red-300 text-xs font-bold font-mono flex items-center gap-1.5 transition-colors">
              <AlertOctagon className="w-3.5 h-3.5" /><span>{t.voiceSimulateCritical}</span>
            </button>
            <button onClick={handleSimulateLowConfidence} className="py-2 px-3 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/40 text-amber-300 text-xs font-bold font-mono flex items-center gap-1.5 transition-colors">
              <AlertTriangle className="w-3.5 h-3.5" /><span>{t.voiceSimulateLowConfidence}</span>
            </button>
            <button onClick={handleSimulateCallDrop} className="py-2 px-3 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/40 text-amber-300 text-xs font-bold font-mono flex items-center gap-1.5 transition-colors">
              <PhoneOff className="w-3.5 h-3.5" /><span>{t.voiceSimulateCallDrop}</span>
            </button>
            <Link href="/operator" className="py-2 px-3 rounded-xl bg-[#161B22] hover:bg-[#21262D] border border-[#30363D] text-gray-200 hover:text-white text-xs font-bold font-mono flex items-center gap-1.5 transition-colors">
              <ExternalLink className="w-3.5 h-3.5 text-blue-400" /><span>{t.voiceSendToOperator}</span>
            </Link>
            <button onClick={handleResetDemo} className="p-2 rounded-xl bg-[#161B22] hover:bg-[#21262D] border border-[#30363D] text-gray-400 hover:text-white transition-colors" title={t.voiceResetDemo}>
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
