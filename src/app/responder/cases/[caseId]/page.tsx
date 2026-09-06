'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useLanguage } from '@/i18n/LanguageContext';
import { getTranslation } from '@/i18n/translations';
import { useAuth } from '@/lib/auth/AuthContext';
import AuthGuard from '@/components/AuthGuard';
import GoogleMap from '@/components/maps/GoogleMap';
import { isGoogleMapsConfigured } from '@/lib/maps/googleMapsLoader';
import { probePermissionState } from '@/lib/maps/geolocation';
import { PositionTracker } from '@/lib/maps/positionTracker';
import type { LocationSharingStatus } from '@/lib/maps/geolocationUi';
import type { MapMarkerData, GeoPoint } from '@/lib/maps/types';
import {
  ArrowLeft,
  AlertOctagon,
  AlertTriangle,
  Brain,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  Globe,
  Loader2,
  MapPin,
  Navigation,
  Phone,
  PhoneCall,
  Radio,
  ShieldCheck,
  User,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────

interface ResponderCaseDetail {
  assignmentId: string;
  assignmentStatus: string;
  assignedAt: string;
  acceptedAt: string | null;
  enRouteAt: string | null;
  arrivedAt: string | null;
  completedAt: string | null;
  ambulance: { id: string; identifier: string; vehicleNumber: string } | null;
  resource: { id: string; name: string; type: string } | null;
  caseCode: string;
  caseStatus: string;
  urgency: string;
  categories: string[];
  originalMessage: string;
  locationText: string | null;
  latitude: number | null;
  longitude: number | null;
  locationConfirmed: boolean;
  primaryContact: string | null;
  aiSummary: string | null;
  aiReasoning: string | null;
  keyNeeds: string[] | null;
  specialNeeds: string[] | null;
  peopleAffected: number | null;
  detectedLanguage: string | null;
  createdAt: string;
}

// ─── Config ─────────────────────────────────────────────────

const URGENCY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  CRITICAL: { label: 'CRITICAL', color: '#F85149', bg: 'rgba(248,81,73,0.1)' },
  HIGH: { label: 'HIGH', color: '#F0883E', bg: 'rgba(240,136,62,0.1)' },
  MEDIUM: { label: 'MEDIUM', color: '#D29922', bg: 'rgba(210,153,34,0.1)' },
  LOW: { label: 'LOW', color: '#58A6FF', bg: 'rgba(88,166,255,0.1)' },
};

const ASSIGNMENT_STATUS: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'Pending Acceptance', color: '#D29922' },
  ACCEPTED: { label: 'Accepted', color: '#3FB950' },
  EN_ROUTE: { label: 'En Route', color: '#F0883E' },
  ARRIVED: { label: 'Arrived at Scene', color: '#3FB950' },
  COMPLETED: { label: 'Completed', color: '#8B949E' },
};

const CASE_STATUS_LABELS: Record<string, string> = {
  NEW: 'Submitted',
  UNDER_REVIEW: 'Under Review',
  ASSIGNED: 'Assigned',
  RESPONDER_ACCEPTED: 'Accepted',
  EN_ROUTE: 'En Route',
  ARRIVED: 'Arrived',
  COMPLETED: 'Completed',
  CLOSED: 'Closed',
};

/** How often the last watched position is pushed to the backend. */
const LOCATION_REPORT_INTERVAL_MS = 15_000;

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-PK', { day: 'numeric', month: 'short' }) + ' ' + formatTime(dateStr);
}

// ─── Page Component ─────────────────────────────────────────

export default function ResponderCaseDetailPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const router = useRouter();
  const { lang, isUrdu, toggleLang } = useLanguage();
  const t = getTranslation(lang);
  const { user, logout } = useAuth();

  const [data, setData] = useState<ResponderCaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [gpsStatus, setGpsStatus] = useState<'unknown' | 'available' | 'denied' | 'unavailable'>('unknown');
  const [responderLocation, setResponderLocation] = useState<GeoPoint | null>(null);
  const [locationSharingStatus, setLocationSharingStatus] = useState<LocationSharingStatus>('off');
  // Only a deliberate action on this screen may raise it - never the 10s poll.
  const [sharingRequested, setSharingRequested] = useState(false);

  // A single watcher for the whole screen, held in a ref: the poll replaces
  // `data` with a new object every 10 seconds, and that must not be able to
  // open a second subscription or re-ask the browser for permission.
  const trackerRef = useRef<PositionTracker | null>(null);
  if (!trackerRef.current) {
    trackerRef.current = new PositionTracker({
      onFix: (fix) => {
        setResponderLocation({ latitude: fix.latitude, longitude: fix.longitude });
        setGpsStatus('available');
        setLocationSharingStatus('active');
      },
      onError: (result) => {
        if (result.status === 'DENIED') {
          setLocationSharingStatus('blocked');
          setGpsStatus('denied');
        } else {
          setLocationSharingStatus('error');
          setGpsStatus('unavailable');
        }
      },
      // Lost signal is re-armed by the tracker on a bounded backoff, so the
      // panel says "reconnecting" instead of pretending tracking is still live.
      onReconnect: () => setLocationSharingStatus('retrying'),
    });
  }

  // Assignment id as a PRIMITIVE, and only while the response is still open, so
  // completion tears the subscription down without re-running on every poll.
  const trackedAssignmentId =
    data && data.assignmentStatus !== 'COMPLETED' && !['COMPLETED', 'CLOSED'].includes(data.caseStatus)
      ? data.assignmentId
      : null;

  // Must be called synchronously from a click handler, before any await.
  const startLocationSharing = (force = false) => {
    setSharingRequested(true);
    setLocationSharingStatus('starting');
    trackerRef.current?.start({ force });
  };
  const stopLocationSharing = () => {
    setSharingRequested(false);
    trackerRef.current?.stop();
    setLocationSharingStatus('off');
  };

  // ─── Fetch case detail ──────────────────────────────────
  const fetchCase = useCallback(async () => {
    try {
      const res = await fetch(`/api/responder/cases/${caseId}`);
      if (res.status === 401 || res.status === 403) {
        router.replace('/login');
        return;
      }
      if (res.status === 404) {
        setError('Assignment not found for this case');
        return;
      }
      if (!res.ok) {
        setError('Failed to load case');
        return;
      }
      const json = await res.json();
      setData(json);
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, [caseId, router]);

  useEffect(() => { fetchCase(); }, [fetchCase]);

  useEffect(() => {
    // Read-only probe of the STORED permission so a blocked browser can be
    // explained without ever spending a prompt. No geolocation on mount.
    void probePermissionState();
  }, []);

  // Poll for active cases
  useEffect(() => {
    if (!data) return;
    if (['COMPLETED', 'CLOSED'].includes(data.caseStatus)) return;
    if (data.assignmentStatus === 'COMPLETED') return;
    const interval = setInterval(fetchCase, 10000);
    return () => clearInterval(interval);
  }, [data, fetchCase]);

  // ─── Live location reporting ───────────────────────────
  // Keyed on PRIMITIVES only. This effect never calls navigator.geolocation;
  // it forwards whatever the single user-started watcher last observed.
  useEffect(() => {
    if (!sharingRequested || trackedAssignmentId === null) {
      trackerRef.current?.stop();
      setLocationSharingStatus((prev) => (prev === 'blocked' ? prev : 'off'));
      return;
    }

    // Idempotent + gated: keeps the click's intent alive across polls without
    // ever opening a second watcher or re-prompting a known-denied permission.
    trackerRef.current?.start();

    const report = () => {
      const fix = trackerRef.current?.consumeNewFix();
      if (!fix) return;
      fetch('/api/responder/location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignmentId: trackedAssignmentId,
          latitude: fix.latitude,
          longitude: fix.longitude,
          accuracy: fix.accuracy ?? undefined,
        }),
      })
        .then((res) => { if (!res.ok) setLocationSharingStatus('error'); })
        .catch(() => setLocationSharingStatus('error'));
    };

    report();
    const interval = setInterval(report, LOCATION_REPORT_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [sharingRequested, trackedAssignmentId]);

  // Unmount: the subscription must never outlive the screen.
  useEffect(() => () => trackerRef.current?.stop(), []);

  // ─── Toast auto-dismiss ──────────────────────────────────
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // ─── Status actions ──────────────────────────────────────
  const transitionStatus = async (newStatus: string) => {
    if (!data) return;
    // Accepting / rolling out / arriving are the meaningful actions that also
    // consent to live sharing. Started before the await, while the click is
    // still a real user gesture. Completing stops it.
    if (['ACCEPTED', 'EN_ROUTE', 'ARRIVED'].includes(newStatus)) startLocationSharing();
    setActionLoading(true);
    try {
      const res = await fetch(`/api/responder/assignments/${data.assignmentId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newStatus }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed');
      }
      if (newStatus === 'COMPLETED') stopLocationSharing();
      await fetchCase();
      const labels: Record<string, string> = {
        ACCEPTED: isUrdu ? 'کیس قبول کر لیا گیا!' : 'Assignment Accepted!',
        EN_ROUTE: isUrdu ? 'راستے میں مارک کیا گیا' : 'Marked En Route!',
        ARRIVED: isUrdu ? 'موقع پر پہنچ گئے' : 'Arrived at scene!',
        COMPLETED: isUrdu ? 'امدادی کارروائی مکمل' : 'Response completed!',
      };
      setToast(labels[newStatus] || `Status: ${newStatus}`);
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  // ─── Derived state ───────────────────────────────────────
  const hasGps = data?.latitude != null && data?.longitude != null;
  const urgencyCfg = data ? URGENCY_CONFIG[data.urgency] || URGENCY_CONFIG.MEDIUM : null;
  const statusCfg = data ? ASSIGNMENT_STATUS[data.assignmentStatus] || ASSIGNMENT_STATUS.PENDING : null;

  // Map markers
  const mapMarkers: MapMarkerData[] = [];
  if (hasGps && data) {
    mapMarkers.push({
      id: 'emergency',
      position: { latitude: data.latitude!, longitude: data.longitude! },
      title: data.caseCode,
      subtitle: data.locationText || 'Emergency',
      type: 'EMERGENCY',
      urgency: data.urgency as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | undefined,
    });
  }
  if (responderLocation) {
    mapMarkers.push({
      id: 'responder',
      position: responderLocation,
      title: 'Your Location',
      subtitle: 'Current Position',
      type: 'RESPONDER',
    });
  }

  // Google Maps navigation link
  const navLink = hasGps && data
    ? `https://www.google.com/maps/dir/?api=1&destination=${data.latitude},${data.longitude}&travelmode=driving`
    : null;

  return (
    <AuthGuard requiredRole="RESPONDER">
    <div dir={isUrdu ? 'rtl' : 'ltr'} className="min-h-screen bg-[#06080C] text-[#E6EDF3] flex flex-col font-sans pb-4">
      {/* Toast */}
      {toast && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-sm p-3 rounded-2xl bg-[#161B22]/98 backdrop-blur-xl border border-blue-500/50 shadow-2xl text-xs font-semibold text-white flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping shrink-0" />
            <span className="truncate">{toast}</span>
          </div>
          <button onClick={() => setToast(null)} className="p-1 text-gray-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Top Bar */}
      <header className="bg-[#11161F] border-b border-[#30363D] px-3.5 py-2.5 flex items-center justify-between gap-2 shrink-0 z-30 sticky top-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <Link href="/responder" className="p-1.5 rounded-xl bg-[#0B0E14] hover:bg-[#161B22] border border-[#30363D] text-gray-300 hover:text-white shrink-0 min-h-[38px] min-w-[38px] flex items-center justify-center transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-xs font-black text-white truncate">{data?.caseCode || 'Loading...'}</span>
              {data && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase shrink-0"
                  style={{ color: urgencyCfg?.color, backgroundColor: urgencyCfg?.bg, border: `1px solid ${urgencyCfg?.color}30` }}>
                  {urgencyCfg?.label}
                </span>
              )}
            </div>
            {data && (
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: statusCfg?.color }} />
                <span className="text-[10px] font-mono font-bold" style={{ color: statusCfg?.color }}>{statusCfg?.label}</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={toggleLang} className="px-2.5 py-1.5 rounded-xl bg-[#0B0E14] hover:bg-[#161B22] border border-[#30363D] text-xs font-mono text-gray-200 hover:text-white flex items-center gap-1 min-h-[38px]">
            <Globe className="w-3.5 h-3.5 text-blue-400" /><span>{isUrdu ? 'EN' : 'اردو'}</span>
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="w-full max-w-md md:max-w-lg mx-auto flex-1 flex flex-col">
        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-32">
            <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex flex-col items-center justify-center py-32 gap-4">
            <AlertTriangle className="w-12 h-12 text-[#F85149]" />
            <p className="text-[#8B949E] text-sm">{error}</p>
            <Link href="/responder" className="text-blue-400 text-sm hover:underline">Back to Dashboard</Link>
          </div>
        )}

        {/* Case Data */}
        {data && (
          <div className="flex-1 flex flex-col gap-3 p-3.5">
            {/* ── STATUS PROGRESSION BAR ── */}
            <div className="p-3 rounded-2xl bg-[#11161F] border border-[#30363D]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono text-gray-400 font-bold uppercase">Assignment Status</span>
                <span className="text-[10px] font-mono font-bold" style={{ color: statusCfg?.color }}>{statusCfg?.label}</span>
              </div>
              <div className="flex items-center gap-1">
                {['PENDING', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'COMPLETED'].map((step, i) => {
                  const steps = ['PENDING', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'COMPLETED'];
                  const currentIdx = steps.indexOf(data.assignmentStatus);
                  const isComplete = i <= currentIdx;
                  const isCurrent = i === currentIdx;
                  return (
                    <div key={step} className="flex-1 flex items-center gap-1">
                      <div className={`h-1.5 flex-1 rounded-full transition-all ${isComplete ? 'bg-blue-500' : 'bg-[#21262D]'} ${isCurrent ? 'ring-2 ring-blue-400/40' : ''}`} />
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-[8px] font-mono text-gray-500">PENDING</span>
                <span className="text-[8px] font-mono text-gray-500">COMPLETE</span>
              </div>
            </div>

            {/* ── PRIMARY ACTION BUTTON ── */}
            {data.assignmentStatus === 'PENDING' && (
              <button
                onClick={() => transitionStatus('ACCEPTED')}
                disabled={actionLoading}
                className="w-full py-4 px-6 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-black text-base tracking-wide shadow-2xl shadow-red-900/60 ring-2 ring-red-500/60 active:scale-95 transition-all flex items-center justify-center gap-2 min-h-[56px] disabled:opacity-50"
              >
                {actionLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                <span>{isUrdu ? 'اسائنمنٹ قبول کریں' : 'Accept Assignment'}</span>
              </button>
            )}
            {data.assignmentStatus === 'ACCEPTED' && (
              <button
                onClick={() => transitionStatus('EN_ROUTE')}
                disabled={actionLoading}
                className="w-full py-4 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-base shadow-2xl shadow-emerald-900/50 ring-2 ring-emerald-500/50 active:scale-95 transition-all flex items-center justify-center gap-2 min-h-[56px] disabled:opacity-50"
              >
                {actionLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Navigation className="w-5 h-5" />}
                <span>{isUrdu ? 'راستے میں ہوں' : 'Start Route / En Route'}</span>
              </button>
            )}
            {data.assignmentStatus === 'EN_ROUTE' && (
              <button
                onClick={() => transitionStatus('ARRIVED')}
                disabled={actionLoading}
                className="w-full py-4 px-6 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-black text-base shadow-2xl shadow-blue-900/50 ring-2 ring-blue-500/50 active:scale-95 transition-all flex items-center justify-center gap-2 min-h-[56px] disabled:opacity-50"
              >
                {actionLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <MapPin className="w-5 h-5" />}
                <span>{isUrdu ? 'پہنچ گیا' : 'Mark Arrived'}</span>
              </button>
            )}
            {data.assignmentStatus === 'ARRIVED' && (
              <button
                onClick={() => transitionStatus('COMPLETED')}
                disabled={actionLoading}
                className="w-full py-4 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-base shadow-2xl shadow-emerald-900/50 ring-2 ring-emerald-500/50 active:scale-95 transition-all flex items-center justify-center gap-2 min-h-[56px] disabled:opacity-50"
              >
                {actionLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                <span>{isUrdu ? 'کیس مکمل کریں' : 'Complete Case'}</span>
              </button>
            )}
            {data.assignmentStatus === 'COMPLETED' && (
              <div className="p-4 rounded-2xl bg-emerald-600/10 border border-emerald-500/30 text-center space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                <p className="text-sm font-bold text-emerald-400">{isUrdu ? 'امدادی کارروائی مکمل' : 'Response Completed'}</p>
                <Link href="/responder" className="text-xs text-blue-400 hover:underline">{isUrdu ? 'ڈیش بورڈ پر واپس' : 'Back to Dashboard'}</Link>
              </div>
            )}

            {/* ── MAP + NAVIGATION ── */}
            <section className="rounded-2xl border border-[#30363D] bg-[#11161F] overflow-hidden">
              <div className="p-3 border-b border-[#21262D] flex items-center justify-between">
                <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-[#F85149]" />
                  {isUrdu ? 'مقام' : 'Location'}
                  {hasGps
                    ? <span className="text-[10px] text-emerald-400 font-normal">GPS available</span>
                    : <span className="text-[10px] text-amber-400 font-normal">Text location only</span>}
                </h3>
                {navLink && (
                  <a href={navLink} target="_blank" rel="noopener noreferrer"
                    className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold flex items-center gap-1 transition-colors">
                    <Navigation className="w-3 h-3" /> Navigate
                  </a>
                )}
              </div>
              <div className="h-52">
                {hasGps && isGoogleMapsConfigured() ? (
                  <GoogleMap
                    center={{ latitude: data.latitude!, longitude: data.longitude! }}
                    zoom={15}
                    markers={mapMarkers}
                    heightClass="h-full"
                  />
                ) : hasGps ? (
                  <div className="flex items-center justify-center h-full bg-[#0B0E14] text-[#6E7681] text-xs">Map loading...</div>
                ) : (
                  <div className="flex items-center justify-center h-full bg-[#0B0E14] text-[#6E7681] text-xs px-4 text-center">
                    No GPS — see text location below
                  </div>
                )}
              </div>
              {/* Location text */}
              <div className="p-3 space-y-1">
                <p className="text-xs text-[#C9D1D9] flex items-start gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-[#F85149] shrink-0 mt-0.5" />
                  {data.locationText || (hasGps ? `${data.latitude}, ${data.longitude}` : 'No location provided')}
                  {!data.locationConfirmed && data.locationText && <span className="text-[10px] text-amber-400">(unconfirmed)</span>}
                </p>
                {hasGps && (
                  <p className="text-[10px] text-[#6E7681] font-mono pl-5">{data.latitude?.toFixed(5)}, {data.longitude?.toFixed(5)}</p>
                )}
              </div>
            </section>

            {/* ── GPS / LOCATION SHARING (opt-in, one watcher) ── */}
            <div className={`p-2.5 rounded-xl border text-xs space-y-2 ${
              locationSharingStatus === 'active' ? 'bg-emerald-500/5 border-emerald-500/20' :
              locationSharingStatus === 'blocked' || locationSharingStatus === 'error' ? 'bg-amber-500/5 border-amber-500/20' :
              'bg-[#11161F] border-[#30363D]'
            }`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${
                    locationSharingStatus === 'active' ? 'bg-emerald-400 animate-ping' :
                    locationSharingStatus === 'blocked' || locationSharingStatus === 'error' ? 'bg-amber-400' :
                    gpsStatus === 'denied' ? 'bg-amber-400' :
                    'bg-gray-500'
                  }`} />
                  <span className={`font-mono font-bold text-[10px] truncate ${
                    locationSharingStatus === 'active' ? 'text-emerald-400' :
                    locationSharingStatus === 'blocked' || locationSharingStatus === 'error' || locationSharingStatus === 'retrying' ? 'text-amber-400' :
                    'text-gray-400'
                  }`}>
                    {locationSharingStatus === 'active' ? t.gpsStatusReady :
                     locationSharingStatus === 'starting' ? t.sharingStatusStarting :
                     locationSharingStatus === 'blocked' ? t.sharingStatusBlocked :
                     locationSharingStatus === 'retrying' ? t.sharingStatusRetrying :
                     locationSharingStatus === 'error' ? t.sharingStatusError :
                     t.sharingStatusOff}
                  </span>
                </div>
                {trackedAssignmentId !== null && (
                  sharingRequested ? (
                    <button
                      type="button"
                      onClick={stopLocationSharing}
                      className="shrink-0 py-1.5 px-2.5 rounded-lg bg-[#11161F] hover:bg-[#161B22] border border-[#30363D] text-gray-300 text-[10px] font-bold min-h-[34px]"
                    >
                      {t.stopLocationSharing}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startLocationSharing(false)}
                      className="shrink-0 py-1.5 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold min-h-[34px]"
                    >
                      {t.startLocationSharing}
                    </button>
                  )
                )}
              </div>
              {locationSharingStatus === 'blocked' && (
                <p className="text-[10px] leading-relaxed text-amber-400" role="status">{t.gpsBlockedResponder}</p>
              )}
              <p className="text-[10px] leading-relaxed text-[#6E7681]">{t.sharingConsentNotice}</p>
            </div>

            {/* ── CASE INFORMATION ── */}
            <section className="p-3.5 rounded-2xl bg-[#11161F] border border-[#30363D] space-y-3">
              <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                <AlertOctagon className="w-3.5 h-3.5 text-[#F85149]" />
                {isUrdu ? 'ہنگامی تفصیلات' : 'Emergency Details'}
              </h3>

              {/* Categories */}
              <div className="flex flex-wrap gap-1.5">
                {data.categories.map((cat) => (
                  <span key={cat} className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#0B0E14] text-[#8B949E] border border-[#30363D] uppercase">{cat}</span>
                ))}
                <span className="px-2 py-0.5 rounded text-[10px] font-bold" style={{ color: urgencyCfg?.color, backgroundColor: urgencyCfg?.bg, border: `1px solid ${urgencyCfg?.color}30` }}>
                  {urgencyCfg?.label}
                </span>
              </div>

              {/* Case status */}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-[#6E7681] font-bold">Case Status:</span>
                <span className="text-white font-bold">{CASE_STATUS_LABELS[data.caseStatus] || data.caseStatus}</span>
              </div>

              {/* Original message */}
              <div>
                <span className="text-[10px] font-mono text-[#6E7681] font-bold block mb-1">{isUrdu ? 'اصل پیغام' : 'ORIGINAL MESSAGE'}</span>
                <p className="text-xs text-[#C9D1D9] leading-relaxed bg-[#0B0E14] p-2.5 rounded-xl border border-[#21262D]">&quot;{data.originalMessage}&quot;</p>
              </div>

              {/* Timestamps */}
              <div className="flex items-center gap-3 text-[10px] text-[#6E7681]">
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Created: {formatDate(data.createdAt)}</span>
                {data.detectedLanguage && <span>Lang: {data.detectedLanguage}</span>}
                {data.peopleAffected != null && <span>{data.peopleAffected} affected</span>}
              </div>
            </section>

            {/* ── ASSIGNMENT INFO ── */}
            <section className="p-3.5 rounded-2xl bg-[#11161F] border border-[#30363D] space-y-2">
              <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-blue-400" />
                {isUrdu ? 'اسائنمنٹ' : 'Assignment'}
              </h3>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded-xl bg-[#0B0E14] border border-[#21262D]">
                  <span className="text-[9px] font-mono text-gray-500 block">ASSIGNED</span>
                  <span className="text-[11px] font-bold text-white">{formatTime(data.assignedAt)}</span>
                </div>
                <div className="p-2 rounded-xl bg-[#0B0E14] border border-[#21262D]">
                  <span className="text-[9px] font-mono text-gray-500 block">STATUS</span>
                  <span className="text-[11px] font-bold" style={{ color: statusCfg?.color }}>{statusCfg?.label}</span>
                </div>
              </div>
              {data.ambulance && (
                <div className="text-xs text-[#8B949E] flex items-center gap-1.5">
                  <Navigation className="w-3 h-3 text-emerald-400" />
                  {data.ambulance.identifier} — {data.ambulance.vehicleNumber}
                </div>
              )}
              {data.resource && (
                <div className="text-xs text-[#8B949E] flex items-center gap-1.5">
                  <User className="w-3 h-3 text-blue-400" />
                  {data.resource.name} ({data.resource.type})
                </div>
              )}
              {/* Status timestamps */}
              <div className="space-y-1 pt-1 border-t border-[#21262D]">
                {data.acceptedAt && <p className="text-[10px] text-[#6E7681] flex items-center gap-1"><Check className="w-3 h-3 text-emerald-400" /> Accepted: {formatTime(data.acceptedAt)}</p>}
                {data.enRouteAt && <p className="text-[10px] text-[#6E7681] flex items-center gap-1"><Navigation className="w-3 h-3 text-orange-400" /> En Route: {formatTime(data.enRouteAt)}</p>}
                {data.arrivedAt && <p className="text-[10px] text-[#6E7681] flex items-center gap-1"><MapPin className="w-3 h-3 text-blue-400" /> Arrived: {formatTime(data.arrivedAt)}</p>}
                {data.completedAt && <p className="text-[10px] text-[#6E7681] flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-gray-400" /> Completed: {formatTime(data.completedAt)}</p>}
              </div>
            </section>

            {/* ── AI SUMMARY (clearly separated) ── */}
            {data.aiSummary && (
              <section className="p-3.5 rounded-2xl border border-[#3FB950]/20 bg-[#3FB950]/5 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-[#3FB950] flex items-center gap-1.5">
                    <Brain className="w-3.5 h-3.5" />
                    {isUrdu ? 'اے آئی خلاصہ' : 'AI Summary'}
                  </h3>
                  <span className="text-[8px] font-mono text-[#6E7681] px-1.5 py-0.5 rounded bg-[#0B0E14] border border-[#21262D]">DECISION SUPPORT</span>
                </div>
                <p className="text-[10px] text-[#6E7681] leading-tight">AI recommendations support human responders and are not authoritative.</p>
                <p className="text-xs text-[#C9D1D9] leading-relaxed">{data.aiSummary}</p>
                {data.aiReasoning && (
                  <div>
                    <span className="text-[10px] font-mono text-[#6E7681] font-bold block mb-0.5">Reasoning</span>
                    <p className="text-[10px] text-[#8B949E] leading-relaxed">{data.aiReasoning}</p>
                  </div>
                )}
                {data.keyNeeds && data.keyNeeds.length > 0 && (
                  <div>
                    <span className="text-[10px] font-mono text-[#6E7681] font-bold block mb-1">Key Needs</span>
                    <div className="flex flex-wrap gap-1">
                      {data.keyNeeds.map((need, i) => (
                        <span key={i} className="px-1.5 py-0.5 rounded text-[10px] bg-[#3FB950]/10 text-[#3FB950] border border-[#3FB950]/20">{need}</span>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* ── CONTACT ── */}
            {data.primaryContact && (
              <div className="grid grid-cols-2 gap-2">
                <a href={`tel:${data.primaryContact}`}
                  className="py-3 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow min-h-[44px] transition-colors">
                  <PhoneCall className="w-4 h-4" /><span>{isUrdu ? 'کالر درخواست دہندہ' : 'Call Requester'}</span>
                </a>
                <a href="tel:1122"
                  className="py-3 px-3 rounded-xl bg-[#11161F] hover:bg-[#161B22] border border-[#30363D] text-white text-xs font-bold flex items-center justify-center gap-1.5 min-h-[44px] transition-colors">
                  <Phone className="w-4 h-4 text-blue-400" /><span>{isUrdu ? 'کال آپریٹر' : 'Call Operator'}</span>
                </a>
              </div>
            )}

            {/* ── SUPPORT REQUEST ── */}
            {data.assignmentStatus !== 'COMPLETED' && (
              <button
                onClick={async () => {
                  try {
                    await fetch('/api/responder/support', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        assignmentId: data.assignmentId,
                        requestType: 'OTHER',
                        details: 'Support requested by responder',
                      }),
                    });
                    setToast(isUrdu ? 'سپورٹ درخواست بھیجی گئی' : 'Support request sent');
                  } catch {
                    setToast('Failed to send support request');
                  }
                }}
                className="w-full py-3 px-4 rounded-2xl bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/40 text-amber-300 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors min-h-[44px]"
              >
                <Radio className="w-4 h-4" /><span>{isUrdu ? 'اضافی امداد کی درخواست' : 'Request Additional Support'}</span>
              </button>
            )}
          </div>
        )}
      </main>
    </div>
    </AuthGuard>
  );
}
