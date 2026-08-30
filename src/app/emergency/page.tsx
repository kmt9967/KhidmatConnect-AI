'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useLanguage } from '@/i18n/LanguageContext';
import { getTranslation } from '@/i18n/translations';
import { mockActiveBrowserCase } from '@/data/mockData';
import Navigation from '@/components/Navigation';
import MobileBottomNav from '@/components/MobileBottomNav';
import {
  MapPin,
  Mic,
  Phone,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Navigation as NavIcon,
  ArrowLeft,
  MessageSquare,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

type GpsState = 'idle' | 'locating' | 'success' | 'error';

export default function EmergencyPage() {
  const { lang, isUrdu } = useLanguage();
  const t = getTranslation(lang);
  const router = useRouter();

  // Form state
  const [gpsState, setGpsState] = useState<GpsState>('idle');
  const [location, setLocation] = useState('');
  const [message, setMessage] = useState('');
  const [primaryPhone, setPrimaryPhone] = useState('');
  const [alternatePhone, setAlternatePhone] = useState('');
  const [showAlternate, setShowAlternate] = useState(false);
  const [followUpAnswer, setFollowUpAnswer] = useState('');
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [isCritical, setIsCritical] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [hasActiveCase] = useState(true); // Demo: simulate returning user

  // Critical keyword detection
  const criticalKeywordsEn = ['unconscious', 'collapsed', 'dying', 'blood', 'fire', 'shooting', 'breathing', 'heart attack', 'stroke'];
  const criticalKeywordsUr = ['بے ہوش', 'خون', 'آگ', 'گولی', 'سانس', 'دل کا دورہ', 'فالج'];

  const detectCritical = useCallback((text: string) => {
    const lower = text.toLowerCase();
    return (
      criticalKeywordsEn.some((k) => lower.includes(k)) ||
      criticalKeywordsUr.some((k) => text.includes(k))
    );
  }, []);

  // Auto-detect critical from message
  useEffect(() => {
    if (message.length > 10) {
      const detected = detectCritical(message);
      setIsCritical(detected);
      if (detected) {
        setShowFollowUp(true);
      }
    }
  }, [message, detectCritical]);

  // GPS simulation
  const handleGps = () => {
    setGpsState('locating');
    setTimeout(() => {
      const success = Math.random() > 0.3;
      if (success) {
        setGpsState('success');
        setLocation('Plot B-42, Street 9, Gulshan-e-Iqbal Block 4, Karachi');
      } else {
        setGpsState('error');
        setLocation('');
      }
    }, 2000);
  };

  // Submit handler (demo only)
  const handleSubmit = () => {
    if (!location || !message || !primaryPhone) return;
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setSubmitted(true);
      // In real app: redirect to /case/[newCaseId]
    }, 2500);
  };

  // Post-submit confirmation screen
  if (submitted) {
    return (
      <div dir={isUrdu ? 'rtl' : 'ltr'} className="min-h-screen bg-[#0B0E14]">
        <Navigation />
        <main className="flex min-h-[80vh] items-center justify-center px-4 pb-24 md:pb-0">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mx-auto max-w-md text-center"
          >
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[#3FB950]/10">
              <CheckCircle2 className="h-10 w-10 text-[#3FB950]" />
            </div>
            <h1 className="text-2xl font-bold text-[#E6EDF3]">{t.caseConfirmedTitle}</h1>
            <p className="mt-2 text-sm text-[#8B949E]">
              {t.caseIdLabel}: <span className="font-mono font-bold text-[#58A6FF]">KC-2026-1050</span>
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <Link
                href="/case/KC-2026-1050"
                className="rounded-xl bg-gradient-to-r from-[#3FB950] to-[#059669] px-6 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-500/20"
              >
                {t.trackActiveCase}
              </Link>
              <button
                onClick={() => {
                  setSubmitted(false);
                  setLocation('');
                  setMessage('');
                  setPrimaryPhone('');
                  setAlternatePhone('');
                  setShowAlternate(false);
                  setShowFollowUp(false);
                  setIsCritical(false);
                  setGpsState('idle');
                }}
                className="rounded-xl border border-[#21262D] px-6 py-3 text-sm text-[#8B949E] hover:bg-[#1A1F2B]"
              >
                {t.submitAnother}
              </button>
            </div>
          </motion.div>
        </main>
        <MobileBottomNav />
      </div>
    );
  }

  return (
    <div dir={isUrdu ? 'rtl' : 'ltr'} className="min-h-screen bg-[#0B0E14]">
      <Navigation />

      <main className="pb-24 md:pb-0">
        <div className="mx-auto max-w-lg px-4 py-6 sm:py-10">
          {/* Back link */}
          <Link
            href="/"
            className="mb-4 inline-flex items-center gap-1.5 text-sm text-[#8B949E] hover:text-[#E6EDF3] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {lang === 'ur' ? 'واپس' : 'Back'}
          </Link>

          {/* Active case banner (returning user) */}
          {hasActiveCase && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 rounded-xl border border-[#3FB950]/20 bg-[#3FB950]/5 p-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="relative flex h-3 w-3">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#3FB950] opacity-75" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-[#3FB950]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#3FB950]">{t.activeCaseBanner}</p>
                    <p className="text-xs text-[#8B949E] font-mono">{mockActiveBrowserCase.id}</p>
                  </div>
                </div>
                <Link
                  href={`/case/${mockActiveBrowserCase.id}`}
                  className="rounded-lg bg-[#3FB950]/10 px-3 py-1.5 text-xs font-semibold text-[#3FB950] hover:bg-[#3FB950]/20 transition-colors"
                >
                  {t.trackActiveCase}
                </Link>
              </div>
            </motion.div>
          )}

          {/* Form Title */}
          <motion.h1
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-2xl font-bold text-[#E6EDF3] sm:text-3xl"
          >
            {t.emergencyFormTitle}
          </motion.h1>

          <div className="mt-6 space-y-5">
            {/* Location */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <label className="mb-2 block text-sm font-medium text-[#8B949E]">
                {t.locationLabel}
              </label>
              <div className="relative">
                <MapPin className={`absolute top-3.5 ${isUrdu ? 'right-3.5' : 'left-3.5'} h-5 w-5 ${
                  gpsState === 'success' ? 'text-[#3FB950]' : gpsState === 'error' ? 'text-[#F85149]' : 'text-[#6E7681]'
                }`} />
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder={t.locationPlaceholder}
                  className={`w-full rounded-xl border bg-[#11151C] py-3.5 ${isUrdu ? 'pr-12 pl-4' : 'pl-12 pr-4'} text-sm text-[#E6EDF3] placeholder-[#6E7681] transition-colors ${
                    gpsState === 'success'
                      ? 'border-[#3FB950]/30 focus:border-[#3FB950]/50'
                      : gpsState === 'error'
                      ? 'border-[#F85149]/30 focus:border-[#F85149]/50'
                      : 'border-[#21262D] focus:border-[#30363D]'
                  } outline-none`}
                />
              </div>
              <button
                onClick={handleGps}
                disabled={gpsState === 'locating'}
                className={`mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                  gpsState === 'success'
                    ? 'bg-[#3FB950]/10 text-[#3FB950]'
                    : gpsState === 'error'
                    ? 'bg-[#F85149]/10 text-[#F85149]'
                    : 'bg-[#1A1F2B] text-[#8B949E] hover:text-[#E6EDF3]'
                }`}
              >
                {gpsState === 'locating' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : gpsState === 'success' ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : gpsState === 'error' ? (
                  <XCircle className="h-3.5 w-3.5" />
                ) : (
                  <NavIcon className="h-3.5 w-3.5" />
                )}
                {gpsState === 'idle' && t.useMyLocation}
                {gpsState === 'locating' && (lang === 'ur' ? 'مقام تلاش ہو رہا ہے...' : 'Locating...')}
                {gpsState === 'success' && t.gpsDetected}
                {gpsState === 'error' && t.gpsError}
              </button>
            </motion.div>

            {/* Emergency Message */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
            >
              <label className="mb-2 block text-sm font-medium text-[#8B949E]">
                {t.messageLabel}
              </label>
              <div className="relative">
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={t.messagePlaceholder}
                  rows={3}
                  className="w-full rounded-xl border border-[#21262D] bg-[#11151C] px-4 py-3.5 text-sm text-[#E6EDF3] placeholder-[#6E7681] focus:border-[#30363D] outline-none resize-none"
                />
                {/* Mic button */}
                <button
                  className={`absolute bottom-3 ${isUrdu ? 'left-3' : 'right-3'} flex h-10 w-10 items-center justify-center rounded-full border border-[#21262D] bg-[#1A1F2B] text-[#6E7681] hover:text-[#E6EDF3] hover:border-[#30363D] transition-colors`}
                  title={t.voiceInputTitle}
                >
                  <Mic className="h-5 w-5" />
                </button>
              </div>
            </motion.div>

            {/* Critical banner */}
            <AnimatePresence>
              {isCritical && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="rounded-xl border border-[#F85149]/20 bg-[#F85149]/5 p-3">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-[#F85149]" />
                      <p className="text-xs font-semibold text-[#F85149]">
                        {t.criticalDetectedBanner}
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Dynamic follow-up */}
            <AnimatePresence>
              {showFollowUp && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="rounded-xl border border-[#58A6FF]/20 bg-[#58A6FF]/5 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <MessageSquare className="h-4 w-4 text-[#58A6FF]" />
                      <p className="text-xs font-semibold text-[#58A6FF]">
                        {t.dynamicFollowUpTitle}
                      </p>
                    </div>
                    <input
                      type="text"
                      value={followUpAnswer}
                      onChange={(e) => setFollowUpAnswer(e.target.value)}
                      placeholder={lang === 'ur' ? 'مثلاً: ہاں، دل کا مریض ہے' : 'e.g., Yes, known heart patient'}
                      className="w-full rounded-lg border border-[#21262D] bg-[#0B0E14] px-3 py-2.5 text-sm text-[#E6EDF3] placeholder-[#6E7681] focus:border-[#30363D] outline-none"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Primary Contact */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <label className="mb-2 block text-sm font-medium text-[#8B949E]">
                {t.primaryContactLabel}
              </label>
              <div className="relative">
                <Phone className={`absolute top-3.5 ${isUrdu ? 'right-3.5' : 'left-3.5'} h-5 w-5 text-[#6E7681]`} />
                <input
                  type="tel"
                  value={primaryPhone}
                  onChange={(e) => setPrimaryPhone(e.target.value)}
                  placeholder={t.primaryContactPlaceholder}
                  className={`w-full rounded-xl border border-[#21262D] bg-[#11151C] py-3.5 ${isUrdu ? 'pr-12 pl-4' : 'pl-12 pr-4'} text-sm text-[#E6EDF3] placeholder-[#6E7681] focus:border-[#30363D] outline-none`}
                />
              </div>
            </motion.div>

            {/* Alternate Contact (expandable) */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
            >
              <button
                onClick={() => setShowAlternate(!showAlternate)}
                className="flex items-center gap-2 text-sm text-[#8B949E] hover:text-[#E6EDF3] transition-colors"
              >
                {showAlternate ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                {t.alternateContactLabel}
              </button>
              <AnimatePresence>
                {showAlternate && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="relative mt-2">
                      <Phone className={`absolute top-3.5 ${isUrdu ? 'right-3.5' : 'left-3.5'} h-5 w-5 text-[#6E7681]`} />
                      <input
                        type="tel"
                        value={alternatePhone}
                        onChange={(e) => setAlternatePhone(e.target.value)}
                        placeholder={t.alternateContactPlaceholder}
                        className={`w-full rounded-xl border border-[#21262D] bg-[#11151C] py-3.5 ${isUrdu ? 'pr-12 pl-4' : 'pl-12 pr-4'} text-sm text-[#E6EDF3] placeholder-[#6E7681] focus:border-[#30363D] outline-none`}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Submit */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="pt-2"
            >
              <button
                onClick={handleSubmit}
                disabled={!location || !message || !primaryPhone || isSubmitting}
                className={`w-full rounded-xl py-4 text-base font-bold text-white shadow-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                  isCritical
                    ? 'bg-gradient-to-r from-[#F85149] to-[#DA3633] shadow-red-500/20 hover:shadow-red-500/40'
                    : 'bg-gradient-to-r from-[#3FB950] to-[#059669] shadow-emerald-500/20 hover:shadow-emerald-500/40'
                }`}
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    {t.submitting}
                  </span>
                ) : isCritical ? (
                  t.submitButtonCritical
                ) : (
                  t.submitButton
                )}
              </button>
              <p className="mt-2 text-center text-[10px] text-[#6E7681]">
                {t.browserPersistenceNotice}
              </p>
            </motion.div>
          </div>
        </div>
      </main>

      <MobileBottomNav />
    </div>
  );
}
