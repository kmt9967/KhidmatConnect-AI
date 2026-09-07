'use client';

/**
 * /voice-ai — M17 shell.
 *
 * PRIMARY (default): a REAL browser voice emergency via Retell's Web SDK
 *   → RealVoicePanel.
 * SECONDARY (opt-in, clearly labelled): the original simulated demo
 *   → DemoVoicePanel.
 *
 * The mode toggle is the only switch. Real mode is the default so the primary
 * action a citizen sees is "Start Voice Emergency" (a genuine call), never the
 * mock. Demo data is never presented as a live emergency.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/i18n/LanguageContext';
import { getTranslation } from '@/i18n/translations';
import { ArrowLeft, Globe, Radio } from 'lucide-react';
import RealVoicePanel from './RealVoicePanel';
import DemoVoicePanel from './DemoVoicePanel';

type VoiceMode = 'real' | 'demo';

export default function VoiceAiPage() {
  const { lang, toggleLang } = useLanguage();
  const t = getTranslation(lang);
  const isUrdu = lang === 'ur';

  // Real browser call is the DEFAULT; demo is a demoted secondary fallback.
  const [mode, setMode] = useState<VoiceMode>('real');

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
              {/* Real ↔ Demo mode toggle (Real is primary) */}
              <button
                onClick={() => setMode(mode === 'real' ? 'demo' : 'real')}
                className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border transition-colors ${
                  mode === 'real'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/40 hover:text-amber-300'
                }`}
                title={mode === 'real' ? t.voiceModeDemo : t.voiceModeReal}
              >
                {mode === 'real' ? t.voiceModeReal : t.voiceModeDemo}
              </button>
            </div>
            <p className="text-[11px] text-gray-400 hidden sm:block truncate">
              {mode === 'real' ? t.voiceBrowserSubtitle : t.voiceAiTagline}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#161B22] border border-[#30363D] text-[11px] font-mono text-gray-300">
            <Radio className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
            <span className="text-gray-400">Voice:</span>
            <span className="text-white font-semibold">Retell</span>
            <span className="text-gray-500">•</span>
            <span className="text-emerald-400">Qwen AI</span>
          </div>
          <button onClick={toggleLang} className="px-2.5 py-1.5 rounded-xl bg-[#161B22] hover:bg-[#21262D] border border-[#30363D] text-xs font-mono text-gray-200 hover:text-white flex items-center gap-1 transition-colors min-h-[36px]">
            <Globe className="w-3.5 h-3.5 text-blue-400" />
            <span>{isUrdu ? 'EN' : 'اردو'}</span>
          </button>
        </div>
      </header>

      {mode === 'real' ? <RealVoicePanel t={t} isUrdu={isUrdu} /> : <DemoVoicePanel t={t} isUrdu={isUrdu} />}
    </div>
  );
}
