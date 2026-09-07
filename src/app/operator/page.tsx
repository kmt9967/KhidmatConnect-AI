'use client';

import { useState, useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  Ambulance,
  Bell,
  ChevronRight,
  Clock,
  Compass,
  ExternalLink,
  Globe,
  LogOut,
  MapPin,
  Mic,
  Navigation,
  Radio,
  Search,
} from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import { getTranslation } from '@/i18n/translations';
import InteractiveMap from '@/components/InteractiveMap';
import GoogleMap from '@/components/maps/GoogleMap';
import { isGoogleMapsConfigured } from '@/lib/maps/googleMapsLoader';
import { DEFAULT_MAP_ZOOM, type MapMarkerData } from '@/lib/maps/types';
import { queueMarkersFromCases } from '@/lib/maps/operatorMap';
import { googleMapsViewUrl, googleMapsDirectionsUrl } from '@/lib/maps/externalLinks';
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

export default function OperatorPage() {
  const { lang, isUrdu, toggleLang } = useLanguage();
  const t = getTranslation(lang);
  const { user, logout } = useAuth();

  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  // Marker whose info card is open on the map. Owned here so the queue list
  // and the map can both drive it, and so polling never force-closes it.
  const [openInfoId, setOpenInfoId] = useState<string | null>(null);
  const [activeQueueTab, setActiveQueueTab] = useState<'all_queue' | 'unconfirmed'>('all_queue');
  const [activeFilter, setActiveFilter] = useState<'all' | 'critical' | 'unassigned' | 'medical' | 'rescue'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileView, setMobileView] = useState<'map' | 'queue' | 'unconfirmed'>('map');
  const [dismissToast, setDismissToast] = useState(false);
  const [useGoogleMap, setUseGoogleMap] = useState(false);

  // ─── Milestone 8: Real API state ──────────────────────────
  const [apiActiveCases, setApiActiveCases] = useState<ApiActiveCase[]>([]);
  const [apiCasesLoaded, setApiCasesLoaded] = useState(false);
  const [apiCounts, setApiCounts] = useState<{ availableResponders: number; availableAmbulances: number }>({ availableResponders: 0, availableAmbulances: 0 });

  // ── Real API queue ──────────────────────────────────────
  // queueCases = live DB records once the API has loaded.
  const queueCases = apiCasesLoaded ? apiActiveCases : [];

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
          if (data.counts) setApiCounts(data.counts);
          setApiCasesLoaded(true);
        } else {
          setApiCasesLoaded(true);
        }
      } catch {
        // API unavailable — show empty queue rather than stale data
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

  const selectedApiCase = apiActiveCases.find((c) => c.caseCode === selectedCaseId) || null;

  // ─── Counts derived from real API data ────────────────────
  const criticalCount = queueCases.filter((c) => c.urgency === 'CRITICAL').length;
  const unassignedCount = queueCases.filter((c) => c.assignments.length === 0).length;
  const availableRespondersCount = apiCounts.availableResponders;
  const availableAmbulancesCount = apiCounts.availableAmbulances;
  const activeVoiceCalls = voiceCalls.filter((v) => v.status === 'ACTIVE' || v.status === 'PROCESSING').length;
  const voiceReviewCount = voiceCalls.filter((v) => v.humanReviewRequired).length;
  const unconfirmedCases = queueCases.filter((c) => !c.locationConfirmed || (c.latitude == null && c.longitude == null));
  const unconfirmedCount = unconfirmedCases.length;

  // ─── Filters on real API data ─────────────────────────────
  const standardQueueCases = queueCases.filter((c) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchId = c.caseCode.toLowerCase().includes(q);
      const matchLoc = (c.locationText || '').toLowerCase().includes(q);
      const matchCategory = c.categories.some((cat) => cat.toLowerCase().includes(q));
      if (!matchId && !matchLoc && !matchCategory) return false;
    }
    if (activeFilter === 'critical') return c.urgency === 'CRITICAL';
    if (activeFilter === 'unassigned') return c.assignments.length === 0;
    if (activeFilter === 'medical') return c.categories.some((cat) => cat === 'MEDICAL');
    if (activeFilter === 'rescue') return c.categories.some((cat) => cat === 'RESCUE');
    return true;
  });

  const sortedUnconfirmedCases = [...unconfirmedCases].sort((a, b) => {
    if (a.urgency === 'CRITICAL' && b.urgency !== 'CRITICAL') return -1;
    if (b.urgency === 'CRITICAL' && a.urgency !== 'CRITICAL') return 1;
    return 0;
  });

  // Clicking a queue card selects it on the map; the Details link opens the real case page.
  const handleSelectCase = useCallback((caseId: string) => {
    setSelectedCaseId(caseId);
    setOpenInfoId(caseId);
  }, []);

  // ─── Operator map wiring ──────────────────────────────────
  // Markers are rebuilt from the polled cases, but GoogleMap reconciles by id
  // so unchanged markers keep their Google object (and any open info card).
  const mapMarkers = useMemo(() => queueMarkersFromCases(apiActiveCases), [apiActiveCases]);

  // Value-memoized focus point: identity is stable across polls while the
  // selected case coordinates do not change, so the map never re-pans on refresh.
  const selectedLat = selectedApiCase?.latitude ?? null;
  const selectedLng = selectedApiCase?.longitude ?? null;
  const mapCenter = useMemo(
    () => (selectedLat != null && selectedLng != null ? { latitude: selectedLat, longitude: selectedLng } : null),
    [selectedLat, selectedLng],
  );

  // Latest cases kept in a ref so the info-card renderer stays referentially
  // stable (its identity must not change on every poll).
  const casesRef = useRef<ApiActiveCase[]>(apiActiveCases);
  casesRef.current = apiActiveCases;
  // Per-card DOM refs so a marker click can scroll the matching queue card into view.
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const handleMarkerClick = useCallback((marker: MapMarkerData) => {
    if (marker.type === 'EMERGENCY') {
      setSelectedCaseId(marker.id);
      setOpenInfoId(marker.id);
      cardRefs.current[marker.id]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      setOpenInfoId(marker.id);
    }
  }, []);

  const handleInfoClose = useCallback(() => setOpenInfoId(null), []);

  const infoActionClass =
    'inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500';

  // Renders the marker info card. Mounted into the InfoWindow via a dedicated
  // React root, so it uses plain anchors (no router/context) and captured t/isUrdu.
  const renderInfoCard = useCallback(
    (marker: MapMarkerData): ReactNode => {
      const isEmergency = marker.type === 'EMERGENCY';
      const apiCase = isEmergency ? casesRef.current.find((c) => c.caseCode === marker.id) : undefined;
      const urgency = marker.urgency;
      const uColor =
        urgency === 'CRITICAL' ? '#F85149' : urgency === 'HIGH' ? '#F0883E' : urgency === 'MEDIUM' ? '#D29922' : urgency === 'LOW' ? '#3FB950' : '#58A6FF';
      const point = marker.position;
      const reportedAt = apiCase
        ? new Date(apiCase.createdAt).toLocaleString('en-PK', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
        : null;
      return (
        <div dir={isUrdu ? 'rtl' : 'ltr'} className="p-3 space-y-2 min-w-[230px] max-w-[300px]">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-mono font-black text-sm text-white truncate">{isEmergency ? marker.id : marker.title}</div>
              {reportedAt && (
                <div className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1">
                  <Clock className="w-3 h-3" />{t.mapReportedAt}: {reportedAt}
                </div>
              )}
            </div>
            {urgency && (
              <span
                className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider"
                style={{ background: `${uColor}22`, color: uColor, border: `1px solid ${uColor}66` }}
              >
                {urgency}
              </span>
            )}
          </div>

          {isEmergency && apiCase?.categories?.[0] && (
            <div className="text-[10px] font-bold text-blue-300 uppercase tracking-wider">{apiCase.categories[0]}</div>
          )}

          <div className="text-xs text-gray-200 leading-snug flex items-start gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
            <span>{marker.subtitle || apiCase?.locationText || '—'}</span>
          </div>

          <div className="text-[11px] text-gray-400">
            {t.mapStatus}: <span className="font-bold text-gray-200">{isEmergency ? apiCase?.status ?? '—' : marker.subtitle}</span>
          </div>

          <div className="flex flex-wrap gap-1.5 pt-1 border-t border-[#30363D]/60">
            {isEmergency && (
              <a href={`/operator/cases/${marker.id}`} className={`${infoActionClass} bg-blue-600 text-white border-blue-500 hover:bg-blue-500`}>
                <ChevronRight className="w-3 h-3" />{t.mapViewCase}
              </a>
            )}
            <a
              href={googleMapsViewUrl(point)}
              target="_blank"
              rel="noopener noreferrer"
              className={`${infoActionClass} bg-[#0B0E14] text-gray-200 border-[#30363D] hover:text-white hover:border-gray-500`}
            >
              <ExternalLink className="w-3 h-3" />{t.mapOpenInMaps}
            </a>
            <a
              href={googleMapsDirectionsUrl(point)}
              target="_blank"
              rel="noopener noreferrer"
              className={`${infoActionClass} bg-[#0B0E14] text-gray-200 border-[#30363D] hover:text-white hover:border-gray-500`}
            >
              <Navigation className="w-3 h-3" />{t.mapNavigate}
            </a>
          </div>
        </div>
      );
    },
    [t, isUrdu],
  );

  // ─── latestCriticalAlert from real data ───────────────────
  const latestCriticalAlert = queueCases.find((c) => c.urgency === 'CRITICAL' && c.assignments.length === 0);

  return (
    <AuthGuard requiredRole="OPERATOR">
    <div dir={isUrdu ? 'rtl' : 'ltr'} className="min-h-screen lg:h-screen lg:overflow-hidden bg-[#080B10] text-[#E6EDF3] flex flex-col font-sans selection:bg-blue-600/30 selection:text-blue-200">
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
                <span className="text-[10px] text-emerald-400/60 font-mono">+{availableAmbulancesCount}amb</span>
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
          {/* Floating Critical Alert Toast — from real API data */}
          {latestCriticalAlert && !dismissToast && (
            <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20 w-[92%] max-w-md p-3 rounded-2xl bg-[#161B22]/95 backdrop-blur-xl border border-red-500/60 shadow-2xl flex items-center justify-between gap-3 animate-in slide-in-from-top-4">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-mono font-black text-red-300">{latestCriticalAlert.caseCode}</span>
                    <span className="text-gray-400">•</span>
                    <span className="text-white font-bold capitalize truncate">{latestCriticalAlert.categories[0] || 'EMERGENCY'}</span>
                    <span className="text-gray-400">•</span>
                    <span className="text-gray-400 text-[11px] truncate">{(latestCriticalAlert.locationText || '').split(',')[0]}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Link href={`/operator/cases/${latestCriticalAlert.caseCode}`} onClick={() => setSelectedCaseId(latestCriticalAlert.caseCode)} className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-xs transition-colors">{isUrdu ? 'دیکھیں' : 'View'}</Link>
                <button onClick={() => setDismissToast(true)} className="p-1 text-gray-400 hover:text-white">✕</button>
              </div>
            </div>
          )}

          {/* lg:flex-1 (not flex-1): below lg the root height is indefinite
              (min-h-screen), so a grown wrapper height is not definite for the
              shell's h-full and the shell falls back to min-h-[450px] — which
              left empty space inside the border on tall tablet viewports.
              Sizing the card to content below lg keeps the border tight. */}
          <div className="lg:flex-1 rounded-2xl overflow-hidden border border-[#30363D] relative shadow-inner">
            {useGoogleMap ? (
              <GoogleMap
                center={mapCenter}
                markers={mapMarkers}
                selectedMarkerId={selectedCaseId}
                openInfoMarkerId={openInfoId}
                onInfoClose={handleInfoClose}
                onMarkerClick={handleMarkerClick}
                infoCard={renderInfoCard}
                focusZoom={selectedApiCase ? 15 : DEFAULT_MAP_ZOOM}
                recenterLabel={t.mapBackToCase}
                fullscreenLabel={t.mapFullscreen}
                exitFullscreenLabel={t.mapExitFullscreen}
                heightClass="h-full min-h-[450px]"
                className="rounded-2xl"
              />
            ) : (
              <InteractiveMap
                selectedCaseId={selectedCaseId}
                onSelectCase={handleSelectCase}
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
                <Activity className="w-3.5 h-3.5" /><span>{isUrdu ? 'لائیو قطار' : 'Live Queue'} ({queueCases.length})</span>
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

          {/* QUEUE CARDS LIST — real API cases */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5 scrollbar-thin">
            {activeQueueTab === 'all_queue' && (
              <>
                {!apiCasesLoaded && (
                  <div className="text-center py-10 text-gray-400 text-xs flex items-center justify-center gap-2">
                    <Clock className="w-4 h-4 animate-spin" /> Loading live cases...
                  </div>
                )}
                {apiCasesLoaded && standardQueueCases.length === 0 && queueCases.length === 0 && (
                  <div className="text-center py-10 text-gray-400 text-xs">{isUrdu ? 'کوئی فعال ایمرجنسی کیس نہیں' : 'No active emergency cases'}</div>
                )}
                {apiCasesLoaded && standardQueueCases.length === 0 && queueCases.length > 0 && (
                  <div className="text-center py-10 text-gray-400 text-xs">{isUrdu ? 'کوئی مماثل کیس نہیں ملا' : 'No matching incidents found in queue.'}</div>
                )}
                {standardQueueCases.map((item) => {
                  const isSelected = selectedCaseId === item.caseCode;
                  const isCrit = item.urgency === 'CRITICAL';
                  const isHigh = item.urgency === 'HIGH';
                  const activeAssignment = item.assignments.find((a) =>
                    ['PENDING', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED'].includes(a.status)
                  );
                  const primaryCategory = item.categories[0] || '';
                  return (
                    <div key={item.caseCode} ref={(el) => { cardRefs.current[item.caseCode] = el; }} onClick={() => { handleSelectCase(item.caseCode); }} className={`p-3 rounded-2xl border transition-all cursor-pointer relative space-y-2 ${isSelected ? 'bg-[#161B22] border-blue-500 shadow-xl ring-1 ring-blue-500/50' : isCrit ? 'bg-[#11161F] border-red-500/40 hover:border-red-500/80' : 'bg-[#11161F] border-[#30363D] hover:border-gray-500'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono font-black text-white text-xs tracking-tight">{item.caseCode}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${isCrit ? 'bg-red-500/20 text-red-300 border border-red-500/40' : isHigh ? 'bg-amber-500/20 text-amber-300' : 'bg-blue-500/20 text-blue-300'}`}>
                            {item.urgency}{primaryCategory ? ` • ${primaryCategory}` : ''}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-gray-400 shrink-0">{new Date(item.createdAt).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div className="text-xs font-semibold text-gray-200 flex items-center gap-1.5 truncate">
                        <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <span className="truncate">{item.locationText || 'No location'}</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] pt-1 border-t border-[#30363D]/60 font-mono">
                        {activeAssignment ? (
                          <span className="text-emerald-400 font-bold flex items-center gap-1">
                            <Ambulance className="w-3 h-3" />
                            <span>{activeAssignment.status === 'EN_ROUTE' ? 'EN ROUTE' : activeAssignment.status}: {activeAssignment.responder?.name?.split(' ').slice(0, 2).join(' ') || 'Assigned'}</span>
                          </span>
                        ) : (
                          <span className="text-amber-400 font-bold flex items-center gap-1">
                            <Clock className="w-3 h-3" /><span>{isUrdu ? 'بغیر تفویض' : 'UNASSIGNED'}</span>
                          </span>
                        )}
                        <Link href={`/operator/cases/${item.caseCode}`} onClick={(e) => e.stopPropagation()} className="text-blue-400 text-[10px] flex items-center gap-0.5 font-sans font-bold hover:text-blue-300 transition-colors">
                          <span>{isUrdu ? 'تفصیلات' : 'Details'}</span>
                          <ChevronRight className="w-3 h-3" />
                        </Link>
                      </div>
                    </div>
                  );
                })}
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
                  const isSelected = selectedCaseId === item.caseCode;
                  const isCrit = item.urgency === 'CRITICAL';
                  return (
                    <div key={item.caseCode} onClick={() => { setSelectedCaseId(item.caseCode); }} className={`p-3.5 rounded-2xl border transition-all cursor-pointer space-y-2.5 ${isSelected ? 'bg-[#161B22] border-amber-400 ring-1 ring-amber-400/50 shadow-xl' : isCrit ? 'bg-[#11161F] border-red-500/50 hover:border-red-400' : 'bg-[#11161F] border-amber-500/40 hover:border-amber-400'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-black text-white text-xs">{item.caseCode}</span>
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-red-500/20 text-red-300 border border-red-500/30">{item.urgency}</span>
                        </div>
                        <span className="text-[10px] font-mono text-gray-400">{new Date(item.createdAt).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs font-bold text-white">&quot;{item.locationText || 'Unknown location'}&quot;</div>
                        <div className="text-[11px] text-amber-400/90 font-mono flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 shrink-0" />
                          <span>{isUrdu ? 'مقام دستیاب نہیں' : 'Exact location unavailable'}</span>
                        </div>
                      </div>
                      <div className="pt-1 flex items-center gap-2">
                        <Link href={`/operator/cases/${item.caseCode}`} onClick={(e) => e.stopPropagation()} className="flex-1 py-1.5 px-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-sm">
                          <MapPin className="w-3.5 h-3.5" /><span>{isUrdu ? 'تفصیلات دیکھیں' : 'View Case'}</span>
                        </Link>
                      </div>
                    </div>
                  );
                })}
                {sortedUnconfirmedCases.length === 0 && apiCasesLoaded && (
                  <div className="text-center py-10 text-gray-400 text-xs">{isUrdu ? 'تمام کیسز کی GPS تصدیق ہو چکی ہے' : 'All current active cases have verified GPS telemetry.'}</div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
    </AuthGuard>
  );
}
