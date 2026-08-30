'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useLanguage } from '@/i18n/LanguageContext';
import { getTranslation } from '@/i18n/translations';
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
import { getCurrentPosition } from '@/lib/maps/geolocation';
import type { GeolocationResult } from '@/lib/maps/types';

type GpsState = 'idle' | 'locating' | 'success' | 'error';

const CASE_STORAGE_PREFIX = 'khidmatconnect_case_';

interface StoredCaseRef {
  caseCode: string;
  accessToken: string;
  expiresAt: string;
}

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
  const [newCaseCode, setNewCaseCode] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [activeCaseCode, setActiveCaseCode] = useState<string | null>(null);

  // Real geolocation state
  const [geoCoords, setGeoCoords] = useState<{ latitude: number; longitude: number; accuracy?: number } | null>(null);
  const [locationConfirmed, setLocationConfirmed] = useState(false);
  const [geoStatusMessage, setGeoStatusMessage] = useState('');

  // Check for active case in localStorage
  useEffect(() => {
    try {
      const keys = Object.keys(localStorage);
      const caseKey = keys.find((k) => k.startsWith(CASE_STORAGE_PREFIX));
      if (caseKey) {
        const stored: StoredCaseRef = JSON.parse(localStorage.getItem(caseKey) || '');
        if (stored.caseCode && stored.expiresAt && new Date(stored.expiresAt) > new Date()) {
          setActiveCaseCode(stored.caseCode);
        }
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

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

  // Real geolocation via browser Geolocation API
  const handleGps = async () => {
    setGpsState('locating');
    setGeoStatusMessage('');

    const result: GeolocationResult = await getCurrentPosition();

    if (result.status === 'SUCCESS' && result.latitude != null && result.longitude != null) {
      setGpsState('success');
      setGeoCoords({
        latitude: result.latitude,
        longitude: result.longitude,
        accuracy: result.accuracy,
      });
      setLocationConfirmed(true);

      // Try reverse geocoding for a readable address (non-blocking)
      try {
        const res = await fetch('/api/maps/reverse-geocode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ latitude: result.latitude, longitude: result.longitude }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.formattedAddress) {
            setLocation(data.formattedAddress);
          }
        }
      } catch {
        // Reverse geocoding failure is non-critical — keep coordinates
      }

      // If location text is still empty, show coordinates
      if (!location) {
        setLocation(`${result.latitude.toFixed(5)}, ${result.longitude.toFixed(5)}`);
      }
    } else {
      setGpsState('error');
      setGeoCoords(null);
      setLocationConfirmed(false);
      const messages: Record<string, string> = {
        DENIED: 'Location permission denied. You can enter your location manually.',
        UNAVAILABLE: 'Location unavailable. You can enter your location manually.',
        TIMEOUT: 'Location request timed out. You can try again or enter manually.',
        UNSUPPORTED: 'Your browser does not support location. Please enter manually.',
      };
      setGeoStatusMessage(messages[result.status] || 'Could not detect location.');
    }
  };

  // Submit handler — real backend API call
  const handleSubmit = async () => {
    if (!location || !message || !primaryPhone) return;
    setIsSubmitting(true);
    setSubmitError('');

    try {
      const payload: Record<string, unknown> = {
        source: 'WEB',
        primaryContact: primaryPhone,
        alternateContact: alternatePhone || undefined,
        originalMessage: message,
        locationText: location,
        categories: ['OTHER'], // AI will refine categories
      };

      // Include GPS coordinates if available
      if (geoCoords) {
        payload.latitude = geoCoords.latitude;
        payload.longitude = geoCoords.longitude;
        payload.locationConfirmed = locationConfirmed;
        if (geoCoords.accuracy != null) {
          payload.locationAccuracy = geoCoords.accuracy;
        }
      }

      const res = await fetch('/api/emergency-cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || `Server error: ${res.status}`);
      }

      const data = await res.json();

      // Store only case reference in localStorage (namespaced)
      const storageKey = `${CASE_STORAGE_PREFIX}${data.caseCode}`;
      const storedRef: StoredCaseRef = {
        caseCode: data.caseCode,
        accessToken: data.caseAccessToken,
        expiresAt: data.tokenExpiresAt,
      };
      localStorage.setItem(storageKey, JSON.stringify(storedRef));

      setNewCaseCode(data.caseCode);
      setSubmitted(true);
    } catch (err) {
      console.error('Emergency submit error:', err);
      setSubmitError(
        err instanceof Error ? err.message : 'Failed to submit emergency request'
      );
    } finally {
      setIsSubmitting(false);
    }
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
              {t.caseIdLabel}: <span className="font-mono font-bold text-[#58A6FF]">{newCaseCode}</span>
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <Link
                href={`/case/${newCaseCode}`}
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
          {activeCaseCode && (
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
                    <p className="text-xs text-[#8B949E] font-mono">{activeCaseCode}</p>
                  </div>
                </div>
                <Link
                  href={`/case/${activeCaseCode}`}
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
              {geoStatusMessage && gpsState === 'error' && (
                <p className="mt-1 text-[11px] text-[#D29922]">{geoStatusMessage}</p>
              )}
              {gpsState === 'success' && geoCoords && (
                <p className="mt-1 text-[11px] text-[#3FB950]">
                  GPS: {geoCoords.latitude.toFixed(5)}, {geoCoords.longitude.toFixed(5)}
                  {geoCoords.accuracy != null && ` (±${Math.round(geoCoords.accuracy)}m)`}
                </p>
              )}
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
              {submitError && (
                <p className="mt-2 text-center text-xs text-[#F85149]">
                  {lang === 'ur' ? 'جمع کرانے میں ناکام۔ دوبارہ کوشش کریں۔' : 'Failed to submit. Please try again.'}
                </p>
              )}
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
