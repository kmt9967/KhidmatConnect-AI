'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  Ambulance,
  Bell,
  ChevronRight,
  Clock,
  Compass,
  Globe,
  LogOut,
  MapPin,
  Mic,
  Plus,
  Radio,
  Search,
} from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import { getTranslation } from '@/i18n/translations';
import { initialMockCases, mockReliefResources } from '@/data/mockData';
import type { EmergencyCase, UrgencyLevel, EmergencyCategory } from '@/types';
import InteractiveMap from '@/components/InteractiveMap';
import GoogleMap from '@/components/maps/GoogleMap';
import { isGoogleMapsConfigured } from '@/lib/maps/googleMapsLoader';
import { isLocationUnconfirmed } from '@/lib/maps/distance';
import type { MapMarkerData } from '@/lib/maps/types';
import OperatorCaseDrawer from '@/components/operator/OperatorCaseDrawer';
import AuthGuard from '@/components/AuthGuard';
import { useAuth } from '@/lib/auth/AuthContext';
import Link from 'next/link';

// ─── Milestone 8: Real API types ────────────────────────────
interface ApiActiveCase {
  id: string;
  caseCode: string;
  status: string;
  urgency: string;
  locationText: string | null;
  latitude: number | null;
  longitude: number | null;
  locationConfirmed: boolean;
  categories: string[];
  createdAt: string;
  assignments: {
    id: string;
    status: string;
    responder: {
      id: string;
      name: string;
      phone: string;
      latitude: number | null;
      longitude: number | null;
      availabilityStatus: string;
    } | null;
    ambulance: {
      id: string;
      identifier: string;
      latitude: number | null;
      longitude: number | null;
      availabilityStatus: string;
    } | null;
  }[];
}

interface ApiAssignmentResult {
  assignmentId: string;
  caseCode: string;
  responderName: string;
  ambulanceName?: string;
}

export default function OperatorPage() {
  const { lang, isUrdu, toggleLang } = useLanguage();
  const t = getTranslation(lang);
  const { user, logout } = useAuth();

  const [cases, setCases] = useState<EmergencyCase[]>(initialMockCases);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>('KC-2026-1048');
  const [isDrawerOpen, setIsDrawerOpen] = useState(true);
  const [activeQueueTab, setActiveQueueTab] = useState<'all_queue' | 'unconfirmed'>('all_queue');
  const [activeFilter, setActiveFilter] = useState<'all' | 'critical' | 'unassigned' | 'medical' | 'rescue'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileView, setMobileView] = useState<'map' | 'queue' | 'unconfirmed'>('map');
  const [dismissToast, setDismissToast] = useState(false);
  const [useGoogleMap, setUseGoogleMap] = useState(false);

  // ─── Milestone 8: Real API state ──────────────────────────
  const [apiActiveCases, setApiActiveCases] = useState<ApiActiveCase[]>([]);
  const [apiCasesLoaded, setApiCasesLoaded] = useState(false);

  // ─── Milestone 9: Voice call state ────────────────────────
  interface VoiceCallInfo {
    id: string;
    status: string;
    callerMasked: string;
    detectedLanguage: string | null;
    turnCount: number;
    startedAt: string;
    humanReviewRequired: boolean;
    transcriptAvailable: boolean;
    caseInfo: {
      caseCode: string;
      urgency: string | null;
      aiSummary: string | null;
      locationText: string | null;
      potentiallyCritical: boolean;
    } | null;
  }
  const [voiceCalls, setVoiceCalls] = useState<VoiceCallInfo[]>([]);

  useEffect(() => {
    setUseGoogleMap(isGoogleMapsConfigured());
  }, []);

  // ─── Milestone 8: Poll active cases from API ─────────────
  useEffect(() => {
    async function fetchActiveCases() {
      try {
        const res = await fetch('/api/operator/cases');
        if (res.ok) {
          const data = await res.json();
          setApiActiveCases(data.cases || []);
          setApiCasesLoaded(true);
        } else {
          setApiCasesLoaded(true);
        }
      } catch {
        // API unavailable — fall back to mock data
        setApiCasesLoaded(true);
      }
    }

    fetchActiveCases();
    const interval = setInterval(fetchActiveCases, 10000);
    return () => clearInterval(interval);
  }, []);

  // ─── Milestone 9: Poll voice calls ────────────────────────
  useEffect(() => {
    async function fetchVoiceCalls() {
      try {
        const res = await fetch('/api/operator/voice-calls');
        if (res.ok) {
          const data = await res.json();
          setVoiceCalls(data.sessions || []);
        }
      } catch {
        // Voice API unavailable — no voice calls to show
      }
    }

    fetchVoiceCalls();
    const interval = setInterval(fetchVoiceCalls, 10000);
    return () => clearInterval(interval);
  }, []);

  const selectedCase = cases.find((c) => c.id === selectedCaseId) || null;

  const criticalCount = cases.filter((c) => c.urgency === 'critical').length;
  const unassignedCount = cases.filter((c) => !c.assignedResource).length;
  const availableRespondersCount = mockReliefResources.filter((r) => r.availability === 'available').length;
  const activeVoiceCalls = voiceCalls.filter((v) => v.status === 'ACTIVE' || v.status === 'PROCESSING').length;
  const voiceReviewCount = voiceCalls.filter((v) => v.humanReviewRequired).length;
  const unconfirmedCases = cases.filter((c) => {
    // Use the real location-unconfirmed logic
    if (isLocationUnconfirmed({
      latitude: c.location.coordinates?.lat,
      longitude: c.location.coordinates?.lng,
      locationConfirmed: !c.location.isApproximate,
    })) return true;
    // Also include cases with approximate flag or no coordinates (backward compat)
    return c.location.isApproximate || !c.location.coordinates;
  });
  const unconfirmedCount = unconfirmedCases.length;

  const standardQueueCases = cases.filter((c) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchId = c.id.toLowerCase().includes(q);
      const matchLoc = c.location.name.toLowerCase().includes(q);
      const matchCategory = c.category.toLowerCase().includes(q);
      if (!matchId && !matchLoc && !matchCategory) return false;
    }
    if (activeFilter === 'critical') return c.urgency === 'critical';
    if (activeFilter === 'unassigned') return !c.assignedResource;
    if (activeFilter === 'medical') return c.category === 'medical';
    if (activeFilter === 'rescue') return c.category === 'rescue';
    return true;
  });

  const sortedUnconfirmedCases = [...unconfirmedCases].sort((a, b) => {
    if (a.urgency === 'critical' && b.urgency !== 'critical') return -1;
    if (b.urgency === 'critical' && a.urgency !== 'critical') return 1;
    return 0;
  });

  const handleSelectCase = useCallback((caseId: string) => {
    setSelectedCaseId(caseId);
    setIsDrawerOpen(true);
  }, []);

  const handleApproveDispatch = useCallback(async (caseId: string, resourceId: string) => {
    // ─── Milestone 8: Try real assignment API first ──────
    // caseId is the mock case ID (e.g. 'KC-2026-1048').
    // The real API uses caseCode. Try to find a matching real case.
    const realCase = apiActiveCases.find((c) => c.caseCode === caseId);
    if (realCase) {
      try {
        // Find available responder from API data
        const availableResponder = await fetch(`/api/operator/cases/${caseId}/assign`)
          .then((r) => r.ok ? r.json() : null)
          .catch(() => null);
        if (availableResponder?.responders?.length > 0) {
          const res = await fetch(`/api/operator/cases/${caseId}/assign`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              responderId: availableResponder.responders[0].id,
              ambulanceId: availableResponder.ambulances?.[0]?.id,
            }),
          });
          if (res.ok) {
            const result: ApiAssignmentResult = await res.json();
            // Assignment succeeded via real API
          }
        }
      } catch {
        // Fall through to mock dispatch
      }
    }

    // Mock dispatch (preserves existing demo behavior)
    setCases((prev) =>
      prev.map((c) => {
        if (c.id !== caseId) return c;
        const resource = mockReliefResources.find((r) => r.id === resourceId);
        if (!resource) return c;
        return {
          ...c,
          status: 'resource_assigned' as const,
          assignedResource: {
            id: resource.id,
            name: resource.name,
            type: resource.type,
            responderName: resource.capacity?.split('•')[1]?.trim() || 'EMT Team',
            responderPhone: resource.phone,
            etaMinutes: 8,
            distanceKm: 3.2,
            currentCoords: resource.coordinates,
          },
        };
      })
    );
  }, [apiActiveCases]);

  const handleChangeUrgency = useCallback((caseId: string, newUrgency: UrgencyLevel) => {
    setCases((prev) => prev.map((c) => (c.id === caseId ? { ...c, urgency: newUrgency } : c)));
  }, []);

  const handleChangeCategory = useCallback((caseId: string, newCategory: EmergencyCategory) => {
    setCases((prev) => prev.map((c) => (c.id === caseId ? { ...c, category: newCategory } : c)));
  }, []);

  const handleAddOperatorNote = useCallback((caseId: string, note: string) => {
    setCases((prev) =>
      prev.map((c) => (c.id === caseId ? { ...c, operatorNotes: [...(c.operatorNotes || []), note] } : c))
    );
  }, []);

  const handleSimulateNewEmergency = useCallback(() => {
    const newCase: EmergencyCase = {
      id: 'KC-2026-1053',
      urgency: 'critical',
      category: 'rescue',
      status: 'operator_reviewing',
      location: { name: 'Near SA Garden, Malir, Karachi', isApproximate: true, city: 'Karachi' },
      requester: { name: 'Unknown Caller', phone: '03XX-XXXXXXX' },
      rawMessage: 'Building collapse reported, multiple people trapped.',
      timestamp: 'Just now',
      source: 'voice_call',
      aiAnalysis: {
        summary: 'Structural collapse with multiple casualties trapped. Heavy rescue team needed immediately.',
        summaryUr: 'عمارت گر گئی، متعدد افراد پھنسے ہوئے۔ بھاری ریسکیو ٹیم فوری درکار۔',
        reasoning: 'Building collapse with trapped occupants requires immediate heavy rescue dispatch.',
        keyNeeds: ['Heavy Rescue Equipment', 'Search Dogs', 'Trauma Ambulances'],
        peopleCount: 8,
        detectedLanguage: 'Urdu',
        confidence: 0.88,
        missingInfo: ['Exact building location', 'Number of floors'],
      },
      timeline: [
        { step: 'submitted', label: 'Voice Call Received', labelUr: 'فون کال موصول', time: '14:30', completed: true },
        { step: 'ai_reviewed', label: 'AI Triage', labelUr: 'AI تجزیہ', time: '14:30', completed: true, current: true },
        { step: 'operator_reviewing', label: 'Operator Reviewing', labelUr: 'آپریٹر جائزہ', time: '--:--', completed: false },
        { step: 'resource_assigned', label: 'Resource Assigned', labelUr: 'وسائل تفویض', time: '--:--', completed: false },
        { step: 'en_route', label: 'En Route', labelUr: 'راستے میں', time: '--:--', completed: false },
        { step: 'arrived', label: 'Arrived', labelUr: 'پہنچ گئے', time: '--:--', completed: false },
        { step: 'completed', label: 'Completed', labelUr: 'مکمل', time: '--:--', completed: false },
      ],
    };
    setCases((prev) => [newCase, ...prev]);
    setDismissToast(false);
  }, []);

  const latestCriticalAlert = cases.find((c) => c.urgency === 'critical' && !c.assignedResource);

  return (
    <AuthGuard requiredRole="OPERATOR">
    <div dir={isUrdu ? 'rtl' : 'ltr'} className="min-h-screen bg-[#080B10] text-[#E6EDF3] flex flex-col font-sans selection:bg-blue-600/30 selection:text-blue-200">
      {/* 1. TOP COMPACT OPERATOR COMMAND BAR */}
      <header className="bg-[#11161F] border-b border-[#30363D] px-4 sm:px-6 py-2.5 shrink-0 z-30">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold shadow-md shadow-blue-900/30 shrink-0">
              <Radio className="w-4 h-4 animate-pulse" />
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-extrabold text-white text-sm sm:text-base tracking-tight truncate">{t.brand}</span>
              <span className="text-gray-500 hidden sm:inline">•</span>
              <span className="text-xs text-gray-300 font-semibold hidden sm:inline">{isUrdu ? 'کمانڈ کنٹرول روم' : 'Operator Command Center'}</span>
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-mono font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                <span>LIVE</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {user && (
              <div className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-xl bg-[#0B0E14] border border-[#30363D] text-xs">
                <div className="w-6 h-6 rounded-full bg-blue-600/30 border border-blue-500/50 text-blue-300 flex items-center justify-center font-bold text-[10px]">{(user.name || 'O').charAt(0)}</div>
                <div className="text-[11px] leading-tight">
                  <span className="font-bold text-white block">{user.name}</span>
                  <span className="text-[10px] text-gray-400 font-mono">
                    {isUrdu ? 'ڈیمو آپریٹر' : 'Demo Operator'}
                  </span>
                </div>
                <button onClick={logout} className="p-1 text-gray-500 hover:text-red-400 transition-colors" title="Logout">
                  <LogOut className="w-3 h-3" />
                </button>
              </div>
            )}
            <div className="relative">
              <button className="p-2 rounded-xl bg-[#0B0E14] hover:bg-[#161B22] border border-[#30363D] text-gray-300 hover:text-white transition-colors relative" title="Alerts">
                <Bell className="w-4 h-4" />
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500 animate-ping" />
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500" />
              </button>
            </div>
            <button onClick={toggleLang} className="px-2.5 py-1.5 rounded-xl bg-[#0B0E14] hover:bg-[#161B22] border border-[#30363D] text-xs font-mono text-gray-200 hover:text-white transition-colors flex items-center gap-1.5" title="Toggle Language">
              <Globe className="w-3.5 h-3.5 text-blue-400" />
              <span>{lang === 'en' ? 'اردو' : 'English'}</span>
            </button>
            <button onClick={handleSimulateNewEmergency} className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 font-bold text-xs transition-colors active:scale-95" title="Simulate Alert">
              <Plus className="w-3.5 h-3.5" />
              <span>{isUrdu ? 'سمولیٹ' : 'Simulate'}</span>
            </button>
            <Link href="/" className="px-2.5 py-1.5 rounded-xl bg-[#0B0E14] hover:bg-red-950/40 border border-[#30363D] hover:border-red-500/40 text-gray-400 hover:text-red-300 text-xs font-semibold transition-colors flex items-center gap-1.5" title="Citizen View">
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{isUrdu ? 'شہری' : 'Citizen'}</span>
            </Link>
          </div>
        </div>
      </header>

      {/* 2. TOP SUMMARY METRICS STRIP */}
      <section className="bg-[#0B0E14] border-b border-[#30363D] px-4 sm:px-6 py-2.5 shrink-0">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 sm:gap-3">
          <div onClick={() => { setActiveQueueTab('all_queue'); setActiveFilter('critical'); }} className="p-2.5 sm:p-3 rounded-xl bg-[#11161F] border border-red-500/40 hover:border-red-500/70 transition-all cursor-pointer flex items-center justify-between gap-2 shadow-sm">
            <div className="min-w-0">
              <span className="text-[10px] font-mono text-red-400 uppercase tracking-wider block">{isUrdu ? 'شدید' : '1. Critical'}</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-lg sm:text-xl font-black text-red-300 font-mono">{criticalCount}</span>
                <span className="text-[11px] text-red-400/80 font-medium">{isUrdu ? 'فوری' : 'Urgent'}</span>
              </div>
            </div>
            <div className="w-8 h-8 rounded-lg bg-red-600/20 text-red-400 flex items-center justify-center shrink-0">
              <AlertOctagon className="w-4 h-4 animate-pulse" />
            </div>
          </div>

          <div onClick={() => { setActiveQueueTab('all_queue'); setActiveFilter('unassigned'); }} className="p-2.5 sm:p-3 rounded-xl bg-[#11161F] border border-amber-500/40 hover:border-amber-500/70 transition-all cursor-pointer flex items-center justify-between gap-2 shadow-sm">
            <div className="min-w-0">
              <span className="text-[10px] font-mono text-amber-400 uppercase tracking-wider block">{isUrdu ? 'بغیر تفویض' : '2. Unassigned'}</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-lg sm:text-xl font-black text-amber-300 font-mono">{unassignedCount}</span>
                <span className="text-[11px] text-amber-400/80 font-medium">{isUrdu ? 'زیر التوا' : 'Pending'}</span>
              </div>
            </div>
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4" />
            </div>
          </div>

          <div className="p-2.5 sm:p-3 rounded-xl bg-[#11161F] border border-emerald-500/40 flex items-center justify-between gap-2 shadow-sm">
            <div className="min-w-0">
              <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-wider block">{isUrdu ? 'ریسپونڈرز' : '3. Responders'}</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-lg sm:text-xl font-black text-emerald-300 font-mono">{availableRespondersCount}</span>
                <span className="text-[11px] text-emerald-400/80 font-medium">{isUrdu ? 'دستیاب' : 'Available'}</span>
              </div>
            </div>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <Ambulance className="w-4 h-4" />
            </div>
          </div>

          <div onClick={() => setActiveQueueTab('unconfirmed')} className={`p-2.5 sm:p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 shadow-sm ${
            activeQueueTab === 'unconfirmed' ? 'bg-amber-950/40 border-amber-400 ring-1 ring-amber-400/40' : 'bg-[#11161F] border-amber-500/40 hover:border-amber-400'
          }`}>
            <div className="min-w-0">
              <span className="text-[10px] font-mono text-amber-400 uppercase tracking-wider block">{isUrdu ? 'GPS نہیں' : '4. No GPS Fix'}</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-lg sm:text-xl font-black text-amber-300 font-mono">{unconfirmedCount}</span>
                <span className="text-[11px] text-amber-400/80 font-medium">{isUrdu ? 'غیر تصدیق' : 'Unconfirmed'}</span>
              </div>
            </div>
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
              <MapPin className="w-4 h-4" />
            </div>
          </div>

          {/* Milestone 9: Voice Calls */}
          <div className={`p-2.5 sm:p-3 rounded-xl border flex items-center justify-between gap-2 shadow-sm ${
            activeVoiceCalls > 0 ? 'bg-purple-950/40 border-purple-400/60' : 'bg-[#11161F] border-purple-500/30'
          }`}>
            <div className="min-w-0">
              <span className="text-[10px] font-mono text-purple-400 uppercase tracking-wider block">{isUrdu ? 'وائس کال' : '5. Voice Calls'}</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-lg sm:text-xl font-black text-purple-300 font-mono">{activeVoiceCalls}</span>
                <span className="text-[11px] text-purple-400/80 font-medium">{isUrdu ? 'فعال' : 'Active'}</span>
                {voiceReviewCount > 0 && (
                  <span className="text-[9px] font-mono font-bold text-amber-300 bg-amber-500/20 px-1 rounded">{voiceReviewCount} review</span>
                )}
              </div>
            </div>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
              activeVoiceCalls > 0 ? 'bg-purple-500/30 text-purple-300' : 'bg-purple-500/10 text-purple-500'
            }`}>
              <Mic className="w-4 h-4" />
              {activeVoiceCalls > 0 && <span className="absolute w-2 h-2 rounded-full bg-purple-400 animate-ping" />}
            </div>
          </div>
        </div>
      </section>

      {/* MOBILE VIEW SELECTOR BAR */}
      <div className="lg:hidden bg-[#11161F] border-b border-[#30363D] p-2 flex items-center justify-around gap-2 text-xs font-semibold shrink-0">
        <button onClick={() => setMobileView('map')} className={`flex-1 py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 transition-all ${mobileView === 'map' ? 'bg-blue-600 text-white font-bold' : 'text-gray-400 hover:text-white bg-[#0B0E14]'}`}>
          <Compass className="w-3.5 h-3.5" /><span>{isUrdu ? 'نقشہ' : 'GIS Map'}</span>
        </button>
        <button onClick={() => { setMobileView('queue'); setActiveQueueTab('all_queue'); }} className={`flex-1 py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 transition-all ${mobileView === 'queue' && activeQueueTab === 'all_queue' ? 'bg-blue-600 text-white font-bold' : 'text-gray-400 hover:text-white bg-[#0B0E14]'}`}>
          <Activity className="w-3.5 h-3.5" /><span>{isUrdu ? 'قطار' : 'Queue'} ({standardQueueCases.length})</span>
        </button>
        <button onClick={() => { setMobileView('unconfirmed'); setActiveQueueTab('unconfirmed'); }} className={`flex-1 py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 transition-all ${mobileView === 'unconfirmed' || activeQueueTab === 'unconfirmed' ? 'bg-amber-600 text-white font-bold' : 'text-amber-400/80 bg-[#0B0E14]'}`}>
          <AlertTriangle className="w-3.5 h-3.5" /><span>No GPS ({unconfirmedCount})</span>
        </button>
      </div>

      {/* 3. MAIN WORKSPACE */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        {/* LEFT/CENTER: HERO LIVE MAP */}
        <div className={`flex-1 flex flex-col p-3 sm:p-4 relative overflow-hidden ${mobileView !== 'map' ? 'hidden lg:flex' : 'flex'}`}>
          {/* Floating Critical Alert Toast */}
          {latestCriticalAlert && !dismissToast && (
            <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20 w-[92%] max-w-md p-3 rounded-2xl bg-[#161B22]/95 backdrop-blur-xl border border-red-500/60 shadow-2xl flex items-center justify-between gap-3 animate-in slide-in-from-top-4">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-mono font-black text-red-300">{latestCriticalAlert.id}</span>
                    <span className="text-gray-400">•</span>
                    <span className="text-white font-bold capitalize truncate">{latestCriticalAlert.category}</span>
                    <span className="text-gray-400">•</span>
                    <span className="text-gray-400 text-[11px] truncate">{latestCriticalAlert.location.name.split(',')[0]}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => handleSelectCase(latestCriticalAlert.id)} className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-xs transition-colors">{isUrdu ? 'دیکھیں' : 'View'}</button>
                <button onClick={() => setDismissToast(true)} className="p-1 text-gray-400 hover:text-white">✕</button>
              </div>
            </div>
          )}

          <div className="flex-1 rounded-2xl overflow-hidden border border-[#30363D] relative shadow-inner">
            {useGoogleMap ? (
              <GoogleMap
                center={selectedCase?.location.coordinates
                  ? { latitude: selectedCase.location.coordinates.lat, longitude: selectedCase.location.coordinates.lng }
                  : null}
                markers={(() => {
                  const markers: MapMarkerData[] = [];
                  // Emergency markers
                  cases.forEach((c) => {
                    if (c.location.coordinates) {
                      markers.push({
                        id: c.id,
                        type: 'EMERGENCY',
                        position: { latitude: c.location.coordinates.lat, longitude: c.location.coordinates.lng },
                        title: `${c.id} • ${c.category.toUpperCase()}`,
                        subtitle: c.location.name,
                        urgency: c.urgency === 'critical' ? 'CRITICAL' : c.urgency === 'high' ? 'HIGH' : c.urgency === 'medium' ? 'MEDIUM' : 'LOW',
                      });
                    }
                  });
                  // Resource markers
                  mockReliefResources.forEach((r) => {
                    markers.push({
                      id: r.id,
                      type: r.type === 'ambulance' ? 'AMBULANCE' : 'RESOURCE',
                      position: { latitude: r.coordinates.lat, longitude: r.coordinates.lng },
                      title: r.name,
                      subtitle: r.address,
                      category: r.type,
                      available: r.availability === 'available',
                    });
                  });
                  // ─── Milestone 8: Real responder/ambulance markers from API ───
                  apiActiveCases.forEach((c) => {
                    c.assignments.forEach((a) => {
                      if (a.responder?.latitude && a.responder?.longitude) {
                        markers.push({
                          id: `resp-${a.responder.id}`,
                          type: 'RESOURCE',
                          position: { latitude: a.responder.latitude, longitude: a.responder.longitude },
                          title: a.responder.name,
                          subtitle: a.status,
                          available: a.responder.availabilityStatus === 'AVAILABLE',
                        });
                      }
                      if (a.ambulance?.latitude && a.ambulance?.longitude) {
                        markers.push({
                          id: `amb-${a.ambulance.id}`,
                          type: 'AMBULANCE',
                          position: { latitude: a.ambulance.latitude, longitude: a.ambulance.longitude },
                          title: a.ambulance.identifier,
                          subtitle: a.status,
                          available: a.ambulance.availabilityStatus === 'AVAILABLE',
                        });
                      }
                    });
                  });
                  return markers;
                })()}
                onMarkerClick={(marker) => {
                  const c = cases.find((c) => c.id === marker.id);
                  if (c) handleSelectCase(c.id);
                }}
                heightClass="h-full min-h-[450px]"
                className="rounded-2xl"
              />
            ) : (
              <InteractiveMap
                cases={cases}
                resources={mockReliefResources}
                selectedCaseId={selectedCaseId}
                onSelectCase={handleSelectCase}
                onQuickAssign={handleApproveDispatch}
                heightClass="h-full min-h-[450px]"
                lang={lang}
              />
            )}
          </div>
        </div>

        {/* RIGHT: COMPACT LIVE EMERGENCY QUEUE */}
        <div className={`w-full lg:w-[400px] xl:w-[440px] bg-[#11161F] border-l border-[#30363D] flex flex-col shrink-0 overflow-hidden ${mobileView === 'map' ? 'hidden lg:flex' : 'flex'}`}>
          <div className="p-3.5 border-b border-[#30363D] bg-[#0B0E14]/60 space-y-3 shrink-0">
            <div className="flex rounded-xl bg-[#161B22] p-1 border border-[#30363D]">
              <button onClick={() => setActiveQueueTab('all_queue')} className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${activeQueueTab === 'all_queue' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}>
                <Activity className="w-3.5 h-3.5" /><span>{isUrdu ? 'لائیو قطار' : 'Live Queue'} ({cases.length})</span>
              </button>
              <button onClick={() => setActiveQueueTab('unconfirmed')} className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${activeQueueTab === 'unconfirmed' ? 'bg-amber-600 text-white shadow' : 'text-amber-400 hover:text-amber-200'}`}>
                <MapPin className="w-3.5 h-3.5" /><span>No GPS ({unconfirmedCount})</span>
              </button>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isUrdu ? 'آئی ڈی، مقام، یا ٹیگ تلاش کریں...' : 'Search ID, location, or tag...'}
                className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-[#161B22] border border-[#30363D] text-xs text-white placeholder:text-gray-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            {activeQueueTab === 'all_queue' && (
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-0.5 text-[11px] font-semibold">
                {[
                  { id: 'all', label: isUrdu ? 'سب' : 'All' },
                  { id: 'critical', label: isUrdu ? 'شدید' : 'Critical' },
                  { id: 'unassigned', label: isUrdu ? 'بغیر تفویض' : 'Unassigned' },
                  { id: 'medical', label: isUrdu ? 'طبی' : 'Medical' },
                  { id: 'rescue', label: isUrdu ? 'ریسکیو' : 'Rescue' },
                ].map((chip) => (
                  <button key={chip.id} onClick={() => setActiveFilter(chip.id as typeof activeFilter)} className={`px-2.5 py-1 rounded-lg border whitespace-nowrap transition-all ${activeFilter === chip.id ? 'bg-blue-600 text-white border-blue-500 font-bold' : 'bg-[#161B22] text-gray-400 hover:text-gray-200 border-[#30363D]'}`}>
                    {chip.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* QUEUE CARDS LIST */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5 scrollbar-thin">
            {activeQueueTab === 'all_queue' && (
              <>
                {standardQueueCases.map((item) => {
                  const isSelected = selectedCaseId === item.id;
                  const isCrit = item.urgency === 'critical';
                  const isVoice = item.source === 'voice_call';
                  return (
                    <div key={item.id} onClick={() => handleSelectCase(item.id)} className={`p-3 rounded-2xl border transition-all cursor-pointer relative space-y-2 ${isSelected ? 'bg-[#161B22] border-blue-500 shadow-xl ring-1 ring-blue-500/50' : isCrit ? 'bg-[#11161F] border-red-500/40 hover:border-red-500/80' : 'bg-[#11161F] border-[#30363D] hover:border-gray-500'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono font-black text-white text-xs tracking-tight">{item.id}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${isCrit ? 'bg-red-500/20 text-red-300 border border-red-500/40' : item.urgency === 'high' ? 'bg-amber-500/20 text-amber-300' : 'bg-blue-500/20 text-blue-300'}`}>
                            {item.urgency} • {item.category}
                          </span>
                          {isVoice && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] font-mono font-bold flex items-center gap-0.5">
                              <Mic className="w-2.5 h-2.5" /><span>VOICE</span>
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-mono text-gray-400 shrink-0">{item.timestamp}</span>
                      </div>
                      <div className="text-xs font-semibold text-gray-200 flex items-center gap-1.5 truncate">
                        <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <span className="truncate">{item.location.name}</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] pt-1 border-t border-[#30363D]/60 font-mono">
                        {item.assignedResource ? (
                          <span className="text-emerald-400 font-bold flex items-center gap-1">
                            <Ambulance className="w-3 h-3" />
                            <span>EN ROUTE: {item.assignedResource.name.split(' ').slice(0, 2).join(' ')}</span>
                          </span>
                        ) : (
                          <span className="text-amber-400 font-bold flex items-center gap-1">
                            <Clock className="w-3 h-3" /><span>{isUrdu ? 'بغیر تفویض' : 'UNASSIGNED'}</span>
                          </span>
                        )}
                        <span className="text-blue-400 text-[10px] flex items-center gap-0.5 font-sans font-bold">
                          <span>{isUrdu ? 'تفصیلات' : 'Details'}</span>
                          <ChevronRight className="w-3 h-3" />
                        </span>
                      </div>
                    </div>
                  );
                })}
                {standardQueueCases.length === 0 && (
                  <div className="text-center py-10 text-gray-400 text-xs">{isUrdu ? 'کوئی مماثل کیس نہیں ملا' : 'No matching incidents found in queue.'}</div>
                )}
              </>
            )}

            {activeQueueTab === 'unconfirmed' && (
              <>
                <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/40 text-xs text-amber-200/90 space-y-1 mb-2">
                  <div className="font-bold flex items-center gap-1.5 text-amber-300">
                    <AlertTriangle className="w-4 h-4" />
                    <span>{isUrdu ? 'غیر تصدیق شدہ مقامات' : 'Location Unconfirmed Incidents'}</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">{t.unconfirmedNotice}</p>
                </div>
                {sortedUnconfirmedCases.map((item) => {
                  const isSelected = selectedCaseId === item.id;
                  const isCrit = item.urgency === 'critical';
                  return (
                    <div key={item.id} onClick={() => handleSelectCase(item.id)} className={`p-3.5 rounded-2xl border transition-all cursor-pointer space-y-2.5 ${isSelected ? 'bg-[#161B22] border-amber-400 ring-1 ring-amber-400/50 shadow-xl' : isCrit ? 'bg-[#11161F] border-red-500/50 hover:border-red-400' : 'bg-[#11161F] border-amber-500/40 hover:border-amber-400'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-black text-white text-xs">{item.id}</span>
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-red-500/20 text-red-300 border border-red-500/30">{item.urgency} • {item.category}</span>
                        </div>
                        <span className="text-[10px] font-mono text-gray-400">{item.timestamp}</span>
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs font-bold text-white">&quot;{item.location.name}&quot;</div>
                        <div className="text-[11px] text-amber-400/90 font-mono flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 shrink-0" />
                          <span>{isUrdu ? 'مقام دستیاب نہیں' : 'Exact location unavailable (Cell tower estimate)'}</span>
                        </div>
                      </div>
                      <div className="pt-1 flex items-center gap-2">
                        <a href={`tel:${item.requester.phone}`} onClick={(e) => e.stopPropagation()} className="flex-1 py-1.5 px-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-sm">
                          <MapPin className="w-3.5 h-3.5" /><span>{t.contactForLocation}</span>
                        </a>
                        <button onClick={() => handleSelectCase(item.id)} className="py-1.5 px-3 rounded-xl bg-[#0B0E14] hover:bg-[#161B22] border border-[#30363D] text-gray-300 text-xs font-semibold">{isUrdu ? 'ٹرائیج' : 'Triage'}</button>
                      </div>
                    </div>
                  );
                })}
                {sortedUnconfirmedCases.length === 0 && (
                  <div className="text-center py-10 text-gray-400 text-xs">{isUrdu ? 'تمام کیسز کی GPS تصدیق ہو چکی ہے' : 'All current active cases have verified GPS telemetry.'}</div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* 4. DETAIL DRAWER */}
      {isDrawerOpen && selectedCase && (
        <OperatorCaseDrawer
          selectedCase={selectedCase}
          onClose={() => setIsDrawerOpen(false)}
          onApproveDispatch={handleApproveDispatch}
          onChangeUrgency={handleChangeUrgency}
          onChangeCategory={handleChangeCategory}
          onAddOperatorNote={handleAddOperatorNote}
        />
      )}
    </div>
    </AuthGuard>
  );
}
