'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useLanguage } from '@/i18n/LanguageContext';
import { getTranslation } from '@/i18n/translations';
import Navigation from '@/components/Navigation';
import MobileBottomNav from '@/components/MobileBottomNav';
import InteractiveMap from '@/components/InteractiveMap';
import GoogleMap from '@/components/maps/GoogleMap';
import { isGoogleMapsConfigured } from '@/lib/maps/googleMapsLoader';
import type { MapMarkerData } from '@/lib/maps/types';
import {
  ArrowLeft,
  Copy,
  CheckCircle2,
  Clock,
  MapPin,
  Phone,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Shield,
  MessageSquare,
  FileText,
  Loader2,
  XCircle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const CASE_STORAGE_PREFIX = 'khidmatconnect_case_';

interface StoredCaseRef {
  caseCode: string;
  accessToken: string;
  expiresAt: string;
}

interface CaseUpdate {
  id: string;
  updateType: string;
  message: string;
  createdAt: string;
}

interface ApiCaseData {
  caseCode: string;
  source: string;
  status: string;
  urgency: string | null;
  originalMessage: string;
  locationText: string | null;
  latitude: number | null;
  longitude: number | null;
  locationConfirmed: boolean;
  categories: string[];
  aiSummary: string | null;
  keyNeeds: string[];
  specialNeeds: string[];
  missingInformation: string[];
  followUpQuestion: string | null;
  peopleAffected: number | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  updates: CaseUpdate[];
  assignments: unknown[];
}

const urgencyConfig: Record<string, { color: string; bg: string; border: string; label: string }> = {
  CRITICAL: { color: '#F85149', bg: 'bg-[#F85149]/10', border: 'border-[#F85149]/30', label: 'CRITICAL' },
  HIGH: { color: '#D29922', bg: 'bg-[#D29922]/10', border: 'border-[#D29922]/30', label: 'HIGH' },
  MEDIUM: { color: '#58A6FF', bg: 'bg-[#58A6FF]/10', border: 'border-[#58A6FF]/30', label: 'MEDIUM' },
  LOW: { color: '#3FB950', bg: 'bg-[#3FB950]/10', border: 'border-[#3FB950]/30', label: 'LOW' },
};

const statusLabels: Record<string, { en: string; ur: string }> = {
  NEW: { en: 'New — Awaiting Review', ur: 'نیا — جائزے کا انتظار' },
  UNDER_REVIEW: { en: 'Under Review', ur: 'جائزہ لیا جا رہا ہے' },
  NEEDS_INFORMATION: { en: 'Needs More Information', ur: 'مزید معلومات درکار' },
  ASSIGNED: { en: 'Resource Assigned', ur: 'وسائل تفویض' },
  RESPONDER_ACCEPTED: { en: 'Responder Accepted', ur: 'ریسپانڈر نے قبول کیا' },
  EN_ROUTE: { en: 'En Route', ur: 'راستے میں' },
  ARRIVED: { en: 'Arrived at Scene', ur: 'موقع پر پہنچ گئے' },
  COMPLETED: { en: 'Completed', ur: 'مکمل' },
  CLOSED: { en: 'Closed', ur: 'بند' },
};

const updateTypeLabels: Record<string, { en: string; ur: string }> = {
  CASE_CREATED: { en: 'Case Created', ur: 'کیس بنایا گیا' },
  AI_ANALYSIS_COMPLETED: { en: 'AI Analysis Completed', ur: 'AI تجزیہ مکمل' },
  AI_ANALYSIS_FAILED: { en: 'Analysis Pending Review', ur: 'تجزیہ زیرِ جائزہ' },
  PRIORITY_CHANGED: { en: 'Priority Changed', ur: 'ترجیح تبدیل' },
  CATEGORY_CHANGED: { en: 'Category Updated', ur: 'زمرہ اپ ڈیٹ' },
  REQUESTER_INFORMATION_ADDED: { en: 'Information Added', ur: 'معلومات شامل' },
  AMBULANCE_ASSIGNED: { en: 'Ambulance Assigned', ur: 'ایمبولینس تفویض' },
  RESPONDER_ACCEPTED: { en: 'Responder Accepted', ur: 'ریسپانڈر نے قبول کیا' },
  EN_ROUTE: { en: 'En Route', ur: 'راستے میں' },
  ARRIVED: { en: 'Arrived', ur: 'پہنچ گئے' },
  COMPLETED: { en: 'Completed', ur: 'مکمل' },
  CASE_CLOSED: { en: 'Case Closed', ur: 'کیس بند' },
};

export default function CaseStatusPage() {
  const { lang, isUrdu } = useLanguage();
  const t = getTranslation(lang);
  const params = useParams();
  const caseId = params.caseId as string;

  const [caseData, setCaseData] = useState<ApiCaseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorState, setErrorState] = useState<'no_token' | 'expired' | 'not_found' | 'server_error' | null>(null);
  const [copied, setCopied] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showAddInfo, setShowAddInfo] = useState(false);
  const [addInfoText, setAddInfoText] = useState('');
  const [sendingUpdate, setSendingUpdate] = useState(false);

  // Fetch case data from API
  useEffect(() => {
    function getStoredToken(): StoredCaseRef | null {
      try {
        const key = `${CASE_STORAGE_PREFIX}${caseId}`;
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }

    async function fetchCase() {
      const stored = getStoredToken();
      if (!stored) {
        setErrorState('no_token');
        setLoading(false);
        return;
      }

      if (new Date(stored.expiresAt) < new Date()) {
        setErrorState('expired');
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`/api/emergency-cases/${caseId}`, {
          headers: { 'X-Case-Access-Token': stored.accessToken },
        });

        if (res.status === 401 || res.status === 403) {
          setErrorState('expired');
        } else if (res.status === 404) {
          setErrorState('not_found');
        } else if (!res.ok) {
          setErrorState('server_error');
        } else {
          const data: ApiCaseData = await res.json();
          setCaseData(data);
        }
      } catch {
        setErrorState('server_error');
      } finally {
        setLoading(false);
      }
    }

    fetchCase();
  }, [caseId]);

  const handleCopyId = () => {
    navigator.clipboard?.writeText(caseId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendUpdate = async () => {
    if (!addInfoText.trim() || !caseData) return;
    setSendingUpdate(true);
    try {
      const stored = getStoredToken();
      if (!stored) return;

      const res = await fetch(`/api/emergency-cases/${caseId}/updates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Case-Access-Token': stored.accessToken,
        },
        body: JSON.stringify({ message: addInfoText.trim() }),
      });

      if (res.ok) {
        setAddInfoText('');
        setShowAddInfo(false);
        // Refresh case data
        const refreshRes = await fetch(`/api/emergency-cases/${caseId}`, {
          headers: { 'X-Case-Access-Token': stored.accessToken },
        });
        if (refreshRes.ok) {
          setCaseData(await refreshRes.json());
        }
      }
    } catch {
      // Silently fail — don't block the user
    } finally {
      setSendingUpdate(false);
    }
  };

  function getStoredToken(): StoredCaseRef | null {
    try {
      const key = `${CASE_STORAGE_PREFIX}${caseId}`;
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  // Loading state
  if (loading) {
    return (
      <div dir={isUrdu ? 'rtl' : 'ltr'} className="min-h-screen bg-[#0B0E14]">
        <Navigation />
        <main className="flex min-h-[70vh] items-center justify-center px-4 pb-24 md:pb-0">
          <div className="text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#58A6FF]" />
            <p className="mt-4 text-sm text-[#8B949E]">
              {lang === 'ur' ? 'کیس لوڈ ہو رہا ہے...' : 'Loading case...'}
            </p>
          </div>
        </main>
        <MobileBottomNav />
      </div>
    );
  }

  // Error states
  if (errorState) {
    const errorMessages = {
      no_token: {
        en: 'No access token found. Please submit a new emergency request.',
        ur: 'کوئی ٹوکن نہیں ملا۔ براہ کرم نئی درخواست جمع کرائیں۔',
      },
      expired: {
        en: 'Access token has expired or been revoked. Please submit a new request.',
        ur: 'ٹوکن ختم ہو گیا ہے۔ براہ کرم نئی درخواست جمع کرائیں۔',
      },
      not_found: {
        en: 'Case not found.',
        ur: 'کیس نہیں ملا۔',
      },
      server_error: {
        en: 'Unable to load case. Please try again later.',
        ur: 'کیس لوڈ نہیں ہو سکا۔ بعد میں دوبارہ کوشش کریں۔',
      },
    };
    const msg = errorMessages[errorState];

    return (
      <div dir={isUrdu ? 'rtl' : 'ltr'} className="min-h-screen bg-[#0B0E14]">
        <Navigation />
        <main className="flex min-h-[70vh] items-center justify-center px-4 pb-24 md:pb-0">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#1A1F2B]">
              {errorState === 'no_token' || errorState === 'expired' ? (
                <XCircle className="h-8 w-8 text-[#F85149]" />
              ) : (
                <FileText className="h-8 w-8 text-[#6E7681]" />
              )}
            </div>
            <h1 className="text-xl font-bold text-[#E6EDF3]">
              {isUrdu ? msg.ur.split('.')[0] : msg.en.split('.')[0]}
            </h1>
            <p className="mt-2 text-sm text-[#8B949E]">
              {isUrdu ? msg.ur : msg.en}
            </p>
            {errorState === 'no_token' && (
              <p className="mt-1 text-xs text-[#6E7681] font-mono">{caseId}</p>
            )}
            <Link
              href="/emergency"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#3FB950] to-[#059669] px-6 py-3 text-sm font-bold text-white"
            >
              {t.requestHelp}
            </Link>
          </div>
        </main>
        <MobileBottomNav />
      </div>
    );
  }

  if (!caseData) return null;

  const urgency = caseData.urgency ? (urgencyConfig[caseData.urgency] || urgencyConfig.MEDIUM) : urgencyConfig.MEDIUM;
  const statusLabel = statusLabels[caseData.status] || { en: caseData.status, ur: caseData.status };
  const submittedDate = new Date(caseData.createdAt);
  const formattedTime = submittedDate.toLocaleString('en-PK', {
    hour: '2-digit',
    minute: '2-digit',
    day: 'numeric',
    month: 'short',
  });

  // Build timeline from case updates
  const timelineSteps = caseData.updates
    .slice()
    .reverse()
    .map((u) => ({
      label: updateTypeLabels[u.updateType]?.en || u.updateType.replace(/_/g, ' '),
      labelUr: updateTypeLabels[u.updateType]?.ur || u.updateType.replace(/_/g, ' '),
      time: new Date(u.createdAt).toLocaleString('en-PK', {
        hour: '2-digit',
        minute: '2-digit',
      }),
      message: u.message,
      isLatest: false,
    }));
  if (timelineSteps.length > 0) {
    timelineSteps[0].isLatest = true;
  }

  return (
    <div dir={isUrdu ? 'rtl' : 'ltr'} className="min-h-screen bg-[#0B0E14]">
      <Navigation />

      <main className="pb-24 md:pb-0">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
          {/* Back */}
          <Link
            href="/"
            className="mb-4 inline-flex items-center gap-1.5 text-sm text-[#8B949E] hover:text-[#E6EDF3] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {lang === 'ur' ? 'واپس' : 'Back'}
          </Link>

          <div className="grid gap-6 lg:grid-cols-5">
            {/* Left column: Status & Timeline */}
            <div className="lg:col-span-3 space-y-5">
              {/* Case Header */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-[#21262D] bg-[#11151C] p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h1 className="text-xl font-bold text-[#E6EDF3] sm:text-2xl">
                      {t.caseConfirmedTitle}
                    </h1>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="font-mono text-sm text-[#58A6FF] font-bold">{caseData.caseCode}</span>
                      <button
                        onClick={handleCopyId}
                        className="flex h-6 w-6 items-center justify-center rounded text-[#6E7681] hover:text-[#E6EDF3] transition-colors"
                      >
                        {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-[#3FB950]" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                  {caseData.urgency && (
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold ${urgency.bg} ${urgency.border}`} style={{ color: urgency.color }}>
                      {urgency.label}
                    </span>
                  )}
                </div>

                {/* Status badge */}
                <div className="mt-4 flex items-center gap-2 rounded-lg bg-[#0B0E14] px-3 py-2">
                  <div className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ backgroundColor: urgency.color }} />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: urgency.color }} />
                  </div>
                  <span className="text-sm font-medium" style={{ color: urgency.color }}>
                    {isUrdu ? statusLabel.ur : statusLabel.en}
                  </span>
                </div>

                {/* Categories */}
                {caseData.categories.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {caseData.categories.map((cat) => (
                      <span key={cat} className="rounded-md bg-[#1A1F2B] px-2 py-1 text-[10px] font-medium text-[#8B949E]">
                        {cat}
                      </span>
                    ))}
                  </div>
                )}

                {/* People affected */}
                {caseData.peopleAffected && (
                  <p className="mt-2 text-xs text-[#8B949E]">
                    {lang === 'ur' ? `متاثرہ افراد: ${caseData.peopleAffected}` : `People affected: ${caseData.peopleAffected}`}
                  </p>
                )}
              </motion.div>

              {/* AI Follow-up Question */}
              {caseData.followUpQuestion && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="rounded-xl border border-[#58A6FF]/20 bg-[#58A6FF]/5 p-4"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <MessageSquare className="h-4 w-4 text-[#58A6FF]" />
                    <p className="text-xs font-semibold text-[#58A6FF]">
                      {t.dynamicFollowUpTitle}
                    </p>
                  </div>
                  <p className="text-sm text-[#E6EDF3]">{caseData.followUpQuestion}</p>
                </motion.div>
              )}

              {/* Timeline (from case updates) */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="rounded-xl border border-[#21262D] bg-[#11151C] p-5"
              >
                <h2 className="text-sm font-bold text-[#E6EDF3] mb-4">
                  {t.statusLabel}
                </h2>
                <div className="space-y-0">
                  {timelineSteps.map((step, i) => {
                    const isLast = i === timelineSteps.length - 1;
                    return (
                      <div key={i} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div
                            className={`flex h-7 w-7 items-center justify-center rounded-full border-2 transition-colors ${
                              step.isLatest
                                ? 'border-current'
                                : 'border-[#3FB950] bg-[#3FB950]/10'
                            }`}
                            style={step.isLatest ? { borderColor: urgency.color, color: urgency.color } : undefined}
                          >
                            {!step.isLatest ? (
                              <CheckCircle2 className="h-4 w-4 text-[#3FB950]" />
                            ) : (
                              <Clock className="h-3.5 w-3.5" />
                            )}
                          </div>
                          {!isLast && (
                            <div className="h-8 w-0.5 bg-[#3FB950]/20" />
                          )}
                        </div>
                        <div className="pb-4">
                          <p className={`text-sm font-medium ${step.isLatest ? 'text-[#E6EDF3]' : 'text-[#8B949E]'}`}>
                            {isUrdu ? step.labelUr : step.label}
                          </p>
                          <p className="text-xs text-[#6E7681] mt-0.5">{step.time}</p>
                        </div>
                      </div>
                    );
                  })}
                  {timelineSteps.length === 0 && (
                    <p className="text-sm text-[#6E7681]">
                      {lang === 'ur' ? 'کوئی اپ ڈیٹ نہیں' : 'No updates yet'}
                    </p>
                  )}
                </div>
              </motion.div>

              {/* Actions */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="flex flex-wrap gap-2"
              >
                <button
                  onClick={() => setShowAddInfo(!showAddInfo)}
                  className="flex items-center gap-2 rounded-lg border border-[#21262D] bg-[#11151C] px-4 py-2.5 text-xs font-medium text-[#8B949E] hover:border-[#30363D] hover:text-[#E6EDF3] transition-colors"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  {t.addMoreInfo}
                </button>
                <Link
                  href="/nearby"
                  className="flex items-center gap-2 rounded-lg border border-[#21262D] bg-[#11151C] px-4 py-2.5 text-xs font-medium text-[#8B949E] hover:border-[#30363D] hover:text-[#E6EDF3] transition-colors"
                >
                  <MapPin className="h-3.5 w-3.5" />
                  {t.viewNearbyHelp}
                </Link>
                <Link
                  href="/emergency"
                  className="flex items-center gap-2 rounded-lg border border-[#21262D] bg-[#11151C] px-4 py-2.5 text-xs font-medium text-[#8B949E] hover:border-[#30363D] hover:text-[#E6EDF3] transition-colors"
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {t.submitAnother}
                </Link>
              </motion.div>

              {/* Add info panel */}
              <AnimatePresence>
                {showAddInfo && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="rounded-xl border border-[#21262D] bg-[#11151C] p-4">
                      <textarea
                        value={addInfoText}
                        onChange={(e) => setAddInfoText(e.target.value)}
                        placeholder={lang === 'ur' ? 'اضافی تفصیلات درج کریں...' : 'Add additional details...'}
                        rows={3}
                        className="w-full rounded-lg border border-[#21262D] bg-[#0B0E14] px-3 py-2.5 text-sm text-[#E6EDF3] placeholder-[#6E7681] focus:border-[#30363D] outline-none resize-none"
                      />
                      <button
                        onClick={handleSendUpdate}
                        disabled={sendingUpdate || !addInfoText.trim()}
                        className="mt-2 flex items-center gap-2 rounded-lg bg-[#3FB950]/10 px-4 py-2 text-xs font-semibold text-[#3FB950] hover:bg-[#3FB950]/20 transition-colors disabled:opacity-50"
                      >
                        {sendingUpdate && <Loader2 className="h-3 w-3 animate-spin" />}
                        {lang === 'ur' ? 'بھیجیں' : 'Send Update'}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Right column: Map & Details */}
            <div className="lg:col-span-2 space-y-5">
              {/* Location Map */}
              {caseData.latitude != null && caseData.longitude != null && isGoogleMapsConfigured() && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 }}
                >
                  <GoogleMap
                    center={{ latitude: caseData.latitude, longitude: caseData.longitude }}
                    zoom={15}
                    markers={[{
                      id: caseData.caseCode,
                      type: 'EMERGENCY' as const,
                      position: { latitude: caseData.latitude!, longitude: caseData.longitude! },
                      title: caseData.caseCode,
                      subtitle: caseData.locationText || undefined,
                      urgency: caseData.urgency as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | undefined,
                    }]}
                    heightClass="h-[250px]"
                    className="rounded-xl"
                    interactive={false}
                  />
                  {!caseData.locationConfirmed && (
                    <p className="mt-1.5 text-[10px] text-[#D29922] text-center">
                      {lang === 'ur' ? 'مقام کی تصدیق کوآرڈینیٹر کر رہا ہے' : 'Location is being confirmed by the coordinator'}
                    </p>
                  )}
                </motion.div>
              )}
              {caseData.latitude == null && caseData.locationText && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 }}
                  className="rounded-xl border border-[#21262D] bg-[#11151C] p-4 text-center"
                >
                  <MapPin className="mx-auto h-6 w-6 text-[#6E7681] mb-2" />
                  <p className="text-xs text-[#8B949E]">
                    {lang === 'ur' ? 'مقام کی تصدیق کوآرڈینیٹر کر رہا ہے' : 'Location is being confirmed by the coordinator'}
                  </p>
                  <p className="mt-1 text-sm text-[#E6EDF3]">{caseData.locationText}</p>
                </motion.div>
              )}

              {/* Expandable Details */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className="flex w-full items-center justify-between rounded-xl border border-[#21262D] bg-[#11151C] px-4 py-3 text-sm font-medium text-[#E6EDF3] hover:border-[#30363D] transition-colors"
                >
                  <span>{lang === 'ur' ? 'تفصیلات' : 'Case Details'}</span>
                  {showDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                <AnimatePresence>
                  {showDetails && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-2 space-y-3 rounded-xl border border-[#21262D] bg-[#11151C] p-4">
                        {/* Location */}
                        {caseData.locationText && (
                          <div>
                            <p className="text-xs text-[#6E7681]">{t.locationSummaryLabel}</p>
                            <p className="mt-0.5 text-sm text-[#E6EDF3]">{caseData.locationText}</p>
                          </div>
                        )}

                        {/* AI Summary */}
                        {caseData.aiSummary && (
                          <div>
                            <p className="text-xs text-[#6E7681]">{t.emergencySummaryLabel}</p>
                            <p className="mt-0.5 text-sm text-[#E6EDF3]">{caseData.aiSummary}</p>
                          </div>
                        )}

                        {/* Original Message */}
                        <div>
                          <p className="text-xs text-[#6E7681]">
                            {lang === 'ur' ? 'اصل پیغام' : 'Original Message'}
                          </p>
                          <p className="mt-0.5 text-sm text-[#E6EDF3]">{caseData.originalMessage}</p>
                        </div>

                        {/* Key Needs */}
                        {caseData.keyNeeds.length > 0 && (
                          <div>
                            <p className="text-xs text-[#6E7681] mb-1.5">
                              {lang === 'ur' ? 'اہم ضروریات' : 'Key Needs'}
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {caseData.keyNeeds.map((need, i) => (
                                <span
                                  key={i}
                                  className="rounded-md bg-[#1A1F2B] px-2 py-1 text-[10px] text-[#8B949E]"
                                >
                                  {need}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Missing Information */}
                        {caseData.missingInformation.length > 0 && (
                          <div>
                            <p className="text-xs text-[#6E7681] mb-1.5">
                              {lang === 'ur' ? 'مفقود معلومات' : 'Missing Information'}
                            </p>
                            <ul className="space-y-1">
                              {caseData.missingInformation.map((info, i) => (
                                <li key={i} className="text-xs text-[#D29922]">• {info}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Time */}
                        <div>
                          <p className="text-xs text-[#6E7681]">{t.timeSubmittedLabel}</p>
                          <p className="mt-0.5 text-sm text-[#E6EDF3]">{formattedTime}</p>
                        </div>

                        {/* Source */}
                        <div>
                          <p className="text-xs text-[#6E7681]">
                            {lang === 'ur' ? 'ذریعہ' : 'Source'}
                          </p>
                          <p className="mt-0.5 text-sm text-[#E6EDF3]">
                            {caseData.source === 'VOICE_CALL'
                              ? (lang === 'ur' ? 'صوتی کال' : 'Voice Call')
                              : (lang === 'ur' ? 'ویب' : 'Web')}
                          </p>
                        </div>

                        {/* 90-day badge */}
                        <div className="flex items-center gap-2 rounded-lg bg-[#3FB950]/5 border border-[#3FB950]/10 px-3 py-2">
                          <Shield className="h-3.5 w-3.5 text-[#3FB950]" />
                          <span className="text-[10px] text-[#3FB950]">{t.casePersistenceBadge}</span>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            </div>
          </div>
        </div>
      </main>

      <MobileBottomNav />
    </div>
  );
}
