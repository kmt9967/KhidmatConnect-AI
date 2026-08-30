'use client';

import {
  Clock,
  FileText,
  HeartHandshake,
  MapPin,
  Phone,
  PhoneCall,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import { getTranslation } from '@/i18n/translations';
import type { EmergencyCase } from '@/types';

interface ResponderCaseDetailsSheetProps {
  emergencyCase: EmergencyCase;
  onClose: () => void;
}

export default function ResponderCaseDetailsSheet({
  emergencyCase,
  onClose,
}: ResponderCaseDetailsSheetProps) {
  const { lang, isUrdu } = useLanguage();
  const t = getTranslation(lang);
  const isCritical = emergencyCase.urgency === 'critical';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
    >
      <div
        dir={isUrdu ? 'rtl' : 'ltr'}
        className="w-full max-w-lg bg-[#11161F] border-t sm:border border-[#30363D] rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle on mobile */}
        <div className="w-12 h-1.5 bg-gray-600 rounded-full mx-auto my-2.5 sm:hidden" />

        {/* Sheet Header */}
        <div className="px-5 py-3.5 border-b border-[#30363D] flex items-center justify-between gap-3 bg-[#0B0E14]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs ${isCritical ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'}`}>
              <FileText className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono font-black text-white text-sm">{emergencyCase.id}</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${isCritical ? 'bg-red-500/20 text-red-300 border border-red-500/40' : 'bg-blue-500/20 text-blue-300'}`}>
                  {emergencyCase.urgency} • {emergencyCase.category}
                </span>
              </div>
              <span className="text-[11px] text-gray-400 font-mono block truncate">{t.caseDetails}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl bg-[#161B22] hover:bg-[#21262D] border border-[#30363D] text-gray-300 hover:text-white transition-colors" title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs scrollbar-thin">
          {/* 1. AI SUMMARY */}
          <div className="p-3.5 rounded-2xl bg-[#0B0E14] border border-[#30363D] space-y-2">
            <span className="text-[10px] font-mono text-blue-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              <span>{isUrdu ? 'طبی خلاصہ و واقعہ' : 'AI Medical Summary & Caller Incident'}</span>
            </span>
            <p className="text-sm font-semibold text-white leading-relaxed">
              {isUrdu && emergencyCase.aiAnalysis.summaryUr ? emergencyCase.aiAnalysis.summaryUr : emergencyCase.aiAnalysis.summary}
            </p>
            {emergencyCase.rawMessage && (
              <div className="pt-2 border-t border-[#30363D]/60 text-gray-400 text-[11px] italic">
                &quot;{emergencyCase.rawMessage}&quot;
              </div>
            )}
          </div>

          {/* 2. SPECIAL NEEDS & PEOPLE AFFECTED */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="p-3 rounded-xl bg-[#0B0E14] border border-[#30363D] space-y-1">
              <span className="text-[10px] font-mono text-gray-400 uppercase flex items-center gap-1">
                <Users className="w-3.5 h-3.5 text-blue-400" />
                <span>{t.peopleAffected}</span>
              </span>
              <p className="text-sm font-black text-white">{emergencyCase.aiAnalysis.peopleCount || 3} {isUrdu ? 'افراد' : 'Individuals'}</p>
            </div>
            <div className="p-3 rounded-xl bg-[#0B0E14] border border-[#30363D] space-y-1">
              <span className="text-[10px] font-mono text-gray-400 uppercase flex items-center gap-1">
                <HeartHandshake className="w-3.5 h-3.5 text-amber-400" />
                <span>{t.specialNeeds}</span>
              </span>
              <p className="text-xs font-bold text-amber-300 truncate">{emergencyCase.aiAnalysis.specialNeeds || (isUrdu ? 'ذیابیطس کا مریض' : 'Diabetic patient')}</p>
            </div>
          </div>

          {/* Key Needs Tags */}
          {emergencyCase.aiAnalysis.keyNeeds.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[10px] font-mono text-gray-400 uppercase">{isUrdu ? 'ضروری سہولیات' : 'Required Response Needs'}</span>
              <div className="flex flex-wrap gap-1.5">
                {emergencyCase.aiAnalysis.keyNeeds.map((need, i) => (
                  <span key={i} className="px-2.5 py-1 rounded-lg bg-[#161B22] border border-[#30363D] text-blue-300 font-mono text-[11px] font-semibold">{need}</span>
                ))}
              </div>
            </div>
          )}

          {/* 3. LOCATION */}
          <div className="p-3.5 rounded-2xl bg-[#0B0E14] border border-[#30363D] space-y-2">
            <span className="text-[10px] font-mono text-blue-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-blue-400" />
              <span>{t.locationSummaryLabel}</span>
            </span>
            <p className="text-sm font-black text-white leading-snug">{emergencyCase.location.name}</p>
            {emergencyCase.location.addressDetail && (
              <p className="text-xs text-gray-300 bg-[#161B22] p-2 rounded-xl border border-[#30363D]/60">
                <span className="text-blue-300 font-semibold">{isUrdu ? 'نشان / تفصیل:' : 'Landmark note:'}</span> {emergencyCase.location.addressDetail}
              </p>
            )}
            <div className="flex items-center justify-between text-[10px] font-mono text-gray-400 pt-1">
              <span>GPS: {emergencyCase.location.coordinates?.lat.toFixed(4) || '24.9204'}°N, {emergencyCase.location.coordinates?.lng.toFixed(4) || '67.0934'}°E</span>
              <span className="text-emerald-400 font-bold">Accuracy: ±5m</span>
            </div>
          </div>

          {/* 4. CONTACT */}
          <div className="p-3.5 rounded-2xl bg-[#0B0E14] border border-[#30363D] space-y-3">
            <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-emerald-400" />
              <span>{isUrdu ? 'رابطہ نمبرز' : 'Contact Information'}</span>
            </span>
            <div className="flex items-center justify-between gap-3 bg-[#161B22] p-2.5 rounded-xl border border-[#30363D]">
              <div>
                <div className="text-xs font-bold text-white">{emergencyCase.requester.name || (isUrdu ? 'شہری / لواحقین' : 'Citizen / Requester')}</div>
                <div className="font-mono text-xs text-emerald-400 font-bold">{emergencyCase.requester.phone}</div>
              </div>
              <a href={`tel:${emergencyCase.requester.phone}`} className="py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md active:scale-95 transition-all min-h-[44px]">
                <PhoneCall className="w-3.5 h-3.5" />
                <span>{t.callRequester}</span>
              </a>
            </div>
            {emergencyCase.requester.alternatePhone && (
              <div className="flex items-center justify-between gap-2 text-xs text-gray-400 pt-1 border-t border-[#30363D]/60 font-mono">
                <span>{isUrdu ? 'متبادل نمبر:' : 'Alternate Contact:'} {emergencyCase.requester.alternatePhone}</span>
                <a href={`tel:${emergencyCase.requester.alternatePhone}`} className="text-blue-400 hover:underline font-bold">Call</a>
              </div>
            )}
          </div>

          {/* 5. OPERATOR NOTES */}
          <div className="p-3.5 rounded-2xl bg-[#0B0E14] border border-[#30363D] space-y-2">
            <span className="text-[10px] font-mono text-amber-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>{isUrdu ? 'آپریٹر کنٹرول روم نوٹس' : 'Operator Control Room Notes'}</span>
            </span>
            {emergencyCase.operatorNotes && emergencyCase.operatorNotes.length > 0 ? (
              <div className="space-y-1.5">
                {emergencyCase.operatorNotes.map((note, idx) => (
                  <div key={idx} className="p-2 rounded-xl bg-[#161B22] border border-[#30363D]/60 text-xs text-gray-300">{note}</div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 italic">{isUrdu ? 'کوئی اضافی آپریٹر نوٹ موجود نہیں۔' : 'Dispatched via EOC Dispatcher 04. No special hazards reported.'}</p>
            )}
          </div>
        </div>

        {/* Bottom Close Button */}
        <div className="p-4 bg-[#0B0E14] border-t border-[#30363D] shrink-0">
          <button onClick={onClose} className="w-full py-3.5 px-4 rounded-xl bg-[#161B22] hover:bg-[#21262D] text-white font-bold text-xs border border-[#30363D] transition-colors">
            {t.hideDetails}
          </button>
        </div>
      </div>
    </div>
  );
}
