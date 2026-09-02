'use client';

import { useState, useEffect } from 'react';
import {
  Activity,
  AlertOctagon,
  Ambulance,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  FileText,
  Globe,
  Locate,
  LogOut,
  MapPin,
  Navigation as NavIcon,
  Phone,
  PhoneCall,
  Plus,
  Radio,
  ShieldCheck,
  User,
  Volume2,
  VolumeX,
} from 'lucide-react';
import Link from 'next/link';
import { useLanguage } from '@/i18n/LanguageContext';
import { getTranslation } from '@/i18n/translations';
import { initialMockCases } from '@/data/mockData';
import type { EmergencyCase } from '@/types';
import InteractiveMap from '@/components/InteractiveMap';
import GoogleMap from '@/components/maps/GoogleMap';
import { getCurrentPosition } from '@/lib/maps/geolocation';
import { isGoogleMapsConfigured } from '@/lib/maps/googleMapsLoader';
import type { GeoPoint, MapMarkerData } from '@/lib/maps/types';
import ResponderCaseDetailsSheet from '@/components/responder/ResponderCaseDetailsSheet';
import ResponderSupportModal from '@/components/responder/ResponderSupportModal';
import AuthGuard from '@/components/AuthGuard';
import { useAuth } from '@/lib/auth/AuthContext';

// ─── Milestone 8: Real assignment API types ────────────────
interface ApiAssignment {
  assignmentId: string;
  status: string;
  caseCode: string;
  urgency: string;
  categories: string[];
  locationText: string;
  caseLatitude: number | null;
  caseLongitude: number | null;
  requesterContact: string | null;
  summary: string | null;
  ambulance: { identifier: string; vehicleNumber: string } | null;
  resource: { name: string; type: string } | null;
}

type ResponderState = 'available' | 'assigned' | 'accepted' | 'en_route' | 'arrived' | 'completed';

export default function ResponderPage() {
  const { lang, isUrdu, toggleLang } = useLanguage();
  const t = getTranslation(lang);
  const { user, logout } = useAuth();

  const [activeTab, setActiveTab] = useState<'assignments' | 'map' | 'status' | 'profile'>('assignments');
  const [isOnline, setIsOnline] = useState(true);
  const [responderState, setResponderState] = useState<ResponderState>('en_route');

  const [currentCase] = useState<EmergencyCase>(() => {
    const existing = initialMockCases.find((c) => c.id === 'KC-2026-1048');
    if (existing) return existing;
    return {
      id: 'KC-2026-1048',
      urgency: 'critical',
      category: 'medical',
      status: 'en_route',
      location: { name: 'Gulshan Block 7, Karachi', coordinates: { lat: 24.9245, lng: 67.0982 }, isApproximate: false, addressDetail: 'Near Disco Bakery, 3rd Floor Apt 4B' },
      requester: { name: 'Kamran Siddiqui', phone: '0300-8291044', alternatePhone: '0321-4455667' },
      rawMessage: 'Mother collapsed suddenly, unconscious and breathing shallow. Need ambulance urgently.',
      timestamp: '12:42 PM',
      source: 'web',
      aiAnalysis: { summary: 'Unconscious patient requiring immediate ALS ambulance assistance.', summaryUr: 'بے ہوش مریض جس کے لیے فوری لائف سپورٹ ایمبولینس درکار ہے۔', reasoning: 'Loss of consciousness and respiratory distress warrants immediate ALS triage.', keyNeeds: ['ALS Ambulance', 'Defibrillator', 'Oxygen Support'], peopleCount: 3, specialNeeds: 'Diabetic patient', detectedLanguage: 'English / Urdu', confidence: 0.96 },
      assignedResource: { id: 'AKF-07', name: 'Ambulance AKF-07', type: 'ambulance', plateNumber: 'KHI-GL-8910', responderName: 'Ahmed Khan', responderPhone: '0333-5121122', etaMinutes: 6, distanceKm: 2.4, currentCoords: { lat: 24.9082, lng: 67.0815 } },
      timeline: [],
    };
  });

  const [showCaseDetailsSheet, setShowCaseDetailsSheet] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [sirensActive, setSirensActive] = useState(true);
  const [gpsErrorSimulated, setGpsErrorSimulated] = useState(false);
  const [completionNote, setCompletionNote] = useState('');
  const [isNoteSaved, setIsNoteSaved] = useState(false);
  const [notificationToast, setNotificationToast] = useState<string | null>(null);
  const [navStepIndex, setNavStepIndex] = useState(0);

  // ─── Milestone 8: Real assignment state ──────────────────
  const [apiAssignment, setApiAssignment] = useState<ApiAssignment | null>(null);
  const [hasRealAssignment, setHasRealAssignment] = useState(false);
  const [isTrackingActive, setIsTrackingActive] = useState(false);
  const [locationSharingStatus, setLocationSharingStatus] = useState<'off' | 'active' | 'error'>('off');

  // Local responder location (foundation only — not persisted to backend)
  const [responderLocation, setResponderLocation] = useState<GeoPoint | null>(null);
  const [responderLocationStatus, setResponderLocationStatus] = useState<'unknown' | 'available' | 'denied' | 'unavailable'>('unknown');
  const [useGoogleMap, setUseGoogleMap] = useState(false);

  useEffect(() => {
    setUseGoogleMap(isGoogleMapsConfigured());
    // Attempt to get local location for demo display
    getCurrentPosition().then((result) => {
      if (result.status === 'SUCCESS' && result.latitude != null && result.longitude != null) {
        setResponderLocation({ latitude: result.latitude, longitude: result.longitude });
        setResponderLocationStatus('available');
      } else if (result.status === 'DENIED') {
        setResponderLocationStatus('denied');
      } else {
        setResponderLocationStatus('unavailable');
      }
    });
  }, []);

  // ─── Milestone 8: Poll for current assignment ─────────────
  useEffect(() => {
    async function pollAssignment() {
      try {
        const res = await fetch('/api/responder/assignments/current');
        if (res.ok) {
          const data = await res.json();
          if (data.assignment) {
            setApiAssignment(data.assignment);
            setHasRealAssignment(true);
            // Sync responder state with API assignment status
            const statusMap: Record<string, ResponderState> = {
              PENDING: 'assigned',
              ACCEPTED: 'accepted',
              EN_ROUTE: 'en_route',
              ARRIVED: 'arrived',
            };
            const mapped = statusMap[data.assignment.status];
            if (mapped) setResponderState(mapped);
            if (data.assignment.status === 'COMPLETED') {
              setResponderState('completed');
              setIsTrackingActive(false);
              setLocationSharingStatus('off');
            }
          } else {
            setApiAssignment(null);
            setHasRealAssignment(false);
          }
        }
      } catch {
        // API unavailable — fall back to local demo state
      }
    }

    pollAssignment();
    const interval = setInterval(pollAssignment, 10000);
    return () => clearInterval(interval);
  }, []);

  // ─── Milestone 8: GPS tracking (15-second interval) ───────
  // Tracking only runs while assignment is active (PENDING/ACCEPTED/EN_ROUTE/ARRIVED).
  // Stops on COMPLETED, unmount, or when no active assignment exists.
  useEffect(() => {
    const activeStates = ['assigned', 'accepted', 'en_route', 'arrived'];
    if (!hasRealAssignment || !apiAssignment || !activeStates.includes(responderState)) {
      setIsTrackingActive(false);
      setLocationSharingStatus((prev) => (prev === 'active' ? 'off' : prev));
      return;
    }

    setIsTrackingActive(true);
    setLocationSharingStatus('active');

    async function sendLocation() {
      try {
        const result = await getCurrentPosition();
        if (result.status === 'SUCCESS' && result.latitude != null && result.longitude != null) {
          setResponderLocation({ latitude: result.latitude, longitude: result.longitude });
          setResponderLocationStatus('available');
          await fetch('/api/responder/location', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              assignmentId: apiAssignment!.assignmentId,
              latitude: result.latitude,
              longitude: result.longitude,
              accuracy: result.accuracy ?? undefined,
            }),
          });
        } else if (result.status === 'DENIED') {
          setResponderLocationStatus('denied');
        }
      } catch {
        setLocationSharingStatus('error');
      }
    }

    sendLocation();
    const interval = setInterval(sendLocation, 15000);
    return () => {
      clearInterval(interval);
      setIsTrackingActive(false);
      setLocationSharingStatus('off');
    };
  }, [hasRealAssignment, apiAssignment, responderState]);

  const turnDirections = [
    isUrdu ? '300 میٹر بعد راشد منہاس روڈ پر دائیں مڑیں' : 'Turn right in 300 m on Rashid Minhas Rd',
    isUrdu ? '800 میٹر بعد گلشن چورنگی پر سیدھے جائیں' : 'Continue straight through Gulshan Chowrangi for 800 m',
    isUrdu ? '200 میٹر بعد ڈسکو بیکری پر بائیں مڑیں' : 'Turn left at Disco Bakery in 200 m (Arriving)',
  ];

  useEffect(() => {
    if (notificationToast) {
      const timer = setTimeout(() => setNotificationToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notificationToast]);

  const handleAcceptAssignment = async () => {
    if (apiAssignment) {
      try {
        const res = await fetch(`/api/responder/assignments/${apiAssignment.assignmentId}/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newStatus: 'ACCEPTED' }),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      } catch (e) { setNotificationToast(e instanceof Error ? e.message : 'Failed'); return; }
    }
    setResponderState('accepted');
    setNotificationToast(isUrdu ? 'کیس قبول کر لیا گیا!' : 'Assignment Accepted! Start navigation when ready.');
  };
  const handleStartNavigation = async () => {
    if (apiAssignment) {
      try {
        const res = await fetch(`/api/responder/assignments/${apiAssignment.assignmentId}/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newStatus: 'EN_ROUTE' }),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      } catch (e) { setNotificationToast(e instanceof Error ? e.message : 'Failed'); return; }
    }
    setResponderState('en_route');
    setNotificationToast(isUrdu ? 'راستے میں مارک • لائیو GPS فعال' : 'Marked En Route • Live GPS Navigation Active');
  };
  const handleMarkArrived = async () => {
    if (apiAssignment) {
      try {
        const res = await fetch(`/api/responder/assignments/${apiAssignment.assignmentId}/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newStatus: 'ARRIVED' }),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      } catch (e) { setNotificationToast(e instanceof Error ? e.message : 'Failed'); return; }
    }
    setResponderState('arrived');
    setNotificationToast(isUrdu ? 'موقع پر پہنچ گئے' : 'Arrived at scene confirmed.');
  };
  const handleCompleteResponse = async () => {
    if (apiAssignment) {
      try {
        const res = await fetch(`/api/responder/assignments/${apiAssignment.assignmentId}/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newStatus: 'COMPLETED' }),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      } catch (e) { setNotificationToast(e instanceof Error ? e.message : 'Failed'); return; }
    }
    setResponderState('completed');
    setIsTrackingActive(false);
    setLocationSharingStatus('off');
    setNotificationToast(isUrdu ? 'امدادی کارروائی مکمل' : 'Response completed.');
  };
  const handleReturnToAvailable = () => {
    setResponderState('available');
    setIsNoteSaved(false);
    setCompletionNote('');
    setNotificationToast(isUrdu ? 'یونٹ AKF-07 دوبارہ دستیاب' : 'Unit AKF-07 is now Available for next dispatch.');
  };
  const handleSimulateNewAssignment = () => {
    setResponderState('assigned');
    setSirensActive(true);
    setNotificationToast(isUrdu ? 'نئی ہنگامی کال موصول!' : 'New Emergency Assignment Alert Received!');
  };
  const handleSendSupportRequest = async (type?: string, details?: string) => {
    if (apiAssignment) {
      try {
        await fetch('/api/responder/support', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assignmentId: apiAssignment.assignmentId,
            requestType: type || 'OTHER',
            details: details || 'Support requested by responder',
          }),
        });
      } catch { /* non-blocking */ }
    }
    setNotificationToast(t.supportRequestedToast);
  };

  const assignmentHistory = [
    { id: 'KC-2026-1048', category: 'Medical', categoryUr: 'طبی امداد', status: isUrdu ? 'مکمل' : 'Completed', location: 'Gulshan Block 7', time: isUrdu ? 'آج، 12:42 PM' : 'Today, 12:42 PM', duration: '24 min', urgency: 'critical' },
    { id: 'KC-2026-1039', category: 'Rescue', categoryUr: 'ریسکیو', status: isUrdu ? 'مکمل' : 'Completed', location: 'Saddar Electronics Market', time: isUrdu ? 'آج، 10:15 AM' : 'Today, 10:15 AM', duration: '38 min', urgency: 'high' },
    { id: 'KC-2026-1022', category: 'Medical', categoryUr: 'طبی امداد', status: isUrdu ? 'مکمل' : 'Completed', location: 'NIPA Chowrangi', time: isUrdu ? 'کل، 08:30 PM' : 'Yesterday, 08:30 PM', duration: '19 min', urgency: 'medium' },
  ];

  return (
    <AuthGuard requiredRole="RESPONDER">
    <div dir={isUrdu ? 'rtl' : 'ltr'} className="min-h-screen bg-[#06080C] text-[#E6EDF3] flex flex-col items-center justify-start font-sans selection:bg-blue-600/30 selection:text-blue-200 relative pb-20 md:pb-6">
      {/* Toast Notification */}
      {notificationToast && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-sm p-3 rounded-2xl bg-[#161B22]/98 backdrop-blur-xl border border-blue-500/50 shadow-2xl text-xs font-semibold text-white flex items-center justify-between gap-2.5 animate-in slide-in-from-top-4">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping shrink-0" />
            <span className="truncate">{notificationToast}</span>
          </div>
          <button onClick={() => setNotificationToast(null)} className="p-1 text-gray-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Main Field App Container */}
      <main className="w-full max-w-md md:max-w-lg min-h-screen bg-[#0B0E14] border-x border-[#30363D] flex flex-col shadow-2xl relative overflow-hidden">
        {/* 1. TOP BAR */}
        <header className="bg-[#11161F] border-b border-[#30363D] px-3.5 py-2.5 flex items-center justify-between gap-2.5 shrink-0 z-20">
          <div className="flex items-center gap-2.5 min-w-0">
            <Link href="/" className="p-1.5 rounded-xl bg-[#0B0E14] hover:bg-[#161B22] border border-[#30363D] text-gray-300 hover:text-white shrink-0 min-h-[38px] min-w-[38px] flex items-center justify-center transition-colors" title="Citizen Portal">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center text-white font-black text-xs shrink-0 shadow-md shadow-blue-900/30">{(user?.name || 'R').charAt(0)}</div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-xs sm:text-sm text-white truncate">{user?.name || t.responderName}</span>
                <button onClick={logout} className="p-0.5 text-gray-500 hover:text-red-400 transition-colors shrink-0" title="Logout">
                  <LogOut className="w-3 h-3" />
                </button>
                <span className="text-gray-500 font-mono text-[10px]">•</span>
                <span className="text-[11px] font-mono text-blue-400 font-bold truncate">{t.responderUnit}</span>
              </div>
              <div className="flex items-center gap-1.5">
                {responderState === 'available' ? (
                  <span className="text-[10px] font-mono text-emerald-400 font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" /><span>ONLINE • {t.statusAvailable}</span>
                  </span>
                ) : responderState === 'assigned' ? (
                  <span className="text-[10px] font-mono text-red-400 font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" /><span>NEW ALERT</span>
                  </span>
                ) : responderState === 'en_route' ? (
                  <span className="text-[10px] font-mono text-emerald-400 font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" /><span>{t.statusEnRoute}</span>
                  </span>
                ) : responderState === 'arrived' ? (
                  <span className="text-[10px] font-mono text-blue-400 font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400" /><span>{t.statusArrived}</span>
                  </span>
                ) : (
                  <span className="text-[10px] font-mono text-gray-400 font-bold">{t.statusCompleted}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={() => setSirensActive(!sirensActive)} className={`p-2 rounded-xl border text-xs font-mono font-bold flex items-center justify-center transition-all min-h-[38px] min-w-[38px] ${sirensActive ? 'bg-red-600/30 border-red-500 text-red-300 shadow-md shadow-red-900/30 animate-pulse' : 'bg-[#0B0E14] border-[#30363D] text-gray-400'}`} title="Toggle Siren">
              {sirensActive ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
            <button onClick={toggleLang} className="px-2.5 py-1.5 rounded-xl bg-[#0B0E14] hover:bg-[#161B22] border border-[#30363D] text-xs font-mono text-gray-200 hover:text-white flex items-center gap-1 min-h-[38px]" title="Toggle Language">
              <Globe className="w-3.5 h-3.5 text-blue-400" /><span>{lang === 'en' ? 'اردو' : 'EN'}</span>
            </button>
          </div>
        </header>

        {/* TAB CONTENT */}
        {activeTab === 'assignments' && (
          <div className="flex-1 flex flex-col overflow-y-auto">
            {/* AVAILABLE STATE */}
            {responderState === 'available' && (
              <div className="flex-1 p-4 sm:p-6 flex flex-col justify-between space-y-6 animate-in fade-in">
                <div className="p-6 rounded-3xl bg-[#11161F] border border-[#30363D] text-center space-y-4 shadow-xl mt-4">
                  <div className="w-16 h-16 rounded-3xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto shadow-inner">
                    <Ambulance className="w-8 h-8 animate-pulse" />
                  </div>
                  <div className="space-y-1.5">
                    <h2 className="text-xl font-black text-white tracking-tight">{t.readyForAssignment}</h2>
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono font-bold">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                      <span>STATUS: {isOnline ? t.statusAvailable : t.statusOffline}</span>
                    </div>
                    <p className="text-xs text-gray-400 pt-1">{t.notifyWhenAssigned}</p>
                  </div>
                  <div className="pt-4 border-t border-[#30363D] grid grid-cols-2 gap-2 text-left text-xs font-mono">
                    <div className="p-2.5 rounded-xl bg-[#0B0E14] border border-[#30363D]/60 space-y-0.5">
                      <span className="text-[10px] text-gray-400 block">GPS TELEMETRY</span>
                      <span className={`font-bold flex items-center gap-1 ${
                        responderLocationStatus === 'available' ? 'text-emerald-400' :
                        responderLocationStatus === 'denied' ? 'text-amber-400' :
                        'text-gray-400'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          responderLocationStatus === 'available' ? 'bg-emerald-400' :
                          responderLocationStatus === 'denied' ? 'bg-amber-400' :
                          'bg-gray-400'
                        }`} />
                        <span>
                          {responderLocationStatus === 'available' ? 'Location available' :
                           responderLocationStatus === 'denied' ? 'Permission denied' :
                           responderLocationStatus === 'unavailable' ? 'Unavailable' :
                           'Detecting...'}
                        </span>
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#0B0E14] border border-[#30363D]/60 space-y-0.5">
                      <span className="text-[10px] text-gray-400 block">SHIFT STATUS</span>
                      <span className="text-blue-300 font-bold">07:00-15:00 (5.2h)</span>
                    </div>
                  </div>
                </div>
                <div className="p-3.5 rounded-2xl bg-[#11161F]/60 border border-[#30363D]/80 flex items-start gap-2.5 text-xs text-gray-400">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] leading-relaxed">{t.locationSharingPrivacyNote}</p>
                </div>
                <div className="space-y-2.5 pt-4">
                  <button onClick={() => setIsOnline(!isOnline)} className={`w-full py-3.5 px-4 rounded-2xl text-xs font-bold transition-all border min-h-[48px] flex items-center justify-center gap-2 ${isOnline ? 'bg-[#11161F] hover:bg-[#161B22] text-gray-300 border-[#30363D]' : 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500'}`}>
                    <Activity className="w-4 h-4" /><span>{isOnline ? t.goOffline : t.goOnline}</span>
                  </button>
                  <button onClick={handleSimulateNewAssignment} className="w-full py-3 px-4 rounded-2xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors">
                    <Plus className="w-3.5 h-3.5" /><span>{t.simIncomingDispatch}</span>
                  </button>
                </div>
              </div>
            )}

            {/* ASSIGNED STATE - NEW ALERT */}
            {responderState === 'assigned' && apiAssignment && (
              <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between space-y-4 animate-in zoom-in-95">
                <div className="p-5 rounded-3xl bg-gradient-to-b from-red-950/80 via-[#11161F] to-[#11161F] border-2 border-red-500/60 shadow-2xl space-y-4 relative overflow-hidden">
                  <div className="absolute -top-10 -right-10 w-32 h-32 bg-red-600/20 rounded-full blur-2xl pointer-events-none" />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-red-400 font-black text-xs tracking-wider uppercase">
                      <AlertOctagon className="w-4 h-4 animate-bounce text-red-400" /><span>{t.newEmergencyAssignment}</span>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full bg-red-600 text-white font-mono font-black text-xs tracking-wider border border-red-400 shadow">{apiAssignment.urgency} • {apiAssignment.categories.join(', ')}</span>
                  </div>
                  <div className="space-y-1">
                    <div className="font-mono text-2xl font-black text-white tracking-tight">{apiAssignment.caseCode}</div>
                    <div className="text-base font-bold text-gray-100 flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 text-red-400 shrink-0" /><span>{apiAssignment.locationText || 'Location provided'}</span>
                    </div>
                  </div>
                  {apiAssignment.summary && (
                    <div className="text-xs text-gray-300 leading-relaxed font-medium bg-[#161B22] p-3 rounded-xl border border-[#30363D]">&quot;{apiAssignment.summary}&quot;</div>
                  )}
                </div>
                <div className="space-y-2.5 pt-2">
                  <Link href={`/responder/cases/${apiAssignment.caseCode}`} className="w-full py-4 px-6 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-black text-base tracking-wide shadow-2xl shadow-red-900/60 ring-2 ring-red-500/60 active:scale-95 transition-all flex items-center justify-center gap-2 min-h-[56px]">
                    <Check className="w-5 h-5" /><span>{t.acceptAssignment} &amp; View Case</span>
                  </Link>
                  <button onClick={handleAcceptAssignment} className="w-full py-3.5 px-4 rounded-2xl bg-[#11161F] hover:bg-[#161B22] border border-[#30363D] text-gray-300 font-bold text-xs flex items-center justify-center gap-2 transition-colors min-h-[44px]">
                    <Check className="w-4 h-4 text-emerald-400" /><span>{t.acceptAssignment}</span>
                  </button>
                </div>
              </div>
            )}

            {/* ASSIGNED STATE - fallback when no real API assignment */}
            {responderState === 'assigned' && !apiAssignment && (
              <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between space-y-4 animate-in zoom-in-95">
                <div className="p-5 rounded-3xl bg-gradient-to-b from-red-950/80 via-[#11161F] to-[#11161F] border-2 border-red-500/60 shadow-2xl space-y-4 relative overflow-hidden">
                  <div className="absolute -top-10 -right-10 w-32 h-32 bg-red-600/20 rounded-full blur-2xl pointer-events-none" />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-red-400 font-black text-xs tracking-wider uppercase">
                      <AlertOctagon className="w-4 h-4 animate-bounce text-red-400" /><span>{t.newEmergencyAssignment}</span>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full bg-red-600 text-white font-mono font-black text-xs tracking-wider border border-red-400 shadow">CRITICAL • MEDICAL</span>
                  </div>
                  <div className="space-y-1">
                    <div className="font-mono text-2xl font-black text-white tracking-tight">{currentCase.id}</div>
                    <div className="text-base font-bold text-gray-100 flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 text-red-400 shrink-0" /><span>{currentCase.location.name}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 p-3 rounded-2xl bg-[#0B0E14] border border-red-500/30">
                    <div><span className="text-[10px] font-mono text-gray-400 uppercase block">{isUrdu ? 'فاصلہ' : 'Distance'}</span><span className="text-base font-mono font-black text-white">2.4 km</span></div>
                    <div><span className="text-[10px] font-mono text-gray-400 uppercase block">ETA</span><span className="text-base font-mono font-black text-emerald-400">~6 min</span></div>
                  </div>
                  <div className="text-xs text-gray-300 leading-relaxed font-medium bg-[#161B22] p-3 rounded-xl border border-[#30363D]">&quot;{currentCase.aiAnalysis.summary}&quot;</div>
                </div>
                <div className="space-y-2.5 pt-2">
                  <button onClick={handleAcceptAssignment} className="w-full py-4 px-6 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-black text-base tracking-wide shadow-2xl shadow-red-900/60 ring-2 ring-red-500/60 active:scale-95 transition-all flex items-center justify-center gap-2 min-h-[56px]">
                    <Check className="w-5 h-5" /><span>{t.acceptAssignment}</span>
                  </button>
                  <a href="tel:1122" className="w-full py-3.5 px-4 rounded-2xl bg-[#11161F] hover:bg-[#161B22] border border-[#30363D] text-gray-300 font-bold text-xs flex items-center justify-center gap-2 transition-colors min-h-[44px]">
                    <Phone className="w-4 h-4 text-blue-400" /><span>{t.contactOperator}</span>
                  </a>
                </div>
              </div>
            )}

            {/* ACCEPTED / EN ROUTE */}
            {(responderState === 'accepted' || responderState === 'en_route') && apiAssignment && (
              <div className="flex-1 flex flex-col">
                {responderState === 'en_route' && (
                  <div onClick={() => setNavStepIndex((prev) => (prev + 1) % turnDirections.length)} className="bg-[#11161F] border-b border-emerald-500/40 p-3 sm:p-3.5 flex items-center justify-between gap-3 text-xs cursor-pointer select-none" title="Tap to simulate next turn">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-bold shrink-0"><NavIcon className="w-4 h-4" /></div>
                      <div className="min-w-0">
                        <span className="text-[10px] font-mono text-emerald-400 font-bold block uppercase tracking-wider">LIVE TURN GUIDANCE</span>
                        <p className="font-bold text-white text-xs truncate">{turnDirections[navStepIndex]}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0 font-mono text-[10px] text-gray-400"><span>NEXT TURN</span></div>
                  </div>
                )}

                <div className="relative flex-1 min-h-[280px] sm:min-h-[320px]">
                  {useGoogleMap && apiAssignment.caseLatitude && apiAssignment.caseLongitude ? (
                    <GoogleMap
                      center={responderLocation || { latitude: apiAssignment.caseLatitude, longitude: apiAssignment.caseLongitude }}
                      markers={[{
                        id: apiAssignment.caseCode,
                        type: 'EMERGENCY' as const,
                        position: { latitude: apiAssignment.caseLatitude, longitude: apiAssignment.caseLongitude },
                        title: apiAssignment.caseCode,
                        subtitle: apiAssignment.locationText || 'Emergency',
                        urgency: apiAssignment.urgency as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | undefined,
                      }]}
                      heightClass="h-full min-h-[280px] sm:min-h-[320px]"
                      className="rounded-xl"
                    />
                  ) : (
                    <InteractiveMap singleCaseMode={currentCase} heightClass="h-full min-h-[280px] sm:min-h-[320px]" lang={lang} showLayersControl={false} />
                  )}
                  <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none z-10">
                    <div className="px-3 py-1.5 rounded-xl bg-[#0B0E14]/95 backdrop-blur-md border border-emerald-500/50 text-xs font-mono font-bold text-emerald-300 shadow-xl flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                      {apiAssignment.caseLatitude && apiAssignment.caseLongitude && responderLocation ? (
                        <span>LIVE TRACKING</span>
                      ) : (
                        <span>{apiAssignment.urgency} • {apiAssignment.categories.join(', ')}</span>
                      )}
                    </div>
                  </div>
                  <div className="absolute bottom-3 right-3 z-10 flex flex-col gap-2">
                    <button onClick={() => setNotificationToast(isUrdu ? 'نقشہ سینٹر ہو گیا' : 'Map recentered')} className="w-10 h-10 rounded-xl bg-[#11161F]/95 backdrop-blur-md border border-[#30363D] hover:border-blue-400 text-gray-200 flex items-center justify-center shadow-xl active:scale-95 transition-all" title={t.recenterMap}>
                      <Locate className="w-4 h-4 text-blue-400" />
                    </button>
                    {apiAssignment.requesterContact && (
                      <a href={`tel:${apiAssignment.requesterContact}`} className="w-10 h-10 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center shadow-xl active:scale-95 transition-all" title={t.callRequester}>
                        <PhoneCall className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                  <div className="absolute bottom-3 left-3 z-10">
                    <div className={`px-2.5 py-1 rounded-xl bg-[#0B0E14]/95 backdrop-blur-md border text-[10px] font-mono font-semibold flex items-center gap-1.5 ${
                      isTrackingActive
                        ? 'border-emerald-500/40 text-emerald-400'
                        : 'border-[#30363D] text-gray-400'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        isTrackingActive ? 'bg-emerald-400 animate-ping' : 'bg-gray-400'
                      }`} />
                      <span>{isTrackingActive
                        ? (isUrdu ? 'لائیو لوکیشن شیئرنگ فعال' : 'Live Location Sharing ON')
                        : (isUrdu ? 'لوکیشن شیئرنگ بند' : 'Location sharing off')
                      }</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-[#11161F] border-t border-[#30363D] space-y-3 shrink-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-black text-white">{apiAssignment.caseCode}</span>
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-red-500/20 text-red-300 border border-red-500/40">{apiAssignment.urgency} • {apiAssignment.categories.join(', ')}</span>
                      </div>
                      <p className="text-sm font-black text-white truncate mt-0.5">{apiAssignment.locationText || 'Emergency Location'}</p>
                      {apiAssignment.summary && <p className="text-xs text-gray-300 truncate">&quot;{apiAssignment.summary}&quot;</p>}
                    </div>
                    <Link href={`/responder/cases/${apiAssignment.caseCode}`} className="px-3 py-1.5 rounded-xl bg-[#161B22] hover:bg-[#21262D] border border-[#30363D] text-blue-400 font-bold text-xs whitespace-nowrap shrink-0 flex items-center gap-1">
                      <span>{t.caseDetails}</span><ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                  {responderState === 'accepted' ? (
                    <button onClick={handleStartNavigation} className="w-full py-4 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-base shadow-2xl shadow-emerald-900/50 ring-2 ring-emerald-500/50 active:scale-95 transition-all flex items-center justify-center gap-2 min-h-[52px]">
                      <NavIcon className="w-5 h-5" /><span>{t.startNavigation}</span>
                    </button>
                  ) : (
                    <button onClick={handleMarkArrived} className="w-full py-4 px-6 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-black text-base shadow-2xl shadow-blue-900/50 ring-2 ring-blue-500/50 active:scale-95 transition-all flex items-center justify-center gap-2 min-h-[52px]">
                      <MapPin className="w-5 h-5" /><span>{t.markArrived}</span>
                    </button>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    {apiAssignment.requesterContact && (
                      <a href={`tel:${apiAssignment.requesterContact}`} className="py-2.5 px-3 rounded-xl bg-[#0B0E14] hover:bg-[#161B22] border border-[#30363D] text-xs font-bold text-gray-200 flex items-center justify-center gap-1.5 min-h-[44px]">
                        <PhoneCall className="w-3.5 h-3.5 text-emerald-400" /><span>{t.callRequester}</span>
                      </a>
                    )}
                    <a href="tel:1122" className="py-2.5 px-3 rounded-xl bg-[#0B0E14] hover:bg-[#161B22] border border-[#30363D] text-xs font-bold text-gray-200 flex items-center justify-center gap-1.5 min-h-[44px]">
                      <Phone className="w-3.5 h-3.5 text-blue-400" /><span>{t.callOperator}</span>
                    </a>
                  </div>
                </div>
              </div>
            )}

            {/* ACCEPTED / EN ROUTE - fallback when no real assignment */}
            {(responderState === 'accepted' || responderState === 'en_route') && !apiAssignment && (
              <div className="flex-1 flex flex-col">
                {responderState === 'en_route' && (
                  <div onClick={() => setNavStepIndex((prev) => (prev + 1) % turnDirections.length)} className="bg-[#11161F] border-b border-emerald-500/40 p-3 sm:p-3.5 flex items-center justify-between gap-3 text-xs cursor-pointer select-none" title="Tap to simulate next turn">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-bold shrink-0"><NavIcon className="w-4 h-4" /></div>
                      <div className="min-w-0">
                        <span className="text-[10px] font-mono text-emerald-400 font-bold block uppercase tracking-wider">LIVE TURN GUIDANCE</span>
                        <p className="font-bold text-white text-xs truncate">{turnDirections[navStepIndex]}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0 font-mono text-[10px] text-gray-400"><span>NEXT TURN</span></div>
                  </div>
                )}
                <div className="relative flex-1 min-h-[280px] sm:min-h-[320px]">
                  {useGoogleMap && currentCase.location.coordinates ? (
                    <GoogleMap
                      center={responderLocation || { latitude: currentCase.location.coordinates.lat, longitude: currentCase.location.coordinates.lng }}
                      markers={[{
                        id: currentCase.id,
                        type: 'EMERGENCY' as const,
                        position: { latitude: currentCase.location.coordinates.lat, longitude: currentCase.location.coordinates.lng },
                        title: currentCase.id,
                        subtitle: currentCase.location.name,
                        urgency: 'CRITICAL',
                      }]}
                      heightClass="h-full min-h-[280px] sm:min-h-[320px]"
                      className="rounded-xl"
                    />
                  ) : (
                    <InteractiveMap singleCaseMode={currentCase} heightClass="h-full min-h-[280px] sm:min-h-[320px]" lang={lang} showLayersControl={false} />
                  )}
                  <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none z-10">
                    <div className="px-3 py-1.5 rounded-xl bg-[#0B0E14]/95 backdrop-blur-md border border-emerald-500/50 text-xs font-mono font-bold text-emerald-300 shadow-xl flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" /><span>ETA: 6 MIN • 2.4 KM</span>
                    </div>
                    <div className="px-2.5 py-1.5 rounded-xl bg-[#0B0E14]/95 backdrop-blur-md border border-blue-500/40 text-[11px] font-mono font-bold text-blue-300 shadow-xl">SPEED: 58 KM/H</div>
                  </div>
                  <div className="absolute bottom-3 right-3 z-10 flex flex-col gap-2">
                    <button onClick={() => setNotificationToast(isUrdu ? 'نقشہ سینٹر ہو گیا' : 'Map recentered')} className="w-10 h-10 rounded-xl bg-[#11161F]/95 backdrop-blur-md border border-[#30363D] hover:border-blue-400 text-gray-200 flex items-center justify-center shadow-xl active:scale-95 transition-all" title={t.recenterMap}>
                      <Locate className="w-4 h-4 text-blue-400" />
                    </button>
                    <a href={`tel:${currentCase.requester.phone}`} className="w-10 h-10 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center shadow-xl active:scale-95 transition-all" title={t.callRequester}>
                      <PhoneCall className="w-4 h-4" />
                    </a>
                  </div>
                  <div className="absolute bottom-3 left-3 z-10">
                    <div className={`px-2.5 py-1 rounded-xl bg-[#0B0E14]/95 backdrop-blur-md border text-[10px] font-mono font-semibold flex items-center gap-1.5 ${
                      isTrackingActive
                        ? 'border-emerald-500/40 text-emerald-400'
                        : 'border-[#30363D] text-gray-400'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        isTrackingActive ? 'bg-emerald-400 animate-ping' : 'bg-gray-400'
                      }`} />
                      <span>{isTrackingActive
                        ? (isUrdu ? 'لائیو لوکیشن شیئرنگ فعال' : 'Live Location Sharing ON')
                        : (isUrdu ? 'لوکیشن شیئرنگ بند' : 'Location sharing off')
                      }</span>
                    </div>
                  </div>
                </div>
                <div className="p-4 bg-[#11161F] border-t border-[#30363D] space-y-3 shrink-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-black text-white">{currentCase.id}</span>
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-red-500/20 text-red-300 border border-red-500/40">CRITICAL • MEDICAL</span>
                      </div>
                      <p className="text-sm font-black text-white truncate mt-0.5">{currentCase.location.name}</p>
                      <p className="text-xs text-gray-300 truncate">&quot;{currentCase.aiAnalysis.summary}&quot;</p>
                    </div>
                    <button onClick={() => setShowCaseDetailsSheet(true)} className="px-3 py-1.5 rounded-xl bg-[#161B22] hover:bg-[#21262D] border border-[#30363D] text-blue-400 font-bold text-xs whitespace-nowrap shrink-0 flex items-center gap-1">
                      <span>{t.caseDetails}</span><ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {responderState === 'accepted' ? (
                    <button onClick={handleStartNavigation} className="w-full py-4 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-base shadow-2xl shadow-emerald-900/50 ring-2 ring-emerald-500/50 active:scale-95 transition-all flex items-center justify-center gap-2 min-h-[52px]">
                      <NavIcon className="w-5 h-5" /><span>{t.startNavigation}</span>
                    </button>
                  ) : (
                    <button onClick={handleMarkArrived} className="w-full py-4 px-6 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-black text-base shadow-2xl shadow-blue-900/50 ring-2 ring-blue-500/50 active:scale-95 transition-all flex items-center justify-center gap-2 min-h-[52px]">
                      <MapPin className="w-5 h-5" /><span>{t.markArrived}</span>
                    </button>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <a href={`tel:${currentCase.requester.phone}`} className="py-2.5 px-3 rounded-xl bg-[#0B0E14] hover:bg-[#161B22] border border-[#30363D] text-xs font-bold text-gray-200 flex items-center justify-center gap-1.5 min-h-[44px]">
                      <PhoneCall className="w-3.5 h-3.5 text-emerald-400" /><span>{t.callRequester}</span>
                    </a>
                    <a href="tel:1122" className="py-2.5 px-3 rounded-xl bg-[#0B0E14] hover:bg-[#161B22] border border-[#30363D] text-xs font-bold text-gray-200 flex items-center justify-center gap-1.5 min-h-[44px]">
                      <Phone className="w-3.5 h-3.5 text-blue-400" /><span>{t.callOperator}</span>
                    </a>
                  </div>
                </div>
              </div>
            )}

            {/* ARRIVED STATE */}
            {responderState === 'arrived' && apiAssignment && (
              <div className="flex-1 p-4 sm:p-5 flex flex-col justify-between space-y-4 animate-in fade-in">
                <div className="p-4 sm:p-5 rounded-3xl bg-[#11161F] border border-blue-500/50 space-y-3.5 shadow-xl">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-blue-400 font-black text-xs font-mono uppercase">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /><span>{t.statusArrived}</span>
                    </div>
                    <Link href={`/responder/cases/${apiAssignment.caseCode}`} className="font-mono text-xs font-black text-blue-400 hover:underline">{apiAssignment.caseCode}</Link>
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-base font-black text-white">{apiAssignment.locationText || 'Emergency Location'}</h3>
                  </div>
                  {apiAssignment.summary && <p className="text-xs text-gray-300">&quot;{apiAssignment.summary}&quot;</p>}
                  <Link href={`/responder/cases/${apiAssignment.caseCode}`} className="w-full py-2 px-3 rounded-xl bg-[#161B22] hover:bg-[#21262D] border border-[#30363D] text-xs font-bold text-blue-300 flex items-center justify-center gap-1">
                    <FileText className="w-3.5 h-3.5" /><span>{t.caseDetails}</span>
                  </Link>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {apiAssignment.requesterContact && (
                    <a href={`tel:${apiAssignment.requesterContact}`} className="py-3 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow min-h-[44px]">
                      <PhoneCall className="w-4 h-4" /><span>{t.callRequester}</span>
                    </a>
                  )}
                  <a href="tel:1122" className="py-3 px-3 rounded-xl bg-[#11161F] hover:bg-[#161B22] border border-[#30363D] text-white text-xs font-bold flex items-center justify-center gap-1.5 min-h-[44px]">
                    <Phone className="w-4 h-4 text-blue-400" /><span>{t.callOperator}</span>
                  </a>
                </div>
                <div className="space-y-2.5 pt-2">
                  <button onClick={handleCompleteResponse} className="w-full py-4 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-base shadow-2xl shadow-emerald-900/50 ring-2 ring-emerald-500/50 active:scale-95 transition-all flex items-center justify-center gap-2 min-h-[54px]">
                    <CheckCircle2 className="w-5 h-5" /><span>{t.completeResponse}</span>
                  </button>
                  <button onClick={() => setShowSupportModal(true)} className="w-full py-3 px-4 rounded-2xl bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/40 text-amber-300 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors min-h-[44px]">
                    <Radio className="w-4 h-4" /><span>{t.requestAdditionalSupport}</span>
                  </button>
                </div>
              </div>
            )}

            {/* ARRIVED STATE - fallback when no real assignment */}
            {responderState === 'arrived' && !apiAssignment && (
              <div className="flex-1 p-4 sm:p-5 flex flex-col justify-between space-y-4 animate-in fade-in">
                <div className="p-4 sm:p-5 rounded-3xl bg-[#11161F] border border-blue-500/50 space-y-3.5 shadow-xl">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-blue-400 font-black text-xs font-mono uppercase">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /><span>{t.statusArrived}</span>
                    </div>
                    <span className="font-mono text-xs font-black text-white">{currentCase.id}</span>
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-base font-black text-white">{currentCase.location.name}</h3>
                    {currentCase.location.addressDetail && <p className="text-xs text-blue-300 bg-[#0B0E14] p-2 rounded-xl border border-[#30363D]">{currentCase.location.addressDetail}</p>}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 rounded-xl bg-[#0B0E14] border border-[#30363D] space-y-0.5">
                      <span className="text-[10px] text-gray-400 font-mono uppercase">{isUrdu ? 'افراد' : 'PEOPLE'}</span>
                      <p className="font-bold text-white">{currentCase.aiAnalysis.peopleCount || 3} {isUrdu ? 'متاثر' : 'Affected'}</p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#0B0E14] border border-[#30363D] space-y-0.5">
                      <span className="text-[10px] text-gray-400 font-mono uppercase">{isUrdu ? 'خصوصی ضرورت' : 'SPECIAL NEED'}</span>
                      <p className="font-bold text-amber-300 truncate">{currentCase.aiAnalysis.specialNeeds || 'N/A'}</p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-300">&quot;{currentCase.aiAnalysis.summary}&quot;</p>
                  <button onClick={() => setShowCaseDetailsSheet(true)} className="w-full py-2 px-3 rounded-xl bg-[#161B22] hover:bg-[#21262D] border border-[#30363D] text-xs font-bold text-blue-300 flex items-center justify-center gap-1">
                    <FileText className="w-3.5 h-3.5" /><span>{t.caseDetails}</span>
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <a href={`tel:${currentCase.requester.phone}`} className="py-3 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow min-h-[44px]">
                    <PhoneCall className="w-4 h-4" /><span>{t.callRequester}</span>
                  </a>
                  <a href="tel:1122" className="py-3 px-3 rounded-xl bg-[#11161F] hover:bg-[#161B22] border border-[#30363D] text-white text-xs font-bold flex items-center justify-center gap-1.5 min-h-[44px]">
                    <Phone className="w-4 h-4 text-blue-400" /><span>{t.callOperator}</span>
                  </a>
                </div>
                <div className="space-y-2.5 pt-2">
                  <button onClick={handleCompleteResponse} className="w-full py-4 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-base shadow-2xl shadow-emerald-900/50 ring-2 ring-emerald-500/50 active:scale-95 transition-all flex items-center justify-center gap-2 min-h-[54px]">
                    <CheckCircle2 className="w-5 h-5" /><span>{t.completeResponse}</span>
                  </button>
                  <button onClick={() => setShowSupportModal(true)} className="w-full py-3 px-4 rounded-2xl bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/40 text-amber-300 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors min-h-[44px]">
                    <Radio className="w-4 h-4" /><span>{t.requestAdditionalSupport}</span>
                  </button>
                </div>
              </div>
            )}

            {/* COMPLETED STATE */}
            {responderState === 'completed' && (
              <div className="flex-1 p-4 sm:p-6 flex flex-col justify-between space-y-6 animate-in zoom-in-95">
                <div className="p-6 rounded-3xl bg-[#11161F] border border-emerald-500/40 text-center space-y-4 shadow-2xl mt-4">
                  <div className="w-16 h-16 rounded-full bg-emerald-600/20 border border-emerald-500 text-emerald-400 flex items-center justify-center mx-auto shadow-lg">
                    <Check className="w-8 h-8" />
                  </div>
                  <div className="space-y-1">
                    <h2 className="text-xl font-black text-white">{t.responseCompletedTitle}</h2>
                    <p className="text-xs font-mono text-gray-400">{isUrdu ? 'کیس:' : 'Case:'} <span className="text-white font-bold">{currentCase.id}</span></p>
                  </div>
                  <div className="p-3 rounded-2xl bg-[#0B0E14] border border-[#30363D] flex items-center justify-around text-xs font-mono">
                    <div><span className="text-[10px] text-gray-400 block">{t.responseDuration}</span><span className="text-sm font-black text-emerald-400">24 MIN</span></div>
                    <div className="h-6 w-px bg-[#30363D]" />
                    <div><span className="text-[10px] text-gray-400 block">{isUrdu ? 'منزل' : 'DESTINATION'}</span><span className="text-xs font-bold text-white">JPMC ER</span></div>
                  </div>
                  <div className="space-y-2 text-left pt-2 border-t border-[#30363D]">
                    <span className="text-[11px] font-mono text-gray-300 font-semibold block">{t.addCompletionNote}</span>
                    <input type="text" value={completionNote} onChange={(e) => setCompletionNote(e.target.value)} placeholder={isUrdu ? 'مثال: مریض ہسپتال منتقل' : 'e.g., Patient stabilized, transferred to trauma ward'} className="w-full px-3 py-2 rounded-xl bg-[#0B0E14] border border-[#30363D] text-xs text-white placeholder:text-gray-500 focus:outline-none focus:border-blue-500" />
                    {completionNote.trim() && !isNoteSaved && (
                      <button onClick={() => setIsNoteSaved(true)} className="py-1.5 px-3 rounded-lg bg-blue-600 text-white font-bold text-[11px]">{t.saveNote}</button>
                    )}
                    {isNoteSaved && (
                      <span className="text-[11px] text-emerald-400 font-mono flex items-center gap-1"><Check className="w-3 h-3" /><span>{t.noteSaved}</span></span>
                    )}
                  </div>
                </div>
                <button onClick={handleReturnToAvailable} className="w-full py-4 px-6 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-black text-base shadow-2xl active:scale-95 transition-all min-h-[52px]">
                  {t.returnToAvailable}
                </button>
              </div>
            )}
          </div>
        )}

        {/* MAP TAB */}
        {activeTab === 'map' && (
          <div className="flex-1 flex flex-col p-3 space-y-3">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5"><NavIcon className="w-4 h-4 text-blue-400" /><span>{isUrdu ? 'لائیو نقشہ' : 'Live Navigation Map'}</span></h3>
              <div className={`text-[10px] font-mono flex items-center gap-1 ${responderLocationStatus === 'available' ? 'text-emerald-400' : 'text-amber-400'}`}>
                <span className={`w-2 h-2 rounded-full ${responderLocationStatus === 'available' ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'}`} />
                <span>{responderLocationStatus === 'available' ? 'LIVE GPS' : 'GPS PENDING'}</span>
              </div>
            </div>
            <div className="flex-1 rounded-2xl overflow-hidden border border-[#30363D] relative min-h-[420px]">
              {useGoogleMap && currentCase.location.coordinates ? (
                <GoogleMap
                  center={responderLocation || { latitude: currentCase.location.coordinates.lat, longitude: currentCase.location.coordinates.lng }}
                  markers={[{
                    id: currentCase.id,
                    type: 'EMERGENCY' as const,
                    position: { latitude: currentCase.location.coordinates.lat, longitude: currentCase.location.coordinates.lng },
                    title: currentCase.id,
                    subtitle: currentCase.location.name,
                    urgency: currentCase.urgency === 'critical' ? 'CRITICAL' : currentCase.urgency === 'high' ? 'HIGH' : undefined,
                  }]}
                  heightClass="h-full min-h-[420px]"
                  className="rounded-2xl"
                />
              ) : (
                <InteractiveMap singleCaseMode={currentCase} heightClass="h-full min-h-[420px]" lang={lang} showLayersControl={true} />
              )}
            </div>
          </div>
        )}

        {/* STATUS TAB */}
        {activeTab === 'status' && (
          <div className="flex-1 p-4 space-y-4 overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2"><Activity className="w-4 h-4 text-emerald-400" /><span>{t.unitTelemetryTitle}</span></h3>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30">ALL SYSTEMS GO</span>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-3.5 rounded-2xl bg-[#11161F] border border-[#30363D] space-y-1"><span className="text-[10px] font-mono text-gray-400 uppercase">DEFIBRILLATOR</span><p className="text-xs font-black text-emerald-400">READY (100%)</p></div>
              <div className="p-3.5 rounded-2xl bg-[#11161F] border border-[#30363D] space-y-1"><span className="text-[10px] font-mono text-gray-400 uppercase">OXYGEN CYLINDER</span><p className="text-xs font-black text-emerald-400">180 BAR (FULL)</p></div>
              <div className="p-3.5 rounded-2xl bg-[#11161F] border border-[#30363D] space-y-1"><span className="text-[10px] font-mono text-gray-400 uppercase">DIESEL FUEL</span><p className="text-xs font-black text-blue-400">82% (420 KM)</p></div>
              <div className="p-3.5 rounded-2xl bg-[#11161F] border border-[#30363D] space-y-1"><span className="text-[10px] font-mono text-gray-400 uppercase">TELEMETRY 5G</span><p className="text-xs font-black text-emerald-400">EOC LINKED</p></div>
            </div>
            <div className="p-4 rounded-2xl bg-[#11161F] border border-[#30363D] space-y-2">
              <span className="text-[10px] font-mono text-blue-400 font-bold uppercase">{isUrdu ? 'موجودہ ڈیوٹی شیڈول' : 'Current Shift Schedule'}</span>
              <div className="flex items-center justify-between text-xs"><span className="text-gray-300">Duty Window</span><span className="font-mono text-white font-bold">07:00 - 15:00</span></div>
              <div className="flex items-center justify-between text-xs"><span className="text-gray-300">Hours Active</span><span className="font-mono text-emerald-400 font-bold">5.2 hrs on duty</span></div>
              <div className="flex items-center justify-between text-xs"><span className="text-gray-300">Cases Today</span><span className="font-mono text-white font-bold">3 Emergencies</span></div>
            </div>
            <div className="p-3.5 rounded-2xl bg-[#11161F] border border-[#30363D] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-300">{isUrdu ? 'GPS خرابی سمولیٹ' : 'Simulate GPS Error State'}</span>
                <button onClick={() => setGpsErrorSimulated(!gpsErrorSimulated)} className="px-2.5 py-1 rounded-lg bg-[#0B0E14] border border-[#30363D] text-[11px] text-gray-300">{gpsErrorSimulated ? (isUrdu ? 'صاف کریں' : 'Clear') : (isUrdu ? 'ٹیسٹ' : 'Test')}</button>
              </div>
              {gpsErrorSimulated && (
                <div className="p-3 rounded-xl bg-red-950/30 border border-red-500/40 text-xs space-y-2">
                  <div className="text-red-300 font-bold flex items-center gap-1.5"><AlertOctagon className="w-4 h-4" /><span>{t.gpsRequiredNotice}</span></div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setGpsErrorSimulated(false)} className="py-1.5 px-3 rounded-lg bg-red-600 text-white font-bold text-xs">{t.enableGps}</button>
                    <button onClick={() => setGpsErrorSimulated(false)} className="py-1.5 px-3 rounded-lg bg-[#11161F] text-gray-300 font-semibold text-xs border border-[#30363D]">{t.tryAgain}</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* PROFILE TAB */}
        {activeTab === 'profile' && (
          <div className="flex-1 p-4 space-y-4 overflow-y-auto">
            <div className="p-4 rounded-3xl bg-[#11161F] border border-[#30363D] flex items-center gap-3.5 shadow-md">
              <div className="w-14 h-14 rounded-2xl bg-blue-600/30 border border-blue-500/50 text-blue-300 flex items-center justify-center font-black text-lg">AK</div>
              <div className="min-w-0">
                <h4 className="text-base font-extrabold text-white">{t.responderName}</h4>
                <p className="text-xs text-blue-300 font-medium">{t.responderRole}</p>
                <p className="text-[11px] text-gray-400 font-mono mt-0.5">Unit: AKF-07 • Base: Edhi 1122 Gulshan</p>
              </div>
            </div>
            <div className="space-y-2.5">
              <h4 className="text-xs font-mono font-bold text-gray-300 uppercase tracking-wider">{t.assignmentHistoryTitle}</h4>
              <div className="space-y-2">
                {assignmentHistory.map((item) => (
                  <div key={item.id} className="p-3 rounded-2xl bg-[#11161F] border border-[#30363D] flex items-center justify-between gap-3 text-xs">
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-white">{item.id}</span>
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-blue-500/20 text-blue-300">{isUrdu ? item.categoryUr : item.category}</span>
                      </div>
                      <p className="text-gray-300 truncate">{item.location}</p>
                    </div>
                    <div className="text-right shrink-0 font-mono text-[11px]">
                      <span className="text-emerald-400 font-bold block">{item.status}</span>
                      <span className="text-gray-400 text-[10px]">{item.time}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* BOTTOM NAVIGATION */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[#11161F]/98 backdrop-blur-xl border-t border-[#30363D] px-2 py-1 pb-[max(0.4rem,env(safe-area-inset-bottom))] shadow-2xl">
        <div className="flex items-center justify-around max-w-md mx-auto">
          <button onClick={() => setActiveTab('assignments')} className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all min-w-[64px] min-h-[48px] ${activeTab === 'assignments' ? 'text-blue-400 font-bold scale-105' : 'text-gray-400 hover:text-gray-200'}`}>
            <Ambulance className="w-5 h-5 mb-0.5" /><span className="text-[10px] tracking-tight whitespace-nowrap">{isUrdu ? 'اسائنمنٹ' : 'Assignments'}</span>
          </button>
          <button onClick={() => setActiveTab('map')} className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all min-w-[64px] min-h-[48px] ${activeTab === 'map' ? 'text-blue-400 font-bold scale-105' : 'text-gray-400 hover:text-gray-200'}`}>
            <NavIcon className="w-5 h-5 mb-0.5" /><span className="text-[10px] tracking-tight whitespace-nowrap">{isUrdu ? 'نقشہ' : 'Map Nav'}</span>
          </button>
          <button onClick={() => setActiveTab('status')} className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all min-w-[64px] min-h-[48px] ${activeTab === 'status' ? 'text-emerald-400 font-bold scale-105' : 'text-gray-400 hover:text-gray-200'}`}>
            <Activity className="w-5 h-5 mb-0.5" /><span className="text-[10px] tracking-tight whitespace-nowrap">{isUrdu ? 'اسٹیٹس' : 'Unit Status'}</span>
          </button>
          <button onClick={() => setActiveTab('profile')} className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all min-w-[64px] min-h-[48px] ${activeTab === 'profile' ? 'text-blue-400 font-bold scale-105' : 'text-gray-400 hover:text-gray-200'}`}>
            <User className="w-5 h-5 mb-0.5" /><span className="text-[10px] tracking-tight whitespace-nowrap">{isUrdu ? 'پروفائل' : 'Profile'}</span>
          </button>
        </div>
      </nav>

      {/* MODALS */}
      {showCaseDetailsSheet && <ResponderCaseDetailsSheet emergencyCase={currentCase} onClose={() => setShowCaseDetailsSheet(false)} />}
      {showSupportModal && <ResponderSupportModal caseId={currentCase.id} onClose={() => setShowSupportModal(false)} onSubmitSupportRequest={handleSendSupportRequest} />}
    </div>
    </AuthGuard>
  );
}
