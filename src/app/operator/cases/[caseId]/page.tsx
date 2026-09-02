'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAuth } from '@/lib/auth/AuthContext';
import AuthGuard from '@/components/AuthGuard';
import GoogleMap from '@/components/maps/GoogleMap';
import { isGoogleMapsConfigured } from '@/lib/maps/googleMapsLoader';
import type { MapMarkerData } from '@/lib/maps/types';
import {
  ArrowLeft,
  AlertOctagon,
  AlertTriangle,
  Brain,
  Clock,
  FileText,
  Globe,
  Loader2,
  MapPin,
  MessageSquare,
  Phone,
  Radio,
  Send,
  Shield,
  ShieldCheck,
  User,
  Users,
  CheckCircle2,
  Navigation,
  Mic,
  LogOut,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────

interface CaseDetail {
  caseCode: string;
  source: string;
  status: string;
  urgency: string | null;
  primaryContact: string;
  alternateContact: string | null;
  originalMessage: string;
  transcript: string | null;
  locationText: string | null;
  latitude: number | null;
  longitude: number | null;
  locationAccuracy: number | null;
  locationConfirmed: boolean;
  detectedLanguage: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  aiSummary: string | null;
  aiReasoning: string | null;
  aiConfidence: number | null;
  keyNeeds: string[];
  specialNeeds: string[];
  missingInformation: string[];
  followUpQuestion: string | null;
  potentiallyCritical: boolean;
  peopleAffected: number | null;
  locationTextDetected: string | null;
  categories: string[];
  assignments: Assignment[];
  updates: CaseUpdate[];
  voiceSessions: VoiceSession[];
}

interface Assignment {
  id: string;
  status: string;
  assignedAt: string;
  acceptedAt: string | null;
  enRouteAt: string | null;
  arrivedAt: string | null;
  completedAt: string | null;
  responder: {
    id: string;
    name: string;
    phone: string;
    responderType: string;
    availabilityStatus: string;
    currentLatitude: number | null;
    currentLongitude: number | null;
  } | null;
  ambulance: {
    id: string;
    identifier: string;
    vehicleNumber: string;
    currentLatitude: number | null;
    currentLongitude: number | null;
  } | null;
  resource: {
    id: string;
    name: string;
    type: string;
    phone: string | null;
  } | null;
  operator: { id: string; name: string } | null;
}

interface CaseUpdate {
  id: string;
  updateType: string;
  message: string;
  createdAt: string;
  createdByUser: { name: string } | null;
}

interface VoiceSession {
  id: string;
  status: string;
  callerNumber: string;
  detectedLanguage: string | null;
  transcriptText: string | null;
  turnCount: number;
  startedAt: string;
  endedAt: string | null;
  failureReason: string | null;
  turns: { speaker: string; transcript: string; detectedLanguage: string | null; createdAt: string }[];
}

interface AvailableResource {
  responders: { id: string; name: string; phone: string; responderType: string; availabilityStatus: string }[];
  ambulances: { id: string; identifier: string; vehicleNumber: string; availabilityStatus: string; responderName?: string }[];
  resources: { id: string; name: string; type: string; availabilityStatus: string }[];
}

// ─── Status / Urgency helpers ───────────────────────────────

const STATUS_LABELS: Record<string, { en: string; color: string }> = {
  NEW: { en: 'Submitted', color: '#58A6FF' },
  UNDER_REVIEW: { en: 'Under Review', color: '#D29922' },
  NEEDS_INFORMATION: { en: 'Needs Info', color: '#D29922' },
  ASSIGNED: { en: 'Assigned', color: '#3FB950' },
  RESPONDER_ACCEPTED: { en: 'Accepted', color: '#3FB950' },
  EN_ROUTE: { en: 'En Route', color: '#F0883E' },
  ARRIVED: { en: 'Arrived', color: '#3FB950' },
  COMPLETED: { en: 'Completed', color: '#8B949E' },
  CLOSED: { en: 'Closed', color: '#6E7681' },
};

const URGENCY_CONFIG: Record<string, { en: string; color: string; bg: string }> = {
  CRITICAL: { en: 'CRITICAL', color: '#F85149', bg: 'rgba(248,81,73,0.1)' },
  HIGH: { en: 'HIGH', color: '#F0883E', bg: 'rgba(240,136,62,0.1)' },
  MEDIUM: { en: 'MEDIUM', color: '#D29922', bg: 'rgba(210,153,34,0.1)' },
  LOW: { en: 'LOW', color: '#58A6FF', bg: 'rgba(88,166,255,0.1)' },
};

const UPDATE_ICONS: Record<string, string> = {
  CASE_CREATED: '📋',
  AI_TRIAGED: '🤖',
  AI_ANALYSIS_COMPLETED: '🤖',
  AI_ANALYSIS_FAILED: '⚠️',
  PRIORITY_CHANGED: '⚡',
  AMBULANCE_ASSIGNED: '🚑',
  RESPONDER_ACCEPTED: '✅',
  EN_ROUTE: '🚨',
  ARRIVED: '📍',
  COMPLETED: '✅',
  OPERATOR_NOTE: '📝',
  VOICE_CALL_STARTED: '📞',
  VOICE_TRANSCRIPT_UPDATED: '🎙️',
  VOICE_CALL_COMPLETED: '📞',
  VOICE_CALL_DISCONNECTED: '📴',
};

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ' ' + formatTime(dateStr);
}

// ─── Page Component ─────────────────────────────────────────

export default function OperatorCaseDetailPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const router = useRouter();
  const { isUrdu, toggleLang } = useLanguage();
  const { user, logout } = useAuth();

  const [caseData, setCaseData] = useState<CaseDetail | null>(null);
  const [availableResources, setAvailableResources] = useState<AvailableResource | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [selectedResponder, setSelectedResponder] = useState('');
  const [selectedAmbulance, setSelectedAmbulance] = useState('');
  const [noteText, setNoteText] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);
  const [assignSuccess, setAssignSuccess] = useState(false);

  const fetchCase = useCallback(async () => {
    try {
      const res = await fetch(`/api/operator/cases/${caseId}`);
      if (res.status === 401 || res.status === 403) {
        router.replace('/login');
        return;
      }
      if (!res.ok) {
        setError(res.status === 404 ? 'Case not found' : 'Failed to load case');
        return;
      }
      const data = await res.json();
      setCaseData(data);
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, [caseId, router]);

  const fetchResources = useCallback(async () => {
    try {
      const res = await fetch(`/api/operator/cases/${caseId}/assign`);
      if (res.ok) {
        setAvailableResources(await res.json());
      }
    } catch { /* non-critical */ }
  }, [caseId]);

  useEffect(() => { fetchCase(); }, [fetchCase]);
  useEffect(() => { fetchResources(); }, [fetchResources]);

  // Poll for updates if case is active
  useEffect(() => {
    if (!caseData) return;
    const isActive = !['COMPLETED', 'CLOSED'].includes(caseData.status);
    if (!isActive) return;
    const interval = setInterval(fetchCase, 15000);
    return () => clearInterval(interval);
  }, [caseData, fetchCase]);

  const handleAssign = async () => {
    if (!selectedResponder) return;
    setAssigning(true);
    try {
      const res = await fetch(`/api/operator/cases/${caseId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          responderId: selectedResponder,
          ambulanceId: selectedAmbulance || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Assignment failed');
        return;
      }
      setAssignSuccess(true);
      setSelectedResponder('');
      setSelectedAmbulance('');
      await fetchCase();
      await fetchResources();
      setTimeout(() => setAssignSuccess(false), 3000);
    } catch {
      alert('Network error');
    } finally {
      setAssigning(false);
    }
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    setSubmittingNote(true);
    try {
      const res = await fetch(`/api/operator/cases/${caseId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: noteText.trim() }),
      });
      if (res.ok) {
        setNoteText('');
        await fetchCase();
      }
    } catch { /* ignore */ }
    finally { setSubmittingNote(false); }
  };

  const hasGps = caseData?.latitude != null && caseData?.longitude != null;
  const activeAssignment = caseData?.assignments?.find(a =>
    ['PENDING', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED'].includes(a.status)
  );
  const completedAssignment = caseData?.assignments?.find(a => a.status === 'COMPLETED');
  const isClosedCase = ['COMPLETED', 'CLOSED', 'DUPLICATE'].includes(caseData?.status || '');

  // Map markers
  const mapMarkers: MapMarkerData[] = [];
  if (hasGps && caseData) {
    mapMarkers.push({
      id: 'emergency',
      position: { latitude: caseData.latitude!, longitude: caseData.longitude! },
      title: caseData.caseCode,
      subtitle: caseData.locationText || 'Emergency Location',
      type: 'EMERGENCY',
      urgency: caseData.urgency as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | undefined,
    });
  }
  if (activeAssignment?.responder?.currentLatitude && activeAssignment?.responder?.currentLongitude) {
    mapMarkers.push({
      id: 'responder',
      position: { latitude: activeAssignment.responder.currentLatitude, longitude: activeAssignment.responder.currentLongitude },
      title: activeAssignment.responder.name,
      subtitle: activeAssignment.ambulance?.identifier || 'Responder',
      type: 'RESPONDER',
    });
  }

  return (
    <AuthGuard requiredRole="OPERATOR">
    <div dir={isUrdu ? 'rtl' : 'ltr'} className="min-h-screen bg-[#080B10] text-[#E6EDF3] flex flex-col font-sans">
      {/* Top Bar */}
      <header className="bg-[#11161F] border-b border-[#30363D] px-4 sm:px-6 py-2.5 shrink-0 z-30 sticky top-0">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/operator" className="p-1.5 rounded-lg hover:bg-[#161B22] text-gray-400 hover:text-white transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-extrabold text-white text-sm truncate">{caseData?.caseCode || 'Loading...'}</span>
              {caseData && (
                <>
                  <span className="text-gray-500 hidden sm:inline">•</span>
                  <StatusBadge status={caseData.status} />
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {user && (
              <div className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-xl bg-[#0B0E14] border border-[#30363D] text-xs">
                <div className="w-6 h-6 rounded-full bg-blue-600/30 border border-blue-500/50 text-blue-300 flex items-center justify-center font-bold text-[10px]">
                  {(user.name || 'O').charAt(0)}
                </div>
                <span className="font-bold text-white text-[11px]">{user.name}</span>
                <button onClick={logout} className="p-1 text-gray-500 hover:text-red-400 transition-colors" title="Logout">
                  <LogOut className="w-3 h-3" />
                </button>
              </div>
            )}
            <button onClick={toggleLang} className="px-2.5 py-1.5 rounded-xl bg-[#0B0E14] hover:bg-[#161B22] border border-[#30363D] text-xs font-mono text-gray-200 hover:text-white transition-colors flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-blue-400" />
              <span>{isUrdu ? 'EN' : 'اردو'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-auto">
        {loading && (
          <div className="flex items-center justify-center py-32">
            <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center py-32 gap-4">
            <AlertTriangle className="w-12 h-12 text-[#F85149]" />
            <p className="text-[#8B949E] text-sm">{error}</p>
            <Link href="/operator" className="text-blue-400 text-sm hover:underline">Back to Command Center</Link>
          </div>
        )}

        {caseData && (
          <div className="max-w-7xl mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* LEFT COLUMN — Case Overview + AI + Voice */}
            <div className="lg:col-span-2 space-y-5">
              {/* Urgency + Status Banner */}
              <div className="flex flex-wrap items-center gap-3">
                {caseData.urgency && (
                  <span className="px-3 py-1.5 rounded-lg text-xs font-extrabold tracking-wider"
                    style={{ color: URGENCY_CONFIG[caseData.urgency]?.color, backgroundColor: URGENCY_CONFIG[caseData.urgency]?.bg, border: `1px solid ${URGENCY_CONFIG[caseData.urgency]?.color}30` }}>
                    {URGENCY_CONFIG[caseData.urgency]?.en}
                  </span>
                )}
                {caseData.potentiallyCritical && (
                  <span className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#F85149]/10 text-[#F85149] border border-[#F85149]/30 flex items-center gap-1.5">
                    <AlertOctagon className="w-3.5 h-3.5" /> CRITICAL FLAG
                  </span>
                )}
                {caseData.categories.map((cat) => (
                  <span key={cat} className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-[#161B22] text-[#8B949E] border border-[#21262D] uppercase">
                    {cat}
                  </span>
                ))}
                <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-[#161B22] text-[#6E7681] border border-[#21262D] flex items-center gap-1">
                  {caseData.source === 'VOICE_CALL' ? <Mic className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
                  {caseData.source === 'VOICE_CALL' ? 'VOICE' : 'WEB'}
                </span>
              </div>

              {/* Case Overview Card */}
              <section className="rounded-2xl border border-[#21262D] bg-[#11151C] p-5">
                <h2 className="text-sm font-bold text-[#E6EDF3] mb-3 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-400" /> Emergency Details
                </h2>
                <div className="space-y-3 text-sm">
                  <div>
                    <span className="text-[#6E7681] text-xs font-bold block mb-1">Original Message</span>
                    <p className="text-[#C9D1D9] leading-relaxed">{caseData.originalMessage}</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <span className="text-[#6E7681] text-xs font-bold block mb-1">Primary Contact</span>
                      <span className="text-[#C9D1D9] flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-[#3FB950]" />{caseData.primaryContact}</span>
                    </div>
                    {caseData.alternateContact && (
                      <div>
                        <span className="text-[#6E7681] text-xs font-bold block mb-1">Alternate Contact</span>
                        <span className="text-[#C9D1D9] flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-[#6E7681]" />{caseData.alternateContact}</span>
                      </div>
                    )}
                  </div>
                  <div>
                    <span className="text-[#6E7681] text-xs font-bold block mb-1">Location</span>
                    <span className="text-[#C9D1D9] flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-[#F85149]" />
                      {caseData.locationText || (hasGps ? `${caseData.latitude}, ${caseData.longitude}` : 'No location available')}
                      {!caseData.locationConfirmed && caseData.locationText && <span className="text-[10px] text-[#D29922]">(unconfirmed)</span>}
                    </span>
                    {!hasGps && <p className="text-[10px] text-[#D29922] mt-1">GPS coordinates not available — assignment can still proceed</p>}
                  </div>
                  <div className="flex items-center gap-4 text-[11px] text-[#6E7681]">
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Created: {formatDate(caseData.createdAt)}</span>
                    {caseData.detectedLanguage && <span>Language: {caseData.detectedLanguage.toUpperCase()}</span>}
                    {caseData.peopleAffected != null && <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {caseData.peopleAffected} affected</span>}
                  </div>
                </div>
              </section>

              {/* AI Analysis Panel */}
              {caseData.aiSummary && (
                <section className="rounded-2xl border border-[#3FB950]/20 bg-[#3FB950]/5 p-5">
                  <h2 className="text-sm font-bold text-[#3FB950] mb-1 flex items-center gap-2">
                    <Brain className="w-4 h-4" /> AI Decision Support
                  </h2>
                  <p className="text-[10px] text-[#6E7681] mb-3">AI recommendations support human coordinators and do not automatically dispatch resources.</p>
                  <div className="space-y-3 text-sm">
                    <div>
                      <span className="text-[#6E7681] text-xs font-bold block mb-1">AI Summary</span>
                      <p className="text-[#C9D1D9] leading-relaxed">{caseData.aiSummary}</p>
                    </div>
                    {caseData.aiReasoning && (
                      <div>
                        <span className="text-[#6E7681] text-xs font-bold block mb-1">Reasoning</span>
                        <p className="text-[#8B949E] text-xs leading-relaxed">{caseData.aiReasoning}</p>
                      </div>
                    )}
                    {caseData.keyNeeds.length > 0 && (
                      <div>
                        <span className="text-[#6E7681] text-xs font-bold block mb-1">Key Needs</span>
                        <div className="flex flex-wrap gap-1.5">
                          {caseData.keyNeeds.map((need, i) => (
                            <span key={i} className="px-2 py-0.5 rounded text-[11px] bg-[#3FB950]/10 text-[#3FB950] border border-[#3FB950]/20">{need}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {caseData.specialNeeds.length > 0 && (
                      <div>
                        <span className="text-[#6E7681] text-xs font-bold block mb-1">Special Needs</span>
                        <p className="text-[#D29922] text-xs">{caseData.specialNeeds.join(', ')}</p>
                      </div>
                    )}
                    {caseData.missingInformation.length > 0 && (
                      <div>
                        <span className="text-[#6E7681] text-xs font-bold block mb-1">Missing Information</span>
                        <div className="flex flex-wrap gap-1.5">
                          {caseData.missingInformation.map((info, i) => (
                            <span key={i} className="px-2 py-0.5 rounded text-[11px] bg-[#D29922]/10 text-[#D29922] border border-[#D29922]/20">{info}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {caseData.aiConfidence != null && (
                      <span className="text-[10px] text-[#6E7681]">Confidence: {Math.round(caseData.aiConfidence * 100)}%</span>
                    )}
                  </div>
                </section>
              )}

              {/* Voice Transcript */}
              {caseData.voiceSessions && caseData.voiceSessions.length > 0 && (
                <section className="rounded-2xl border border-[#21262D] bg-[#11151C] p-5">
                  <h2 className="text-sm font-bold text-[#E6EDF3] mb-3 flex items-center gap-2">
                    <Mic className="w-4 h-4 text-purple-400" /> Voice Call Transcript
                  </h2>
                  {caseData.voiceSessions.map((session) => (
                    <div key={session.id} className="space-y-2">
                      <div className="flex items-center gap-2 text-[11px] text-[#6E7681]">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${session.status === 'COMPLETED' ? 'bg-[#3FB950]/10 text-[#3FB950]' : 'bg-[#D29922]/10 text-[#D29922]'}`}>
                          {session.status}
                        </span>
                        <span>{session.turnCount} turns</span>
                        {session.detectedLanguage && <span>Lang: {session.detectedLanguage}</span>}
                      </div>
                      {session.turns.length > 0 && (
                        <div className="space-y-1.5 max-h-60 overflow-y-auto">
                          {session.turns.map((turn, i) => (
                            <div key={i} className={`flex gap-2 text-xs ${turn.speaker === 'CALLER' ? '' : 'justify-end'}`}>
                              <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold ${turn.speaker === 'CALLER' ? 'bg-blue-500/10 text-blue-400' : 'bg-[#3FB950]/10 text-[#3FB950]'}`}>
                                {turn.speaker === 'CALLER' ? 'Caller' : 'AI'}
                              </span>
                              <span className="text-[#C9D1D9]">{turn.transcript}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {session.transcriptText && session.turns.length === 0 && (
                        <p className="text-xs text-[#C9D1D9]">{session.transcriptText}</p>
                      )}
                    </div>
                  ))}
                </section>
              )}

              {/* Map */}
              <section className="rounded-2xl border border-[#21262D] bg-[#11151C] overflow-hidden">
                <div className="p-4 border-b border-[#21262D]">
                  <h2 className="text-sm font-bold text-[#E6EDF3] flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-[#F85149]" /> Location
                    {hasGps ? <span className="text-[10px] text-[#3FB950] font-normal">GPS available</span> : <span className="text-[10px] text-[#D29922] font-normal">No GPS — text location only</span>}
                  </h2>
                </div>
                <div className="h-72">
                  {hasGps && isGoogleMapsConfigured() ? (
                    <GoogleMap
                      center={{ latitude: caseData.latitude!, longitude: caseData.longitude! }}
                      zoom={15}
                      markers={mapMarkers}
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full bg-[#0B0E14] text-[#6E7681] text-sm">
                      {hasGps ? 'Map loading...' : 'No GPS coordinates — see text location above'}
                    </div>
                  )}
                </div>
              </section>
            </div>

            {/* RIGHT COLUMN — Assignment + Timeline + Notes */}
            <div className="space-y-5">
              {/* Assignment Panel */}
              <section className="rounded-2xl border border-[#21262D] bg-[#11151C] p-5">
                <h2 className="text-sm font-bold text-[#E6EDF3] mb-3 flex items-center gap-2">
                  <Radio className="w-4 h-4 text-blue-400" /> Resource Assignment
                </h2>

                {/* Current Assignment */}
                {activeAssignment && (
                  <div className="mb-4 p-3 rounded-xl bg-[#3FB950]/5 border border-[#3FB950]/20">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle2 className="w-4 h-4 text-[#3FB950]" />
                      <span className="text-xs font-bold text-[#3FB950]">Active Assignment</span>
                      <AssignmentStatusBadge status={activeAssignment.status} />
                    </div>
                    {activeAssignment.responder && (
                      <div className="text-xs space-y-1">
                        <p className="text-[#C9D1D9] flex items-center gap-1.5"><User className="w-3 h-3" />{activeAssignment.responder.name} ({activeAssignment.responder.responderType})</p>
                        {activeAssignment.ambulance && <p className="text-[#8B949E] flex items-center gap-1.5"><Navigation className="w-3 h-3" />{activeAssignment.ambulance.identifier} — {activeAssignment.ambulance.vehicleNumber}</p>}
                        {activeAssignment.resource && <p className="text-[#8B949E]">{activeAssignment.resource.name}</p>}
                        <p className="text-[#6E7681] text-[10px]">Assigned {formatDate(activeAssignment.assignedAt)}</p>
                      </div>
                    )}
                  </div>
                )}

                {completedAssignment && (
                  <div className="mb-4 p-3 rounded-xl bg-[#3FB950]/5 border border-[#3FB950]/20">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle2 className="w-4 h-4 text-[#3FB950]" />
                      <span className="text-xs font-bold text-[#3FB950]">Completed Assignment</span>
                    </div>
                    {completedAssignment.responder && (
                      <div className="text-xs space-y-1">
                        <p className="text-[#C9D1D9] flex items-center gap-1.5"><User className="w-3 h-3" />{completedAssignment.responder.name} ({completedAssignment.responder.responderType})</p>
                        {completedAssignment.ambulance && <p className="text-[#8B949E] flex items-center gap-1.5"><Navigation className="w-3 h-3" />{completedAssignment.ambulance.identifier} — {completedAssignment.ambulance.vehicleNumber}</p>}
                        <p className="text-[#6E7681] text-[10px]">Assigned {formatDate(completedAssignment.assignedAt)} • Completed {completedAssignment.completedAt ? formatDate(completedAssignment.completedAt) : 'N/A'}</p>
                      </div>
                    )}
                  </div>
                )}

                {assignSuccess && (
                  <div className="mb-4 p-3 rounded-xl bg-[#3FB950]/10 border border-[#3FB950]/30 text-xs text-[#3FB950] font-bold flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" /> Assignment created successfully!
                  </div>
                )}

                {/* New Assignment Form — hidden once the case is finished */}
                {!activeAssignment && !isClosedCase && availableResources && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-[11px] font-bold text-[#6E7681] block mb-1">Responder</label>
                      <select
                        value={selectedResponder}
                        onChange={(e) => setSelectedResponder(e.target.value)}
                        className="w-full rounded-lg border border-[#21262D] bg-[#0B0E14] px-3 py-2 text-xs text-[#E6EDF3] focus:border-blue-500 focus:outline-none"
                      >
                        <option value="">Select responder...</option>
                        {availableResources.responders.map((r) => (
                          <option key={r.id} value={r.id}>{r.name} ({r.responderType}) — {r.availabilityStatus}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-[#6E7681] block mb-1">Ambulance (optional)</label>
                      <select
                        value={selectedAmbulance}
                        onChange={(e) => setSelectedAmbulance(e.target.value)}
                        className="w-full rounded-lg border border-[#21262D] bg-[#0B0E14] px-3 py-2 text-xs text-[#E6EDF3] focus:border-blue-500 focus:outline-none"
                      >
                        <option value="">No ambulance</option>
                        {availableResources.ambulances.map((a) => (
                          <option key={a.id} value={a.id}>{a.identifier} — {a.vehicleNumber}</option>
                        ))}
                      </select>
                    </div>
                    <button
                      onClick={handleAssign}
                      disabled={!selectedResponder || assigning}
                      className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 py-2.5 text-xs font-bold text-white shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40 transition-shadow disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {assigning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                      {assigning ? 'Assigning...' : 'Dispatch Responder'}
                    </button>
                  </div>
                )}

                {!activeAssignment && !isClosedCase && !availableResources && (
                  <p className="text-xs text-[#6E7681]">Loading available resources...</p>
                )}
              </section>

              {/* Operator Notes */}
              <section className="rounded-2xl border border-[#21262D] bg-[#11151C] p-5">
                <h2 className="text-sm font-bold text-[#E6EDF3] mb-3 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-[#D29922]" /> Add Note
                </h2>
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Operator note..."
                  rows={3}
                  className="w-full rounded-lg border border-[#21262D] bg-[#0B0E14] px-3 py-2 text-xs text-[#E6EDF3] placeholder:text-[#6E7681] focus:border-[#D29922] focus:outline-none resize-none"
                />
                <button
                  onClick={handleAddNote}
                  disabled={!noteText.trim() || submittingNote}
                  className="mt-2 w-full rounded-lg bg-[#D29922]/10 border border-[#D29922]/30 py-2 text-xs font-bold text-[#D29922] hover:bg-[#D29922]/20 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {submittingNote ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                  Save Note
                </button>
              </section>

              {/* Audit Timeline */}
              <section className="rounded-2xl border border-[#21262D] bg-[#11151C] p-5">
                <h2 className="text-sm font-bold text-[#E6EDF3] mb-3 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#8B949E]" /> Case Timeline
                </h2>
                <div className="space-y-0">
                  {caseData.updates.map((update, i) => (
                    <div key={update.id} className="flex gap-3 relative">
                      {/* Timeline line */}
                      {i < caseData.updates.length - 1 && (
                        <div className="absolute left-[13px] top-7 bottom-0 w-px bg-[#21262D]" />
                      )}
                      <div className="shrink-0 w-7 h-7 rounded-full bg-[#0B0E14] border border-[#21262D] flex items-center justify-center text-xs z-10">
                        {UPDATE_ICONS[update.updateType] || '•'}
                      </div>
                      <div className="flex-1 pb-4 min-w-0">
                        <p className="text-xs text-[#C9D1D9] leading-relaxed">{update.message}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-[#6E7681]">{formatDate(update.createdAt)}</span>
                          {update.createdByUser && <span className="text-[10px] text-[#6E7681]">by {update.createdByUser.name}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                  {caseData.updates.length === 0 && (
                    <p className="text-xs text-[#6E7681]">No timeline entries yet.</p>
                  )}
                </div>
              </section>
            </div>
          </div>
        )}
      </main>
    </div>
    </AuthGuard>
  );
}

// ─── Sub-components ─────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_LABELS[status] || { en: status, color: '#6E7681' };
  return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ color: config.color, backgroundColor: `${config.color}15`, border: `1px solid ${config.color}30` }}>
      {config.en}
    </span>
  );
}

function AssignmentStatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    PENDING: 'Pending',
    ACCEPTED: 'Accepted',
    EN_ROUTE: 'En Route',
    ARRIVED: 'Arrived',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
  };
  const colors: Record<string, string> = {
    PENDING: '#D29922',
    ACCEPTED: '#3FB950',
    EN_ROUTE: '#F0883E',
    ARRIVED: '#3FB950',
    COMPLETED: '#8B949E',
    CANCELLED: '#6E7681',
  };
  const color = colors[status] || '#6E7681';
  return (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ color, backgroundColor: `${color}15` }}>
      {labels[status] || status}
    </span>
  );
}
