'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/i18n/LanguageContext';
import { getTranslation } from '@/i18n/translations';
import {
  initialMockCases,
  mockCitizenProfile,
  mockCitizenRequests,
  mockInboxMessages,
  mockAdvisories,
} from '@/data/mockData';
import type { CitizenRequest, CitizenRequestStatus } from '@/types';
import MobileBottomNav from '@/components/MobileBottomNav';
import {
  AlertTriangle,
  Activity,
  MessageSquare,
  User,
  LogOut,
  Send,
  CheckCircle2,
  MapPin,
  Clock,
  FileText,
  Shield,
  Globe,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

type DashboardTab = 'cases' | 'requests' | 'messages' | 'profile';

export default function DashboardPage() {
  const { lang, isUrdu, toggleLang } = useLanguage();
  const t = getTranslation(lang);

  const [activeTab, setActiveTab] = useState<DashboardTab>('cases');
  const [inquirySubject, setInquirySubject] = useState('');
  const [inquiryText, setInquiryText] = useState('');
  const [inquirySubmitted, setInquirySubmitted] = useState(false);
  const [requests, setRequests] = useState(mockCitizenRequests);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  const profile = mockCitizenProfile;
  const activeCases = initialMockCases.filter((c) => c.status !== 'completed');
  const pastCases = initialMockCases.filter((c) => c.status === 'completed');
  const unreadCount = mockInboxMessages.filter((m) => m.unread).length;

  const handleSendInquiry = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inquirySubject || !inquiryText) return;
    const newReq: CitizenRequest = {
      id: `NR-2026-${String(Math.floor(Math.random() * 9000) + 1000)}`,
      subject: inquirySubject,
      message: inquiryText,
      status: 'submitted',
      createdAt: lang === 'ur' ? 'ابھی' : 'Just now',
    };
    setRequests((prev) => [newReq, ...prev]);
    setInquirySubject('');
    setInquiryText('');
    setInquirySubmitted(true);
    setTimeout(() => setInquirySubmitted(false), 3000);
  };

  const statusColor = (s: CitizenRequestStatus) => {
    if (s === 'completed') return 'text-[#3FB950] bg-[#3FB950]/10 border-[#3FB950]/20';
    if (s === 'in_review') return 'text-[#D29922] bg-[#D29922]/10 border-[#D29922]/20';
    return 'text-[#58A6FF] bg-[#58A6FF]/10 border-[#58A6FF]/20';
  };

  const statusLabel = (s: CitizenRequestStatus) => {
    if (s === 'completed') return t.requestStatusCompleted;
    if (s === 'in_review') return t.requestStatusInReview;
    return t.requestStatusSubmitted;
  };

  const tabs: { id: DashboardTab; icon: typeof Activity; label: string; badge?: number }[] = [
    { id: 'cases', icon: Activity, label: t.tabActiveCases, badge: activeCases.length },
    { id: 'requests', icon: FileText, label: t.tabRequests, badge: requests.length },
    { id: 'messages', icon: MessageSquare, label: t.tabMessages, badge: unreadCount || undefined },
    { id: 'profile', icon: User, label: t.tabProfile },
  ];

  const selectedMessage = mockInboxMessages.find((m) => m.id === selectedMessageId);

  return (
    <div dir={isUrdu ? 'rtl' : 'ltr'} className="min-h-screen bg-[#0B0E14] pb-20 md:pb-0">
      {/* Top Header */}
      <div className="sticky top-0 z-40 border-b border-[#21262D] bg-[#0B0E14]/95 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#3FB950] to-[#059669]">
              <Shield className="h-4 w-4 text-white" />
            </div>
            <span className="text-sm font-bold text-[#E6EDF3] hidden sm:block">{t.brand}</span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/emergency"
              className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#F85149] to-[#DA3633] px-3 py-2 text-xs font-bold text-white shadow-lg shadow-red-500/20"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t.emergencyHotline}</span>
            </Link>
            <button
              onClick={toggleLang}
              className="flex items-center gap-1 rounded-full border border-[#21262D] px-2.5 py-1 text-xs font-medium text-[#8B949E] hover:text-[#E6EDF3] transition-colors"
            >
              <Globe className="h-3.5 w-3.5" />
              {isUrdu ? 'EN' : 'اردو'}
            </button>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-5xl px-4 py-4 sm:py-6">
        {/* Welcome Banner */}
        <div className="mb-5 flex items-center justify-between rounded-xl border border-[#21262D] bg-[#11151C] p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#58A6FF]/10 text-[#58A6FF] font-bold text-sm">
              {profile.name.charAt(0)}
            </div>
            <div>
              <h1 className="text-sm font-bold text-[#E6EDF3]">
                {t.dashboardWelcome}, {isUrdu ? profile.nameUr : profile.name}
              </h1>
              <p className="text-[11px] text-[#6E7681] font-mono">{profile.phone}</p>
            </div>
          </div>
          <span className="hidden sm:inline-block rounded-full bg-[#58A6FF]/10 border border-[#58A6FF]/20 px-2 py-0.5 text-[10px] font-mono font-bold text-[#58A6FF]">
            {t.demoDataBadge}
          </span>
        </div>

        {/* Tab Navigation */}
        <div className="mb-5 flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setSelectedMessageId(null); }}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-2.5 text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-[#58A6FF] text-white shadow-md'
                    : 'bg-[#11151C] text-[#6E7681] hover:text-[#E6EDF3] border border-[#21262D]'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
                {tab.badge ? (
                  <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                    isActive ? 'bg-white/20' : 'bg-[#21262D] text-[#8B949E]'
                  }`}>
                    {tab.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          {/* ─── Tab 1: Active Cases ─────────────────────────── */}
          {activeTab === 'cases' && (
            <motion.div key="cases" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-5">
              <h2 className="text-xs font-bold text-[#58A6FF] uppercase tracking-wider">{t.activeCaseTracking}</h2>
              {activeCases.length === 0 ? (
                <div className="rounded-xl border border-[#21262D] bg-[#11151C] p-8 text-center text-sm text-[#6E7681]">
                  {t.noActiveCases}
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {activeCases.map((c) => (
                    <Link
                      key={c.id}
                      href={`/case/${c.id}`}
                      className="group rounded-xl border border-[#21262D] bg-[#11151C] p-4 hover:border-[#58A6FF]/40 transition-all"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-[#58A6FF]">{c.id}</span>
                          <span className="rounded-full bg-[#F85149]/10 border border-[#F85149]/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-[#F85149]">
                            {c.urgency}
                          </span>
                        </div>
                        <span className="text-[10px] text-[#6E7681] font-mono">{c.timestamp}</span>
                      </div>
                      <p className="text-xs text-[#8B949E] line-clamp-2 mb-3">{isUrdu && c.aiAnalysis.summaryUr ? c.aiAnalysis.summaryUr : c.aiAnalysis.summary}</p>
                      <div className="flex items-center justify-between border-t border-[#21262D] pt-2">
                        <span className="text-[10px] text-[#6E7681] flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-[#F85149]" />
                          {c.location.name.slice(0, 24)}...
                        </span>
                        <span className="text-[10px] font-bold text-[#58A6FF] group-hover:underline flex items-center gap-0.5">
                          {lang === 'ur' ? 'لائیو اسٹیٹس' : 'Live Status'} <ChevronRight className="h-3 w-3" />
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              {pastCases.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-[#6E7681] uppercase tracking-wider">{t.pastResolvedCases}</h3>
                  {pastCases.map((c) => (
                    <Link
                      key={c.id}
                      href={`/case/${c.id}`}
                      className="flex items-center justify-between rounded-xl border border-[#21262D] bg-[#11151C] p-3 hover:border-[#30363D] transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className="h-4 w-4 text-[#3FB950] shrink-0" />
                        <div>
                          <span className="font-mono text-xs font-bold text-[#E6EDF3]">{c.id}</span>
                          <p className="text-[10px] text-[#6E7681]">{c.aiAnalysis.summary.slice(0, 50)}...</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-mono text-[#3FB950]">{lang === 'ur' ? 'حل شدہ' : 'RESOLVED'}</span>
                    </Link>
                  ))}
                </div>
              )}

              {/* Advisories */}
              <div className="space-y-3 pt-2">
                <h3 className="text-xs font-bold text-[#6E7681] uppercase tracking-wider">{t.advisoriesTitle}</h3>
                {mockAdvisories.map((adv) => (
                  <div
                    key={adv.id}
                    className={`rounded-xl border p-3 space-y-1 ${
                      adv.urgent
                        ? 'border-[#58A6FF]/30 bg-[#58A6FF]/5'
                        : 'border-[#21262D] bg-[#11151C]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-bold ${adv.urgent ? 'text-[#58A6FF]' : 'text-[#E6EDF3]'}`}>
                        {isUrdu && adv.titleUr ? adv.titleUr : adv.title}
                      </span>
                      <span className="text-[10px] text-[#6E7681] font-mono">{adv.timestamp}</span>
                    </div>
                    <p className="text-[11px] text-[#8B949E]">{isUrdu && adv.bodyUr ? adv.bodyUr : adv.body}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ─── Tab 2: Requests ─────────────────────────────── */}
          {activeTab === 'requests' && (
            <motion.div key="requests" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-5">
              {/* New Request Form */}
              <div className="rounded-xl border border-[#21262D] bg-[#11151C] p-4 sm:p-5 space-y-3">
                <div>
                  <h3 className="text-sm font-bold text-[#E6EDF3]">{t.newRequestTitle}</h3>
                  <p className="text-[11px] text-[#6E7681] mt-0.5">{t.newRequestSubtitle}</p>
                </div>
                <form onSubmit={handleSendInquiry} className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[#8B949E]">{t.newRequestSubject}</label>
                    <input
                      type="text"
                      required
                      value={inquirySubject}
                      onChange={(e) => setInquirySubject(e.target.value)}
                      placeholder={t.newRequestSubjectPlaceholder}
                      className="w-full rounded-xl border border-[#21262D] bg-[#0B0E14] px-4 py-3 text-xs text-[#E6EDF3] placeholder:text-[#6E7681] focus:border-[#58A6FF] focus:outline-none min-h-[44px]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[#8B949E]">{t.newRequestMessage}</label>
                    <textarea
                      rows={3}
                      required
                      value={inquiryText}
                      onChange={(e) => setInquiryText(e.target.value)}
                      placeholder={t.newRequestMessagePlaceholder}
                      className="w-full rounded-xl border border-[#21262D] bg-[#0B0E14] px-4 py-3 text-xs text-[#E6EDF3] placeholder:text-[#6E7681] focus:border-[#58A6FF] focus:outline-none resize-none"
                    />
                  </div>
                  {inquirySubmitted && (
                    <div className="flex items-center gap-2 rounded-xl bg-[#3FB950]/10 border border-[#3FB950]/20 p-3 text-xs text-[#3FB950]">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      <span>{t.newRequestSuccess}</span>
                    </div>
                  )}
                  <button
                    type="submit"
                    className="flex items-center gap-2 rounded-xl bg-[#58A6FF] px-5 py-3 text-xs font-bold text-white shadow-md hover:bg-[#58A6FF]/90 transition-colors min-h-[44px]"
                  >
                    <Send className="h-3.5 w-3.5" />
                    {t.newRequestSubmit}
                  </button>
                </form>
              </div>

              {/* Request History */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-[#6E7681] uppercase tracking-wider">{t.requestHistory}</h3>
                {requests.map((req) => (
                  <div
                    key={req.id}
                    className="flex items-center justify-between rounded-xl border border-[#21262D] bg-[#11151C] p-3.5 hover:border-[#30363D] transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-[10px] text-[#58A6FF]">{req.id}</span>
                        <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${statusColor(req.status)}`}>
                          {statusLabel(req.status)}
                        </span>
                      </div>
                      <p className="text-xs font-medium text-[#E6EDF3] truncate">
                        {isUrdu && req.subjectUr ? req.subjectUr : req.subject}
                      </p>
                      <p className="text-[10px] text-[#6E7681] mt-0.5 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {req.createdAt}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-[#6E7681] shrink-0" />
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ─── Tab 3: Messages ─────────────────────────────── */}
          {activeTab === 'messages' && (
            <motion.div key="messages" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
              <h2 className="text-xs font-bold text-[#58A6FF] uppercase tracking-wider">{t.inboxTitle}</h2>

              {/* Thread View */}
              {selectedMessage && selectedMessage.thread ? (
                <div className="space-y-3">
                  <button
                    onClick={() => setSelectedMessageId(null)}
                    className="flex items-center gap-1 text-xs font-semibold text-[#8B949E] hover:text-[#E6EDF3] transition-colors"
                  >
                    ← {lang === 'ur' ? 'واپس' : 'Back to inbox'}
                  </button>
                  <div className="rounded-xl border border-[#21262D] bg-[#11151C] p-4 space-y-3">
                    <h3 className="text-sm font-bold text-[#E6EDF3]">{isUrdu && selectedMessage.fromUr ? selectedMessage.fromUr : selectedMessage.from}</h3>
                    <div className="space-y-2">
                      {selectedMessage.thread.map((msg, i) => (
                        <div
                          key={i}
                          className={`rounded-xl p-3 text-xs ${
                            msg.sender === 'You'
                              ? 'bg-[#58A6FF]/10 border border-[#58A6FF]/20 ms-4'
                              : 'bg-[#0B0E14] border border-[#21262D] me-4'
                          }`}
                        >
                          <p className="text-[10px] font-bold text-[#8B949E] mb-1">{msg.sender}</p>
                          <p className="text-[#E6EDF3]">{msg.text}</p>
                          <p className="text-[10px] text-[#6E7681] mt-1">{msg.time}</p>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 pt-2 border-t border-[#21262D]">
                      <input
                        type="text"
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder={t.inboxReply}
                        className="flex-1 rounded-xl border border-[#21262D] bg-[#0B0E14] px-3 py-2.5 text-xs text-[#E6EDF3] placeholder:text-[#6E7681] focus:border-[#58A6FF] focus:outline-none min-h-[40px]"
                      />
                      <button className="rounded-xl bg-[#58A6FF] p-2.5 text-white min-h-[40px] min-w-[40px] flex items-center justify-center">
                        <Send className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* Message List */
                mockInboxMessages.map((msg) => (
                  <button
                    key={msg.id}
                    onClick={() => msg.thread ? setSelectedMessageId(msg.id) : null}
                    className={`w-full text-start rounded-xl border p-4 transition-all ${
                      msg.unread
                        ? 'border-[#58A6FF]/30 bg-[#58A6FF]/5 hover:border-[#58A6FF]/50'
                        : 'border-[#21262D] bg-[#11151C] hover:border-[#30363D]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[#E6EDF3]">
                          {isUrdu && msg.fromUr ? msg.fromUr : msg.from}
                        </span>
                        {msg.unread && (
                          <span className="h-2 w-2 rounded-full bg-[#58A6FF]" />
                        )}
                      </div>
                      <span className="text-[10px] text-[#6E7681] font-mono">{msg.timestamp}</span>
                    </div>
                    <p className="text-[11px] text-[#8B949E] line-clamp-2">
                      {isUrdu && msg.previewUr ? msg.previewUr : msg.preview}
                    </p>
                    {msg.thread && (
                      <p className="text-[10px] text-[#58A6FF] mt-1.5 font-medium">
                        {lang === 'ur' ? 'تھریڈ دیکھیں →' : 'View thread →'}
                      </p>
                    )}
                  </button>
                ))
              )}
            </motion.div>
          )}

          {/* ─── Tab 4: Profile ──────────────────────────────── */}
          {activeTab === 'profile' && (
            <motion.div key="profile" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
              <h2 className="text-xs font-bold text-[#58A6FF] uppercase tracking-wider">{t.profileTitle}</h2>
              <div className="rounded-xl border border-[#21262D] bg-[#11151C] divide-y divide-[#21262D]">
                {[
                  { label: t.profileName, value: isUrdu ? profile.nameUr : profile.name },
                  { label: t.profilePhone, value: profile.phone },
                  { label: t.profileEmail, value: profile.email },
                  { label: t.profileLanguage, value: isUrdu ? 'اردو' : 'English' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-3.5">
                    <span className="text-xs text-[#6E7681]">{item.label}</span>
                    <span className="text-xs font-medium text-[#E6EDF3]">{item.value}</span>
                  </div>
                ))}
              </div>

              <div className="flex items-start gap-2.5 rounded-xl bg-[#0B0E14] border border-[#21262D] p-3.5">
                <ShieldCheck className="h-4 w-4 text-[#3FB950] mt-0.5 shrink-0" />
                <p className="text-[11px] text-[#6E7681]">{t.profileDemoNotice}</p>
              </div>

              <Link
                href="/"
                className="flex items-center justify-center gap-2 rounded-xl border border-[#21262D] bg-[#11151C] py-3 text-xs font-bold text-[#8B949E] hover:text-[#F85149] hover:border-[#F85149]/30 transition-colors"
              >
                <LogOut className="h-3.5 w-3.5" />
                {t.profileLogout}
              </Link>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <MobileBottomNav />
    </div>
  );
}
