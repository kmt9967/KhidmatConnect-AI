'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/i18n/LanguageContext';
import { getTranslation } from '@/i18n/translations';
import { useAuth } from '@/lib/auth/AuthContext';
import MobileBottomNav from '@/components/MobileBottomNav';
import {
  Shield,
  AlertTriangle,
  ShieldCheck,
  ArrowRight,
  Globe,
  User,
  Headphones,
  Siren,
  Loader2,
} from 'lucide-react';
import { motion } from 'motion/react';

type DemoRole = 'CITIZEN' | 'OPERATOR' | 'RESPONDER';

const demoAccounts = [
  {
    role: 'CITIZEN' as DemoRole,
    label: 'Citizen Demo',
    labelUr: 'شہری ڈیمو',
    phone: '0300-8241001',
    description: 'Ahmed Tariq — View cases, requests, messages',
    descriptionUr: 'احمد طارق — کیسز، درخواستیں، پیغامات دیکھیں',
    icon: User,
    color: '#58A6FF',
    redirect: '/dashboard',
  },
  {
    role: 'OPERATOR' as DemoRole,
    label: 'Operator Demo',
    labelUr: 'آپریٹر ڈیمو',
    phone: '0300-1122001',
    description: 'Fatima — Command center, case review, assignment',
    descriptionUr: 'فاطمہ — کمانڈ سینٹر، کیس جائزہ، تفویض',
    icon: Headphones,
    color: '#3FB950',
    redirect: '/operator',
  },
  {
    role: 'RESPONDER' as DemoRole,
    label: 'Responder Demo',
    labelUr: 'ریسپونڈر ڈیمو',
    phone: '0333-5121001',
    description: 'Ahmed Khan — Assigned cases, navigation, status',
    descriptionUr: 'احمد خان — تفویض کردہ کیسز، نیویگیشن، اسٹیٹس',
    icon: Siren,
    color: '#F0883E',
    redirect: '/responder',
  },
];

export default function LoginPage() {
  const { lang, isUrdu, toggleLang } = useLanguage();
  const t = getTranslation(lang);
  const router = useRouter();
  const { refresh } = useAuth();

  const [loggingIn, setLoggingIn] = useState<DemoRole | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDemoLogin = async (role: DemoRole) => {
    setLoggingIn(role);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Login failed');
        setLoggingIn(null);
        return;
      }
      // Refresh auth context then redirect
      await refresh();
      router.push(data.redirect || '/dashboard');
    } catch {
      setError('Network error. Please try again.');
      setLoggingIn(null);
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

      <main className="mx-auto max-w-lg px-4 py-8 pb-24 md:py-12">
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
              <ShieldCheck className="h-5 w-5 text-[#3FB950]" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold text-[#E6EDF3]">{t.loginWelcome}</h1>
              <p className="text-xs text-[#6E7681]">
                {isUrdu ? 'ڈیمو اکاؤنٹ منتخب کریں' : 'Select a demo account to continue'}
              </p>
            </div>
          </div>

          {/* Demo Account Buttons */}
          <div className="space-y-3">
            {demoAccounts.map((account) => {
              const Icon = account.icon;
              const isLoading = loggingIn === account.role;
              return (
                <button
                  key={account.role}
                  onClick={() => handleDemoLogin(account.role)}
                  disabled={loggingIn !== null}
                  className="w-full flex items-center gap-4 rounded-xl border border-[#21262D] bg-[#0B0E14] p-4 text-start group hover:border-[#30363D] hover:bg-[#161B22] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors"
                    style={{ backgroundColor: `${account.color}15` }}
                  >
                    <Icon className="h-5 w-5" style={{ color: account.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-[#E6EDF3]">
                      {isUrdu ? account.labelUr : account.label}
                    </div>
                    <div className="text-xs text-[#6E7681] truncate mt-0.5">
                      {isUrdu ? account.descriptionUr : account.description}
                    </div>
                  </div>
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 text-[#3FB950] animate-spin shrink-0" />
                  ) : (
                    <ArrowRight className="h-4 w-4 text-[#6E7681] transition-transform group-hover:translate-x-0.5 group-hover:text-[#E6EDF3] shrink-0" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Error message */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 rounded-lg border border-[#F85149]/30 bg-[#F85149]/10 px-4 py-2.5 text-xs text-[#F85149]"
            >
              {error}
            </motion.div>
          )}

          {/* Demo notice */}
          <div className="mt-5 flex items-start gap-2.5 rounded-xl bg-[#0B0E14] border border-[#21262D] p-3.5">
            <ShieldCheck className="h-4 w-4 text-[#3FB950] mt-0.5 shrink-0" />
            <p className="text-[11px] leading-relaxed text-[#6E7681]">
              {isUrdu
                ? 'یہ ڈیمو موڈ ہے — کوئی حقیقی تصدیق نہیں۔ اکاؤنٹس پہلے سے موجود ڈیٹا بیس سے منتخب کیے گئے ہیں۔'
                : 'This is demo mode — no real authentication. Accounts are selected from pre-seeded database records.'}
            </p>
          </div>
        </motion.div>

        {/* Role Security Notice */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-4 rounded-xl border border-[#21262D] bg-[#11151C]/50 p-4"
        >
          <p className="text-[11px] leading-relaxed text-[#6E7681] text-center">
            {t.loginRoleNotice}
          </p>
        </motion.div>
      </main>

      <MobileBottomNav />
    </div>
  );
}
