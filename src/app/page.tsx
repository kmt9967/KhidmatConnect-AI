'use client';

import Link from 'next/link';
import { useLanguage } from '@/i18n/LanguageContext';
import { getTranslation } from '@/i18n/translations';
import Navigation from '@/components/Navigation';
import MobileBottomNav from '@/components/MobileBottomNav';
import {
  AlertTriangle,
  MapPin,
  Shield,
  Clock,
  Phone,
  Users,
  Zap,
  Heart,
  ArrowRight,
} from 'lucide-react';
import { motion } from 'motion/react';

export default function HomePage() {
  const { lang, isUrdu } = useLanguage();
  const t = getTranslation(lang);

  return (
    <div dir={isUrdu ? 'rtl' : 'ltr'} className="min-h-screen bg-[#0B0E14]">
      <Navigation />

      <main className="pb-20 md:pb-0">
        {/* Hero Section */}
        <section className="relative overflow-hidden">
          {/* Background gradient */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#0B0E14] via-[#0B0E14] to-[#11151C]" />
          <div className="absolute inset-0 bg-dot-pattern opacity-40" />

          {/* Active case banner */}
          <div className="relative mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="mx-auto mb-8 flex max-w-md items-center gap-3 rounded-xl border border-[#F85149]/20 bg-[#F85149]/5 px-4 py-2.5"
            >
              <div className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#F85149] opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#F85149]" />
              </div>
              <p className="text-xs text-[#F85149]">
                <span className="font-semibold">2 {lang === 'ur' ? 'فعال ایمرجنسیز' : 'active emergencies'}</span>
                {' '} — {lang === 'ur' ? 'ریسپانس ٹیمیں راستے میں' : 'Response teams en route'}
              </p>
            </motion.div>

            {/* Hero content */}
            <div className="mx-auto max-w-3xl text-center">
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
              >
                <span className="inline-flex items-center gap-2 rounded-full border border-[#3FB950]/20 bg-[#3FB950]/5 px-4 py-1.5 text-xs font-medium text-[#3FB950]">
                  <Shield className="h-3.5 w-3.5" />
                  {t.heroBadge}
                </span>
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="mt-6 text-4xl font-extrabold tracking-tight text-[#E6EDF3] sm:text-5xl lg:text-6xl"
              >
                {t.heroTitle}
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="mt-4 text-lg text-[#8B949E] sm:text-xl"
              >
                {t.heroSubtitle}
              </motion.p>

              {/* CTAs */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.4 }}
                className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center"
              >
                <Link
                  href="/emergency"
                  className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#F85149] to-[#DA3633] px-8 py-4 text-base font-bold text-white shadow-lg shadow-red-500/20 hover:shadow-red-500/40 transition-all sm:w-auto"
                >
                  <AlertTriangle className="h-5 w-5" />
                  {t.requestHelp}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link
                  href="/nearby"
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#21262D] bg-[#11151C] px-8 py-4 text-base font-semibold text-[#E6EDF3] hover:border-[#30363D] hover:bg-[#1A1F2B] transition-all sm:w-auto"
                >
                  <MapPin className="h-5 w-5 text-[#58A6FF]" />
                  {t.exploreHelp}
                </Link>
              </motion.div>

              {/* Zero friction notice */}
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.6 }}
                className="mt-4 text-xs text-[#6E7681]"
              >
                {t.noLoginRequired}
              </motion.p>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <motion.h2
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-center text-2xl font-bold text-[#E6EDF3] sm:text-3xl"
          >
            {t.howItWorksTitle}
          </motion.h2>

          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {t.howItWorksSteps.map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                className="relative rounded-xl border border-[#21262D] bg-[#11151C] p-6 text-center"
              >
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#3FB950]/10 to-[#059669]/10 text-2xl font-extrabold text-[#3FB950]">
                  {step.step}
                </div>
                <h3 className="text-lg font-bold text-[#E6EDF3]">{step.title}</h3>
                <p className="mt-2 text-sm text-[#8B949E]">{step.desc}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Core Capabilities */}
        <section className="relative mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
          <motion.h2
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-center text-2xl font-bold text-[#E6EDF3] sm:text-3xl"
          >
            {t.capabilitiesTitle}
          </motion.h2>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {t.capabilities.map((cap, i) => {
              const icons = [Zap, Shield, Users, Clock];
              const colors = ['#3FB950', '#58A6FF', '#BC8CFF', '#D29922'];
              const Icon = icons[i];
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: i * 0.08 }}
                  className="rounded-xl border border-[#21262D] bg-[#11151C] p-5 hover:border-[#30363D] transition-colors"
                >
                  <div
                    className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg"
                    style={{ backgroundColor: `${colors[i]}15` }}
                  >
                    <Icon className="h-5 w-5" style={{ color: colors[i] }} />
                  </div>
                  <h3 className="text-sm font-bold text-[#E6EDF3]">{cap.title}</h3>
                  <p className="mt-1 text-xs text-[#8B949E]">{cap.desc}</p>
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-[#21262D] bg-[#0B0E14]">
          <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#3FB950] to-[#059669]">
                  <Shield className="h-4 w-4 text-white" />
                </div>
                <span className="text-sm font-bold text-[#E6EDF3]">{t.brand}</span>
              </div>
              <div className="flex items-center gap-4 text-xs text-[#6E7681]">
                <span className="flex items-center gap-1">
                  <Phone className="h-3.5 w-3.5" />
                  1122
                </span>
                <span className="flex items-center gap-1">
                  <Heart className="h-3.5 w-3.5 text-[#F85149]" />
                  {lang === 'ur' ? 'عوامی خدمت' : 'Public Service'}
                </span>
              </div>
            </div>
          </div>
        </footer>
      </main>

      <MobileBottomNav />
    </div>
  );
}
