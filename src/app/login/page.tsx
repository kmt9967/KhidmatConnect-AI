'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/i18n/LanguageContext';
import { getTranslation } from '@/i18n/translations';
import MobileBottomNav from '@/components/MobileBottomNav';
import {
  Shield,
  Lock,
  Phone,
  AlertTriangle,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  Globe,
  ArrowLeft,
  User,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

type AuthStep = 'input' | 'otp' | 'success';
type AuthMode = 'login' | 'signup';

export default function LoginPage() {
  const { lang, isUrdu, toggleLang } = useLanguage();
  const t = getTranslation(lang);

  const [mode, setMode] = useState<AuthMode>('login');
  const [step, setStep] = useState<AuthStep>('input');
  const [contactInput, setContactInput] = useState('');
  const [fullName, setFullName] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  const handleSendOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactInput) return;
    setStep('otp');
  };

  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    setIsVerifying(true);
    setTimeout(() => {
      setIsVerifying(false);
      setStep('success');
    }, 1200);
  };

  const handleBack = () => {
    if (step === 'otp') {
      setStep('input');
      setOtpCode('');
    } else if (step === 'success') {
      setStep('input');
      setContactInput('');
      setFullName('');
    }
  };

  return (
    <div dir={isUrdu ? 'rtl' : 'ltr'} className="min-h-screen bg-[#0B0E14]">
      {/* Minimal top bar */}
      <div className="sticky top-0 z-40 border-b border-[#21262D] bg-[#0B0E14]/95 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-lg items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#3FB950] to-[#059669]">
              <Shield className="h-4 w-4 text-white" />
            </div>
            <span className="text-sm font-bold text-[#E6EDF3]">{t.brand}</span>
          </Link>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleLang}
              className="flex items-center gap-1 rounded-full border border-[#21262D] px-3 py-1 text-xs font-medium text-[#8B949E] hover:border-[#30363D] hover:text-[#E6EDF3] transition-colors"
            >
              <Globe className="h-3.5 w-3.5" />
              {isUrdu ? 'EN' : 'اردو'}
            </button>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-lg px-4 py-8 pb-24 md:py-16">
        {/* Emergency shortcut banner */}
        <Link
          href="/emergency"
          className="mb-6 flex items-center justify-between rounded-xl border border-[#F85149]/20 bg-[#F85149]/5 px-4 py-3 group hover:border-[#F85149]/40 transition-colors"
        >
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-[#F85149]" />
            <span className="text-sm font-semibold text-[#F85149]">
              {t.loginEmergencyShortcut}
            </span>
          </div>
          <ArrowRight className="h-4 w-4 text-[#F85149] transition-transform group-hover:translate-x-0.5" />
        </Link>

        {/* Auth Card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="relative overflow-hidden rounded-2xl border border-[#21262D] bg-[#11151C] p-6 shadow-2xl sm:p-8"
        >
          {/* Top accent line */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#3FB950] to-[#58A6FF]" />

          {/* Header */}
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#3FB950]/10">
              <Lock className="h-5 w-5 text-[#3FB950]" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold text-[#E6EDF3]">{t.loginWelcome}</h1>
              <p className="text-xs text-[#6E7681]">{t.loginDescription}</p>
            </div>
          </div>

          {/* Mode Tabs: Login / Sign Up */}
          {step === 'input' && (
            <div className="mb-5 flex rounded-xl bg-[#0B0E14] p-1 border border-[#21262D]">
              <button
                onClick={() => setMode('login')}
                className={`flex-1 rounded-lg py-2.5 text-xs font-bold transition-all ${
                  mode === 'login'
                    ? 'bg-[#1A1F2B] text-[#E6EDF3] shadow-sm'
                    : 'text-[#6E7681] hover:text-[#8B949E]'
                }`}
              >
                {t.loginTabLogin}
              </button>
              <button
                onClick={() => setMode('signup')}
                className={`flex-1 rounded-lg py-2.5 text-xs font-bold transition-all ${
                  mode === 'signup'
                    ? 'bg-[#1A1F2B] text-[#E6EDF3] shadow-sm'
                    : 'text-[#6E7681] hover:text-[#8B949E]'
                }`}
              >
                {t.loginTabSignUp}
              </button>
            </div>
          )}

          {/* Step Content */}
          <AnimatePresence mode="wait">
            {step === 'input' && (
              <motion.form
                key="input"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                transition={{ duration: 0.2 }}
                onSubmit={handleSendOtp}
                className="space-y-4"
              >
                {/* Sign Up: Name field */}
                {mode === 'signup' && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[#8B949E]">{t.loginFullName}</label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6E7681]" />
                      <input
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder={t.loginFullNamePlaceholder}
                        className="w-full rounded-xl border border-[#21262D] bg-[#0B0E14] py-3.5 pe-4 ps-10 text-sm text-[#E6EDF3] placeholder:text-[#6E7681] focus:border-[#3FB950] focus:outline-none transition-colors min-h-[48px]"
                      />
                    </div>
                  </div>
                )}

                {/* Phone / Email Input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#8B949E]">{t.phoneOrEmail}</label>
                  <div className="relative">
                    <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6E7681]" />
                    <input
                      type="text"
                      required
                      value={contactInput}
                      onChange={(e) => setContactInput(e.target.value)}
                      placeholder={isUrdu ? '0300 1234567' : '0300 1234567 or email@example.com'}
                      className="w-full rounded-xl border border-[#21262D] bg-[#0B0E14] py-3.5 pe-4 ps-10 text-sm font-mono text-[#E6EDF3] placeholder:text-[#6E7681] placeholder:font-sans focus:border-[#3FB950] focus:outline-none transition-colors min-h-[48px]"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full rounded-xl bg-gradient-to-r from-[#3FB950] to-[#059669] py-3.5 text-sm font-bold text-white shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 transition-shadow min-h-[48px]"
                >
                  {t.loginSendOtp}
                </button>

                {/* Demo notice */}
                <p className="text-center text-[11px] text-[#6E7681]">{t.loginDemoNotice}</p>
              </motion.form>
            )}

            {step === 'otp' && (
              <motion.form
                key="otp"
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.2 }}
                onSubmit={handleVerifyOtp}
                className="space-y-4"
              >
                <button
                  type="button"
                  onClick={handleBack}
                  className="flex items-center gap-1 text-xs font-semibold text-[#8B949E] hover:text-[#E6EDF3] transition-colors"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  {t.loginBack}
                </button>

                <div className="space-y-1.5">
                  <label className="flex items-center justify-between text-xs font-bold text-[#8B949E]">
                    <span>{t.loginOtpLabel}</span>
                    <span className="font-mono text-[#3FB950]">{t.loginOtpHint}</span>
                  </label>
                  <p className="text-[11px] text-[#6E7681]">
                    {lang === 'ur' ? `کوڈ بھیجا گیا: ${contactInput}` : `Code sent to: ${contactInput}`}
                  </p>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    placeholder={t.loginOtpPlaceholder}
                    className="w-full rounded-xl border border-[#3FB950] bg-[#0B0E14] py-4 text-center font-mono text-xl tracking-widest text-[#E6EDF3] focus:outline-none min-h-[48px]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isVerifying}
                  className="w-full rounded-xl bg-gradient-to-r from-[#3FB950] to-[#059669] py-3.5 text-sm font-bold text-white shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 transition-shadow disabled:opacity-60 min-h-[48px] flex items-center justify-center gap-2"
                >
                  {isVerifying ? (
                    <span>{t.loginVerifying}</span>
                  ) : (
                    <span>{t.loginVerify}</span>
                  )}
                </button>
              </motion.form>
            )}

            {step === 'success' && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
                className="space-y-4 text-center py-4"
              >
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#3FB950]/10">
                  <CheckCircle2 className="h-8 w-8 text-[#3FB950]" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-[#E6EDF3]">
                    {lang === 'ur' ? 'خوش آمدید!' : 'Welcome!'}
                  </h2>
                  <p className="mt-1 text-sm text-[#8B949E]">
                    {lang === 'ur' ? 'آپ کامیابی سے لاگ ان ہو گئے ہیں۔' : 'You have been successfully signed in.'}
                  </p>
                </div>
                <Link
                  href="/dashboard"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#1A1F2B] border border-[#21262D] py-3 text-sm font-bold text-[#E6EDF3] hover:bg-[#21262D] transition-colors min-h-[48px]"
                >
                  {lang === 'ur' ? 'ڈیش بورڈ پر جائیں' : 'Go to Dashboard'}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Role Security Notice */}
          <div className="mt-5 flex items-start gap-2.5 rounded-xl bg-[#0B0E14] border border-[#21262D] p-3.5">
            <ShieldCheck className="h-4 w-4 text-[#3FB950] mt-0.5 shrink-0" />
            <p className="text-[11px] leading-relaxed text-[#6E7681]">{t.loginRoleNotice}</p>
          </div>
        </motion.div>
      </main>

      <MobileBottomNav />
    </div>
  );
}
