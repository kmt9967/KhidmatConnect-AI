'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useLanguage } from '@/i18n/LanguageContext';
import { getTranslation } from '@/i18n/translations';
import { initialMockCases } from '@/data/mockData';
import Navigation from '@/components/Navigation';
import MobileBottomNav from '@/components/MobileBottomNav';
import InteractiveMap from '@/components/InteractiveMap';
import {
  ArrowLeft,
  Copy,
  CheckCircle2,
  Clock,
  MapPin,
  Phone,
  User,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Shield,
  Navigation as NavIcon,
  MessageSquare,
  FileText,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { EmergencyCase, CaseStatus } from '@/types';

const urgencyConfig: Record<string, { color: string; bg: string; border: string; label: string }> = {
  critical: { color: '#F85149', bg: 'bg-[#F85149]/10', border: 'border-[#F85149]/30', label: 'CRITICAL' },
  high: { color: '#D29922', bg: 'bg-[#D29922]/10', border: 'border-[#D29922]/30', label: 'HIGH' },
  medium: { color: '#58A6FF', bg: 'bg-[#58A6FF]/10', border: 'border-[#58A6FF]/30', label: 'MEDIUM' },
  low: { color: '#3FB950', bg: 'bg-[#3FB950]/10', border: 'border-[#3FB950]/30', label: 'LOW' },
};

export default function CaseStatusPage() {
  const { lang, isUrdu } = useLanguage();
  const t = getTranslation(lang);
  const params = useParams();
  const caseId = params.caseId as string;

  // Find case from mock data or create a placeholder
  const foundCase = initialMockCases.find((c) => c.id === caseId);
  const [caseData] = useState<EmergencyCase | null>(foundCase || null);
  const [copied, setCopied] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showAddInfo, setShowAddInfo] = useState(false);
  const [addInfoText, setAddInfoText] = useState('');

  const handleCopyId = () => {
    navigator.clipboard?.writeText(caseId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Case not found
  if (!caseData) {
    return (
      <div dir={isUrdu ? 'rtl' : 'ltr'} className="min-h-screen bg-[#0B0E14]">
        <Navigation />
        <main className="flex min-h-[70vh] items-center justify-center px-4 pb-24 md:pb-0">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#1A1F2B]">
              <FileText className="h-8 w-8 text-[#6E7681]" />
            </div>
            <h1 className="text-xl font-bold text-[#E6EDF3]">
              {lang === 'ur' ? 'کیس نہیں ملا' : 'Case Not Found'}
            </h1>
            <p className="mt-2 text-sm text-[#8B949E]">
              {lang === 'ur' ? 'کیس آئی ڈی' : 'Case ID'}: <span className="font-mono">{caseId}</span>
            </p>
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

  const urgency = urgencyConfig[caseData.urgency] || urgencyConfig.medium;
  const currentStep = caseData.timeline.find((s) => s.current);
  const completedSteps = caseData.timeline.filter((s) => s.completed).length;
  const totalSteps = caseData.timeline.length;
  const progressPercent = (completedSteps / totalSteps) * 100;

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
                      <span className="font-mono text-sm text-[#58A6FF] font-bold">{caseData.id}</span>
                      <button
                        onClick={handleCopyId}
                        className="flex h-6 w-6 items-center justify-center rounded text-[#6E7681] hover:text-[#E6EDF3] transition-colors"
                      >
                        {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-[#3FB950]" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold ${urgency.bg} ${urgency.border}`} style={{ color: urgency.color }}>
                    {urgency.label}
                  </span>
                </div>

                {/* Status badge */}
                {currentStep && (
                  <div className="mt-4 flex items-center gap-2 rounded-lg bg-[#0B0E14] px-3 py-2">
                    <div className="relative flex h-2.5 w-2.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ backgroundColor: urgency.color }} />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: urgency.color }} />
                    </div>
                    <span className="text-sm font-medium" style={{ color: urgency.color }}>
                      {isUrdu ? currentStep.labelUr : currentStep.label}
                    </span>
                    {currentStep.note && (
                      <span className="text-xs text-[#6E7681]">— {currentStep.note}</span>
                    )}
                  </div>
                )}

                {/* Progress bar */}
                <div className="mt-4">
                  <div className="flex items-center justify-between text-[10px] text-[#6E7681] mb-1">
                    <span>{completedSteps}/{totalSteps} {lang === 'ur' ? 'مراحل' : 'steps'}</span>
                    <span>{Math.round(progressPercent)}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[#21262D]">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${progressPercent}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                      className="h-full rounded-full"
                      style={{ backgroundColor: urgency.color }}
                    />
                  </div>
                </div>
              </motion.div>

              {/* ETA Card */}
              {caseData.assignedResource && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="rounded-xl border border-[#21262D] bg-[#11151C] p-5"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-[#6E7681]">{t.etaLabel}</p>
                      <p className="mt-1 text-3xl font-extrabold text-[#E6EDF3]">
                        {caseData.assignedResource.etaMinutes}
                        <span className="ml-1 text-sm font-normal text-[#8B949E]">
                          {lang === 'ur' ? 'منٹ' : 'mins'}
                        </span>
                      </p>
                    </div>
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#3FB950]/10">
                      <NavIcon className="h-6 w-6 text-[#3FB950]" />
                    </div>
                  </div>

                  {/* Responder info */}
                  <div className="mt-4 flex items-center gap-3 rounded-lg border border-[#21262D] bg-[#0B0E14] p-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1A1F2B]">
                      <User className="h-5 w-5 text-[#8B949E]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#E6EDF3] truncate">
                        {caseData.assignedResource.responderName}
                      </p>
                      <p className="text-xs text-[#8B949E] truncate">
                        {caseData.assignedResource.name} • {caseData.assignedResource.plateNumber}
                      </p>
                    </div>
                    <a
                      href={`tel:${caseData.assignedResource.responderPhone}`}
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-[#3FB950]/10 text-[#3FB950] hover:bg-[#3FB950]/20 transition-colors"
                    >
                      <Phone className="h-4 w-4" />
                    </a>
                  </div>
                </motion.div>
              )}

              {/* Timeline */}
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
                  {caseData.timeline.map((step, i) => {
                    const isLast = i === caseData.timeline.length - 1;
                    return (
                      <div key={step.step} className="flex gap-3">
                        {/* Stepper line */}
                        <div className="flex flex-col items-center">
                          <div
                            className={`flex h-7 w-7 items-center justify-center rounded-full border-2 transition-colors ${
                              step.current
                                ? 'border-current'
                                : step.completed
                                ? 'border-[#3FB950] bg-[#3FB950]/10'
                                : 'border-[#21262D] bg-[#0B0E14]'
                            }`}
                            style={step.current ? { borderColor: urgency.color, color: urgency.color } : undefined}
                          >
                            {step.completed && !step.current ? (
                              <CheckCircle2 className="h-4 w-4 text-[#3FB950]" />
                            ) : step.current ? (
                              <Clock className="h-3.5 w-3.5" />
                            ) : (
                              <div className="h-2 w-2 rounded-full bg-[#21262D]" />
                            )}
                          </div>
                          {!isLast && (
                            <div className={`h-8 w-0.5 ${step.completed ? 'bg-[#3FB950]/20' : 'bg-[#21262D]'}`} />
                          )}
                        </div>
                        {/* Content */}
                        <div className={`pb-4 ${isLast ? '' : ''}`}>
                          <p className={`text-sm font-medium ${step.current ? 'text-[#E6EDF3]' : step.completed ? 'text-[#8B949E]' : 'text-[#6E7681]'}`}>
                            {isUrdu ? step.labelUr : step.label}
                          </p>
                          <p className="text-xs text-[#6E7681] mt-0.5">{step.time}</p>
                          {step.note && (
                            <p className="text-xs mt-1 text-[#58A6FF]">{step.note}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
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
                      <button className="mt-2 rounded-lg bg-[#3FB950]/10 px-4 py-2 text-xs font-semibold text-[#3FB950] hover:bg-[#3FB950]/20 transition-colors">
                        {lang === 'ur' ? 'بھیجیں' : 'Send Update'}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Right column: Map & Details */}
            <div className="lg:col-span-2 space-y-5">
              {/* Map */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <InteractiveMap
                  cases={[caseData]}
                  selectedCaseId={caseData.id}
                  className="h-[300px] lg:h-[400px]"
                />
              </motion.div>

              {/* Expandable Details */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
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
                        <div>
                          <p className="text-xs text-[#6E7681]">{t.locationSummaryLabel}</p>
                          <p className="mt-0.5 text-sm text-[#E6EDF3]">{caseData.location.name}</p>
                          {caseData.location.addressDetail && (
                            <p className="text-xs text-[#8B949E]">{caseData.location.addressDetail}</p>
                          )}
                        </div>

                        {/* AI Summary */}
                        <div>
                          <p className="text-xs text-[#6E7681]">{t.emergencySummaryLabel}</p>
                          <p className="mt-0.5 text-sm text-[#E6EDF3]">
                            {isUrdu && caseData.aiAnalysis.summaryUr
                              ? caseData.aiAnalysis.summaryUr
                              : caseData.aiAnalysis.summary}
                          </p>
                        </div>

                        {/* Key Needs */}
                        <div>
                          <p className="text-xs text-[#6E7681] mb-1.5">
                            {lang === 'ur' ? 'اہم ضروریات' : 'Key Needs'}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {caseData.aiAnalysis.keyNeeds.map((need, i) => (
                              <span
                                key={i}
                                className="rounded-md bg-[#1A1F2B] px-2 py-1 text-[10px] text-[#8B949E]"
                              >
                                {need}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Requester */}
                        <div>
                          <p className="text-xs text-[#6E7681]">
                            {lang === 'ur' ? 'رابطہ معلومات' : 'Contact Info'}
                          </p>
                          <div className="mt-1 flex items-center gap-2">
                            <span className="text-sm text-[#E6EDF3]">{caseData.requester.name}</span>
                            <a
                              href={`tel:${caseData.requester.phone}`}
                              className="flex h-7 w-7 items-center justify-center rounded-full bg-[#3FB950]/10 text-[#3FB950]"
                            >
                              <Phone className="h-3.5 w-3.5" />
                            </a>
                          </div>
                          {caseData.requester.alternatePhone && (
                            <p className="text-xs text-[#8B949E] mt-0.5">
                              {lang === 'ur' ? 'متبادل' : 'Alt'}: {caseData.requester.alternatePhone}
                            </p>
                          )}
                        </div>

                        {/* Time */}
                        <div>
                          <p className="text-xs text-[#6E7681]">{t.timeSubmittedLabel}</p>
                          <p className="mt-0.5 text-sm text-[#E6EDF3]">{caseData.timestamp}</p>
                        </div>

                        {/* Operator Notes */}
                        {caseData.operatorNotes && caseData.operatorNotes.length > 0 && (
                          <div>
                            <p className="text-xs text-[#6E7681] mb-1">
                              {lang === 'ur' ? 'آپریٹر نوٹس' : 'Operator Notes'}
                            </p>
                            <div className="space-y-1">
                              {caseData.operatorNotes.map((note, i) => (
                                <p key={i} className="text-xs text-[#8B949E] border-l-2 border-[#21262D] pl-2">
                                  {note}
                                </p>
                              ))}
                            </div>
                          </div>
                        )}

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
