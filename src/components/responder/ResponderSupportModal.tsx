'use client';

import { useState } from 'react';
import {
  Ambulance,
  Check,
  Flame,
  HeartHandshake,
  Radio,
  Send,
  ShieldAlert,
  Syringe,
  X,
} from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import { getTranslation } from '@/i18n/translations';

interface ResponderSupportModalProps {
  caseId: string;
  onClose: () => void;
  onSubmitSupportRequest: (supportType: string, notes: string) => void;
}

export default function ResponderSupportModal({
  caseId,
  onClose,
  onSubmitSupportRequest,
}: ResponderSupportModalProps) {
  const { lang, isUrdu } = useLanguage();
  const t = getTranslation(lang);

  const [selectedType, setSelectedType] = useState('ambulance');
  const [customNote, setCustomNote] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const supportOptions = [
    { id: 'ambulance', label: t.supportAmbulance, icon: Ambulance, desc: isUrdu ? 'دوسرا مریض یا شدید صورتحال' : 'Second patient or multiple casualties', accent: 'emerald' },
    { id: 'medical_team', label: t.supportMedicalTeam, icon: Syringe, desc: isUrdu ? 'سینئر ڈاکٹر یا ٹراما اسپیشلسٹ' : 'On-scene trauma doctor / surgical support', accent: 'blue' },
    { id: 'rescue', label: t.supportRescue, icon: Flame, desc: isUrdu ? 'ملبے سے نکالنے یا آگ پر قابو کے لیے' : 'Vehicle extrication / fire containment', accent: 'amber' },
    { id: 'supplies', label: t.supportSupplies, icon: HeartHandshake, desc: isUrdu ? 'اضافی آکسیجن، بلڈ یا اسٹریچر' : 'Extra oxygen cylinders, blood units, stretchers', accent: 'rose' },
    { id: 'police', label: t.supportPolice, icon: ShieldAlert, desc: isUrdu ? 'ہجوم کنٹرول یا ایمرجنسی راستہ' : 'Crowd control / traffic corridor clearance', accent: 'indigo' },
  ];

  const handleSubmit = () => {
    onSubmitSupportRequest(selectedType, customNote);
    setSubmitted(true);
    setTimeout(() => onClose(), 1200);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
    >
      <div
        dir={isUrdu ? 'rtl' : 'ltr'}
        className="w-full max-w-lg bg-[#11161F] border-t sm:border border-[#30363D] rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-in slide-in-from-bottom-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile handle */}
        <div className="w-12 h-1.5 bg-gray-600 rounded-full mx-auto my-2.5 sm:hidden" />

        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#30363D] flex items-center justify-between gap-3 bg-[#0B0E14]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-600/30 border border-amber-500/50 flex items-center justify-center text-amber-400">
              <Radio className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white leading-tight">{t.requestAdditionalSupport}</h3>
              <span className="text-[11px] text-gray-400 font-mono">{isUrdu ? `کیس نمبر ${caseId}` : `Case: ${caseId} • EOC Dispatch`}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl bg-[#161B22] hover:bg-[#21262D] border border-[#30363D] text-gray-300 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto scrollbar-thin">
          {submitted ? (
            <div className="py-8 text-center space-y-3 animate-in zoom-in-95">
              <div className="w-16 h-16 rounded-full bg-emerald-600/20 border border-emerald-500/50 text-emerald-400 flex items-center justify-center mx-auto">
                <Check className="w-8 h-8" />
              </div>
              <h4 className="text-base font-bold text-white">{isUrdu ? 'درخواست ارسال ہو گئی!' : 'Support Request Dispatched!'}</h4>
              <p className="text-xs text-emerald-300 font-mono">{t.supportRequestedToast}</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-gray-300">
                {isUrdu
                  ? 'موقع کی ضروریات کے مطابق درکار فورس کا انتخاب کریں۔ آپریٹر کو فوری الرٹ موصول ہو جائے گا۔'
                  : 'Select the required tactical field support. Operator Command will instantly dispatch the nearest unit.'}
              </p>

              <div className="space-y-2">
                {supportOptions.map((opt) => {
                  const Icon = opt.icon;
                  const isSelected = selectedType === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setSelectedType(opt.id)}
                      className={`w-full p-3 rounded-2xl border text-left transition-all flex items-center justify-between gap-3 ${
                        isUrdu ? 'text-right' : 'text-left'
                      } ${
                        isSelected
                          ? 'bg-[#161B22] border-blue-500 ring-1 ring-blue-500/50 shadow-md'
                          : 'bg-[#0B0E14] border-[#30363D] hover:border-gray-500'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isSelected ? 'bg-blue-600 text-white' : 'bg-[#161B22] text-gray-400'}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white truncate">{opt.label}</div>
                          <div className="text-[10px] text-gray-400 truncate mt-0.5">{opt.desc}</div>
                        </div>
                      </div>
                      <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${isSelected ? 'bg-blue-600 border-blue-400 text-white' : 'border-gray-600'}`}>
                        {isSelected && <Check className="w-3 h-3" />}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-gray-300 font-mono">
                  {isUrdu ? 'اضافی ہدایات (اختیاری):' : 'On-Scene Notes for Operator (Optional):'}
                </label>
                <input
                  type="text"
                  value={customNote}
                  onChange={(e) => setCustomNote(e.target.value)}
                  placeholder={isUrdu ? 'مثال: مریض ملبے میں ہے، کٹر مشین چاہیے' : 'e.g., 2 casualties unconscious, stretcher needed'}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#0B0E14] border border-[#30363D] text-xs text-white placeholder:text-gray-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="pt-2 flex items-center gap-2.5">
                <button type="button" onClick={onClose} className="flex-1 py-3 px-4 rounded-xl bg-[#0B0E14] hover:bg-[#161B22] border border-[#30363D] text-gray-300 text-xs font-bold transition-colors min-h-[44px]">
                  {t.cancel}
                </button>
                <button type="button" onClick={handleSubmit} className="flex-[2] py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-lg active:scale-95 transition-all min-h-[44px]">
                  <Send className="w-3.5 h-3.5" />
                  <span>{t.sendSupportRequest}</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
