'use client';

import { useState } from 'react';
import {
  AlertCircle,
  AlertOctagon,
  AlertTriangle,
  Ambulance,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Copy,
  FileText,
  MapPin,
  MessageSquare,
  Mic,
  Phone,
  PhoneCall,
  Play,
  Send,
  Sparkles,
  UserCheck,
  Volume2,
  X,
} from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import { getTranslation } from '@/i18n/translations';
import type { EmergencyCase, UrgencyLevel, EmergencyCategory } from '@/types';

interface OperatorCaseDrawerProps {
  selectedCase: EmergencyCase | null;
  onClose: () => void;
  onApproveDispatch: (caseId: string, resourceId: string) => void;
  onChangeUrgency: (caseId: string, newUrgency: UrgencyLevel) => void;
  onChangeCategory: (caseId: string, newCategory: EmergencyCategory) => void;
  onAddOperatorNote: (caseId: string, note: string) => void;
}

export default function OperatorCaseDrawer({
  selectedCase,
  onClose,
  onApproveDispatch,
  onChangeUrgency,
  onChangeCategory,
  onAddOperatorNote,
}: OperatorCaseDrawerProps) {
  const { lang, isUrdu } = useLanguage();
  const t = getTranslation(lang);

  const [activeTab, setActiveTab] = useState<'overview' | 'ai_analysis' | 'contact' | 'resources' | 'timeline'>('overview');
  const [operatorNoteInput, setOperatorNoteInput] = useState('');
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [customUrgency, setCustomUrgency] = useState<UrgencyLevel>(selectedCase?.urgency ?? 'medium');
  const [customCategory, setCustomCategory] = useState<EmergencyCategory>(selectedCase?.category ?? 'general');
  const [dispatchSuccess, setDispatchSuccess] = useState<string | null>(null);
  const [showMoreActions, setShowMoreActions] = useState(false);
  const [showAllResources, setShowAllResources] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [messageSent, setMessageSent] = useState(false);

  if (!selectedCase) return null;

  const isCritical = selectedCase.urgency === 'critical';
  const isVoice = selectedCase.source === 'voice_call';

  const handleApprove = (resourceId: string) => {
    onApproveDispatch(selectedCase.id, resourceId);
    setDispatchSuccess(resourceId);
    setTimeout(() => setDispatchSuccess(null), 2500);
  };

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!operatorNoteInput.trim()) return;
    onAddOperatorNote(selectedCase.id, operatorNoteInput.trim());
    setOperatorNoteInput('');
  };

  const handleCopyId = () => {
    navigator.clipboard?.writeText(selectedCase.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleSendMessage = () => {
    setMessageSent(true);
    setTimeout(() => setMessageSent(false), 3000);
  };

  const recommendedResources = [
    { id: 'AKF-07', name: 'Ambulance AKF-07 (ALS)', type: 'ALS Cardiac Ambulance', status: 'AVAILABLE', responder: 'Ahmed Khan (Lead EMT)', distance: '2.1 km', eta: '5 min', matchScore: '98%', bestMatch: true },
    { id: 'AMB-1122-04', name: 'Rescue 1122 Unit 4 (ALS)', type: 'Heavy Trauma Ambulance', status: 'AVAILABLE', responder: 'Muhammad Rizwan (Senior EMT)', distance: '1.8 km', eta: '4 min', matchScore: '96%', bestMatch: false },
    { id: 'RES-04', name: 'NICVD Emergency Trauma Center', type: 'Tertiary Cardiac Hospital', status: 'OPEN', responder: 'Dr. Farooq (ER In-charge)', distance: '3.4 km', eta: '8 min', matchScore: '92%', bestMatch: false, capacity: '14 Ventilators Available' },
    { id: 'RES-01', name: 'Edhi Foundation Fleet 12', type: 'BLS Ambulance', status: 'AVAILABLE', responder: 'Aslam Farooqui', distance: '4.2 km', eta: '9 min', matchScore: '89%', bestMatch: false },
    { id: 'RES-02', name: 'Rescue 1122 Heavy Boat & Scuba Cell', type: 'Water & Structural Rescue', status: 'AVAILABLE', responder: 'Commander Naveed', distance: '5.1 km', eta: '12 min', matchScore: '85%', bestMatch: false },
  ];

  const visibleResources = showAllResources ? recommendedResources : recommendedResources.slice(0, 3);

  return (
    <div
      dir={isUrdu ? 'rtl' : 'ltr'}
      className="fixed inset-y-0 right-0 z-40 w-full max-w-lg lg:max-w-xl bg-[#161B22]/98 backdrop-blur-2xl border-l border-[#30363D] shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 text-[#E6EDF3]"
    >
      {/* DRAWER TOP HEADER */}
      <div className="p-4 sm:p-5 border-b border-[#30363D] bg-[#0B0E14]/80 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-lg ${
            isCritical
              ? 'bg-red-600 ring-2 ring-red-500/40 shadow-red-900/30 animate-pulse'
              : selectedCase.urgency === 'high'
                ? 'bg-amber-600 shadow-amber-900/30'
                : 'bg-blue-600 shadow-blue-900/30'
          }`}>
            <AlertOctagon className="w-5 h-5" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono font-black text-white text-base tracking-tight">{selectedCase.id}</span>
              <button onClick={handleCopyId} className="text-gray-400 hover:text-white p-0.5" title="Copy Case ID">
                {copiedId ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                isCritical
                  ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                  : selectedCase.urgency === 'high'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
              }`}>
                {selectedCase.urgency}
              </span>
              {isVoice && (
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-mono font-bold flex items-center gap-1">
                  <Mic className="w-2.5 h-2.5" />
                  <span>VOICE</span>
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 font-mono mt-0.5 flex items-center gap-2">
              <span>{selectedCase.timestamp}</span>
              <span>•</span>
              <span className="capitalize">{selectedCase.category}</span>
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-xl bg-[#0B0E14] hover:bg-[#1C2128] text-gray-400 hover:text-white border border-[#30363D] transition-colors shrink-0"
          title="Close Drawer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* TABS NAVIGATION */}
      <div className="flex items-center border-b border-[#30363D] bg-[#0B0E14]/50 px-2 overflow-x-auto scrollbar-none text-xs font-semibold shrink-0">
        {[
          { id: 'overview', label: isUrdu ? 'جائزہ' : 'Overview', icon: FileText },
          { id: 'ai_analysis', label: isUrdu ? 'AI تجزیہ' : 'AI Analysis', icon: Sparkles },
          { id: 'contact', label: isUrdu ? 'رابطہ' : 'Contact', icon: Phone },
          { id: 'resources', label: isUrdu ? 'ریسورسز' : 'Resources', icon: Ambulance },
          { id: 'timeline', label: isUrdu ? 'ٹائم لائن' : 'Timeline', icon: Clock },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`py-3 px-3 border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-all text-xs ${
                isActive
                  ? 'border-blue-400 text-blue-300 bg-blue-500/10 font-bold'
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-blue-400' : 'text-gray-500'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* DRAWER BODY */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">

        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="p-3.5 rounded-2xl bg-[#0B0E14] border border-[#30363D] space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setActiveTab('resources')}
                  className="py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg shadow-blue-900/30 transition-all flex items-center justify-center gap-1.5 active:scale-95"
                >
                  <Ambulance className="w-4 h-4" />
                  <span>{isUrdu ? 'مدد تفویض کریں' : 'Assign Response'}</span>
                </button>
                <a
                  href={`tel:${selectedCase.requester.phone}`}
                  className="py-2.5 px-3 rounded-xl bg-[#161B22] hover:bg-[#1C2128] text-gray-200 border border-[#30363D] font-bold text-xs transition-colors flex items-center justify-center gap-1.5 active:scale-95"
                >
                  <PhoneCall className="w-4 h-4 text-emerald-400" />
                  <span>{isUrdu ? 'کال کریں' : 'Call Requester'}</span>
                </a>
              </div>
              <div className="relative">
                <button
                  onClick={() => setShowMoreActions(!showMoreActions)}
                  className="w-full py-1.5 px-3 rounded-lg bg-[#161B22]/60 hover:bg-[#161B22] text-gray-400 hover:text-gray-200 text-xs font-semibold border border-[#30363D] flex items-center justify-between transition-colors"
                >
                  <span>{isUrdu ? 'مزید آپشنز' : 'More Operator Actions'}</span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showMoreActions ? 'rotate-180' : ''}`} />
                </button>
                {showMoreActions && (
                  <div className="mt-1 p-2 rounded-xl bg-[#161B22] border border-[#30363D] shadow-2xl space-y-1 text-xs">
                    <button
                      onClick={() => { onChangeUrgency(selectedCase.id, 'critical'); setShowMoreActions(false); }}
                      className="w-full text-left p-2 rounded-lg hover:bg-red-950/40 text-red-300 flex items-center gap-2"
                    >
                      <AlertOctagon className="w-3.5 h-3.5 text-red-400" />
                      <span>{isUrdu ? 'شدید درجہ 1 کریں' : 'Escalate to Critical Grade-1'}</span>
                    </button>
                    <button
                      onClick={() => { onAddOperatorNote(selectedCase.id, 'Marked as Duplicate.'); setShowMoreActions(false); }}
                      className="w-full text-left p-2 rounded-lg hover:bg-[#0B0E14] text-gray-300 flex items-center gap-2"
                    >
                      <Copy className="w-3.5 h-3.5 text-gray-400" />
                      <span>{isUrdu ? 'ڈپلیکیٹ نشان زد' : 'Mark as Duplicate'}</span>
                    </button>
                    <button
                      onClick={() => { onAddOperatorNote(selectedCase.id, 'Requester unreachable.'); setShowMoreActions(false); }}
                      className="w-full text-left p-2 rounded-lg hover:bg-[#0B0E14] text-gray-300 flex items-center gap-2"
                    >
                      <Phone className="w-3.5 h-3.5 text-amber-400" />
                      <span>{isUrdu ? 'رابطہ نہیں ہوا' : 'Mark Requester Unreachable'}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#0B0E14] border border-[#30363D] space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-blue-400" />
                <span>{isUrdu ? 'ہنگامی خلاصہ' : 'Emergency Summary'}</span>
              </span>
              <p className="text-sm font-semibold text-white leading-relaxed">
                {isUrdu && selectedCase.aiAnalysis.summaryUr ? selectedCase.aiAnalysis.summaryUr : selectedCase.aiAnalysis.summary}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-[#0B0E14] border border-[#30363D] space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-gray-400 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-red-400" />
                  <span>{isUrdu ? 'مقام' : 'Location Telemetry'}</span>
                </span>
                {selectedCase.location.isApproximate ? (
                  <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-mono font-bold">GPS UNCONFIRMED</span>
                ) : (
                  <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-mono font-bold">GPS CONFIRMED</span>
                )}
              </div>
              <p className="text-xs font-mono text-white">{selectedCase.location.name}</p>
              {selectedCase.location.addressDetail && (
                <p className="text-xs text-gray-400 bg-[#161B22] p-2.5 rounded-xl border border-[#30363D]">
                  {isUrdu ? 'نشان:' : 'Note:'} {selectedCase.location.addressDetail}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3.5 rounded-2xl bg-[#0B0E14] border border-[#30363D] space-y-1">
                <span className="text-[10px] font-mono text-gray-500 uppercase block">{t.peopleAffected}</span>
                <span className="font-mono font-bold text-white text-sm">{selectedCase.aiAnalysis.peopleCount || 1} {isUrdu ? 'افراد' : 'Individual(s)'}</span>
              </div>
              <div className="p-3.5 rounded-2xl bg-[#0B0E14] border border-[#30363D] space-y-1">
                <span className="text-[10px] font-mono text-gray-500 uppercase block">{isUrdu ? 'ذریعہ' : 'Intake Source'}</span>
                <span className="font-mono font-bold text-blue-300 text-sm capitalize">{selectedCase.source.replace('_', ' ')}</span>
              </div>
            </div>

            {selectedCase.assignedResource && (
              <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-950/40 to-emerald-950/30 border border-blue-500/40 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-blue-300 font-bold flex items-center gap-1.5">
                    <Ambulance className="w-4 h-4 text-emerald-400" />
                    <span>{isUrdu ? 'تفویض یونٹ' : 'Assigned Fleet Unit'}</span>
                  </span>
                  <span className="font-mono font-bold text-emerald-400">EN ROUTE</span>
                </div>
                <div className="text-sm font-black text-white">{selectedCase.assignedResource.name}</div>
                <p className="text-xs text-gray-300 font-mono">
                  {selectedCase.assignedResource.responderName} • ETA ~{selectedCase.assignedResource.etaMinutes} min
                </p>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: AI ANALYSIS */}
        {activeTab === 'ai_analysis' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="p-3.5 rounded-2xl bg-blue-950/30 border border-blue-500/30 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Sparkles className="w-5 h-5 text-blue-400 shrink-0" />
                <div>
                  <span className="text-xs font-bold text-blue-200 block">{isUrdu ? 'AI تجزیہ سفارش' : 'AI Triage Recommendation'}</span>
                  <span className="text-[11px] text-gray-400 font-mono">
                    {isUrdu ? 'اعتماد' : 'Confidence'}: {Math.round(selectedCase.aiAnalysis.confidence * 100)}% • {selectedCase.aiAnalysis.detectedLanguage}
                  </span>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-mono font-bold">
                {isUrdu ? 'انسانی جائزہ ضروری' : 'HUMAN REVIEW REQUIRED'}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-[#0B0E14] border border-[#30363D] space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                {isUrdu ? 'ٹرائیج وجوہات' : 'Triage Reasoning & Medical Assessment'}
              </span>
              <p className="text-xs text-gray-200 leading-relaxed">{selectedCase.aiAnalysis.reasoning}</p>
            </div>

            <div className="p-4 rounded-2xl bg-[#0B0E14] border border-[#30363D] space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                {isUrdu ? 'فوری ضروریات' : 'Identified Immediate Needs'}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {selectedCase.aiAnalysis.keyNeeds.map((need, idx) => (
                  <span key={idx} className="px-2.5 py-1 rounded-lg bg-[#161B22] border border-[#30363D] text-xs font-semibold text-blue-300">+ {need}</span>
                ))}
              </div>
            </div>

            {selectedCase.aiAnalysis.missingInfo && selectedCase.aiAnalysis.missingInfo.length > 0 && (
              <div className="p-3.5 rounded-2xl bg-amber-950/30 border border-amber-500/40 space-y-1.5">
                <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  <span>{isUrdu ? 'مفقود معلومات' : 'Missing Information Detected'}</span>
                </span>
                <ul className="text-xs text-amber-200/90 list-disc list-inside space-y-1">
                  {selectedCase.aiAnalysis.missingInfo.map((info, i) => (
                    <li key={i}>{info}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="p-4 rounded-2xl bg-[#0B0E14] border border-[#30363D] space-y-3">
              <div className="flex items-center justify-between border-b border-[#30363D] pb-2">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-blue-400" />
                  <span>{isUrdu ? 'آپریٹر اوور رائیڈ' : 'Operator Override Controls'}</span>
                </span>
                <span className="text-[10px] font-mono text-gray-500">{isUrdu ? 'مجاز اوور رائیڈ' : 'AUTHORIZED OVERRIDE'}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] text-gray-400 block font-semibold">{isUrdu ? 'ارجنسی اوور رائیڈ' : 'Override Urgency'}</label>
                  <select
                    value={customUrgency}
                    onChange={(e) => { const val = e.target.value as UrgencyLevel; setCustomUrgency(val); onChangeUrgency(selectedCase.id, val); }}
                    className="w-full px-3 py-2 rounded-xl bg-[#161B22] border border-[#30363D] text-xs text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="critical">Critical (Grade 1)</option>
                    <option value="high">High Priority</option>
                    <option value="medium">Medium Priority</option>
                    <option value="low">Low Priority</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-gray-400 block font-semibold">{isUrdu ? 'کیٹیگری اوور رائیڈ' : 'Override Category'}</label>
                  <select
                    value={customCategory}
                    onChange={(e) => { const val = e.target.value as EmergencyCategory; setCustomCategory(val); onChangeCategory(selectedCase.id, val); }}
                    className="w-full px-3 py-2 rounded-xl bg-[#161B22] border border-[#30363D] text-xs text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="medical">Medical (ALS / BLS)</option>
                    <option value="rescue">Search & Rescue</option>
                    <option value="fire">Fire Emergency</option>
                    <option value="food">Food / Ration Relief</option>
                    <option value="shelter">Shelter Assistance</option>
                    <option value="water">Clean Water</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: CONTACT */}
        {activeTab === 'contact' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="p-4 rounded-2xl bg-[#0B0E14] border border-[#30363D] space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-gray-500 uppercase block font-mono">{isUrdu ? 'درخواست کنندہ' : 'Requester Name'}</span>
                  <span className="font-bold text-white text-sm">{selectedCase.requester.name || (isUrdu ? 'گمنام شہری' : 'Anonymous Citizen Caller')}</span>
                </div>
                <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[10px] font-mono">VERIFIED</span>
              </div>
              <div className="space-y-2 pt-2 border-t border-[#30363D]">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-400">{isUrdu ? 'بنیادی فون:' : 'Primary Phone:'}</span>
                  <span className="font-mono font-bold text-white text-sm">{selectedCase.requester.phone}</span>
                </div>
                {selectedCase.requester.alternatePhone && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-400">{isUrdu ? 'متبادل فون:' : 'Alternate Phone:'}</span>
                    <span className="font-mono text-gray-300">{selectedCase.requester.alternatePhone}</span>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2">
                <a href={`tel:${selectedCase.requester.phone}`} className="py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95">
                  <PhoneCall className="w-3.5 h-3.5" />
                  <span>{isUrdu ? 'کال کریں' : 'Call Requester'}</span>
                </a>
                <button onClick={handleSendMessage} className="py-2.5 px-3 rounded-xl bg-[#161B22] hover:bg-[#1C2128] text-gray-200 font-bold text-xs border border-[#30363D] flex items-center justify-center gap-1.5 transition-colors">
                  <MessageSquare className="w-3.5 h-3.5 text-blue-400" />
                  <span>{messageSent ? (isUrdu ? 'بھیج دیا!' : 'SMS Sent!') : (isUrdu ? 'ایس ایم ایس' : 'Send SMS')}</span>
                </button>
              </div>
            </div>

            {isVoice && selectedCase.voiceTranscript && (
              <div className="p-4 rounded-2xl bg-[#0B0E14] border border-[#30363D] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                    <Volume2 className="w-4 h-4" />
                    <span>{isUrdu ? 'ایمرجنسی کال ریکارڈنگ' : 'Emergency Call Recording'}</span>
                  </span>
                  <span className="text-[10px] font-mono text-gray-400">{selectedCase.voiceTranscript.audioLength}</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-[#161B22] rounded-xl border border-[#30363D]">
                  <button onClick={() => setIsPlayingAudio(!isPlayingAudio)} className="w-9 h-9 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center justify-center font-bold shadow transition-transform active:scale-95 shrink-0">
                    <Play className={`w-4 h-4 ${isPlayingAudio ? 'animate-pulse' : ''}`} />
                  </button>
                  <div className="flex-1 space-y-1 min-w-0">
                    <div className="h-2 rounded-full bg-[#0B0E14] overflow-hidden">
                      <div className={`h-full bg-amber-400 transition-all ${isPlayingAudio ? 'w-3/4 animate-pulse' : 'w-1/4'}`} />
                    </div>
                    <div className="flex justify-between text-[10px] font-mono text-gray-500">
                      <span>{isPlayingAudio ? '0:18' : '0:00'}</span>
                      <span>{selectedCase.voiceTranscript.audioLength}</span>
                    </div>
                  </div>
                </div>
                {selectedCase.voiceTranscript.isDroppedCall && (
                  <div className="p-2.5 rounded-xl bg-red-950/60 border border-red-500/40 text-[11px] text-red-300 font-medium flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                    <span>{isUrdu ? 'کال منقطع ہو گئی' : 'Call disconnected — case created from captured information.'}</span>
                  </div>
                )}
                <div className="space-y-1 pt-1">
                  <span className="text-[10px] font-bold uppercase text-gray-400 font-mono">{isUrdu ? 'ٹرانسکرپٹ' : 'Speech Transcript'}</span>
                  <p className="text-xs text-gray-200 leading-relaxed font-mono bg-[#161B22] p-3 rounded-xl border border-[#30363D]">&quot;{selectedCase.voiceTranscript.fullText}&quot;</p>
                </div>
              </div>
            )}

            {!isVoice && (
              <div className="p-4 rounded-2xl bg-[#0B0E14] border border-[#30363D] space-y-1.5">
                <span className="text-[10px] font-bold uppercase text-gray-400 font-mono">{isUrdu ? 'اصل پیغام' : 'Original Citizen Text'}</span>
                <p className="text-xs text-gray-200 italic leading-relaxed">&quot;{selectedCase.rawMessage}&quot;</p>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: RESOURCES */}
        {activeTab === 'resources' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between text-xs text-gray-400 px-1">
              <span className="font-bold text-gray-200">{isUrdu ? 'AI قریبی یونٹس' : 'AI Geo-Ranked Nearest Fleet Units'}</span>
              <span className="font-mono text-emerald-400 font-semibold">3 {isUrdu ? 'فعال' : 'Active in Radius'}</span>
            </div>
            <div className="space-y-3">
              {visibleResources.map((res) => {
                const isAssigned = selectedCase.assignedResource?.id === res.id;
                const isJustApproved = dispatchSuccess === res.id;
                return (
                  <div key={res.id} className={`p-4 rounded-2xl border transition-all space-y-2.5 ${res.bestMatch ? 'bg-gradient-to-br from-[#0B0E14] to-blue-950/40 border-blue-500/50 shadow-xl' : 'bg-[#0B0E14] border-[#30363D]'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {res.bestMatch && (
                          <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[10px] font-bold">★ BEST ({res.matchScore})</span>
                        )}
                        <span className={`text-xs font-bold ${res.status === 'AVAILABLE' || res.status === 'OPEN' ? 'text-emerald-400' : 'text-amber-400'}`}>{res.status}</span>
                      </div>
                      <span className="text-xs font-mono font-black text-white">ETA: {res.eta} ({res.distance})</span>
                    </div>
                    <div>
                      <h4 className="font-extrabold text-sm text-white">{res.name}</h4>
                      <p className="text-xs text-gray-400 font-mono">{res.type} • {res.responder}</p>
                      {'capacity' in res && res.capacity && <p className="text-[11px] text-blue-300 mt-0.5">{res.capacity}</p>}
                    </div>
                    <div className="pt-1">
                      {isAssigned || isJustApproved ? (
                        <div className="w-full py-2.5 px-3 rounded-xl bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 font-bold text-xs flex items-center justify-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          <span>{isUrdu ? 'تفویض و ڈسپیچ' : 'ASSIGNED & DISPATCHED'}</span>
                        </div>
                      ) : (
                        <button onClick={() => handleApprove(res.id)} className="w-full py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md shadow-blue-900/30 transition-all flex items-center justify-center gap-2 active:scale-95">
                          <Check className="w-4 h-4" />
                          <span>{isUrdu ? 'کیس کو تفویض کریں' : 'Assign to Case'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="text-center pt-1">
              <button onClick={() => setShowAllResources(!showAllResources)} className="text-xs text-blue-400 hover:text-blue-300 font-semibold transition-colors underline py-1">
                {showAllResources ? (isUrdu ? 'کم دکھائیں' : 'Show Fewer') : (isUrdu ? 'مزید یونٹس دیکھیں' : 'View more resources (2 additional units)')}
              </button>
            </div>
          </div>
        )}

        {/* TAB 5: TIMELINE */}
        {activeTab === 'timeline' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="p-4 rounded-2xl bg-[#0B0E14] border border-[#30363D] space-y-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 block">
                {isUrdu ? 'کیس لائف سائیکل' : 'Incident Lifecycle Progression'}
              </span>
              <div className="space-y-3 relative before:absolute before:left-3.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#30363D]">
                {selectedCase.timeline.map((step, i) => (
                  <div key={i} className="flex items-start gap-3 relative z-10 text-xs">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                      step.completed ? 'bg-emerald-500 text-slate-950 ring-4 ring-[#0B0E14]' : step.current ? 'bg-blue-500 text-white ring-4 ring-blue-500/30 animate-pulse' : 'bg-[#161B22] text-gray-500 border border-[#30363D]'
                    }`}>
                      {step.completed ? '✓' : i + 1}
                    </div>
                    <div className="flex-1 pt-1">
                      <div className="flex items-center justify-between">
                        <span className={`font-semibold ${step.completed ? 'text-white' : 'text-gray-400'}`}>{isUrdu ? step.labelUr : step.label}</span>
                        <span className="font-mono text-[10px] text-gray-500">{step.time}</span>
                      </div>
                      {step.note && <p className="text-[11px] text-gray-400 mt-0.5">{step.note}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#0B0E14] border border-[#30363D] space-y-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 block">
                {isUrdu ? 'آپریٹر نوٹس' : 'Coordinating Operator Notes'}
              </span>
              <div className="space-y-2 max-h-36 overflow-y-auto">
                {selectedCase.operatorNotes && selectedCase.operatorNotes.length > 0 ? (
                  selectedCase.operatorNotes.map((note, idx) => (
                    <div key={idx} className="p-2.5 rounded-xl bg-[#161B22] border border-[#30363D] text-xs text-gray-300 font-mono">• {note}</div>
                  ))
                ) : (
                  <p className="text-xs text-gray-500 italic">{isUrdu ? 'کوئی نوٹ نہیں' : 'No operator notes recorded yet.'}</p>
                )}
              </div>
              <form onSubmit={handleAddNote} className="flex gap-2 pt-2 border-t border-[#30363D]">
                <input
                  type="text"
                  value={operatorNoteInput}
                  onChange={(e) => setOperatorNoteInput(e.target.value)}
                  placeholder={isUrdu ? 'نوٹ شامل کریں...' : 'Add coordination note...'}
                  className="flex-1 px-3 py-2 rounded-xl bg-[#161B22] border border-[#30363D] text-xs text-white placeholder:text-gray-500 focus:outline-none focus:border-blue-500"
                />
                <button type="submit" className="p-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition-colors" title="Add Note">
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
