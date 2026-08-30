'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/i18n/LanguageContext';
import { getTranslation } from '@/i18n/translations';
import {
  Shield,
  Menu,
  X,
  ChevronDown,
  Phone,
  Globe,
  AlertTriangle,
  MapPin,
  LogIn,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function Navigation() {
  const { lang, isUrdu, toggleLang } = useLanguage();
  const t = getTranslation(lang);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-[#21262D] bg-[#0B0E14]/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-[#3FB950] to-[#059669] shadow-lg shadow-emerald-500/20 transition-shadow group-hover:shadow-emerald-500/40">
            <Shield className="h-5 w-5 text-white" />
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-bold text-[#E6EDF3] tracking-tight leading-none">
              {t.brand}
            </p>
            <p className="text-[10px] text-[#6E7681] leading-none mt-0.5">
              {t.brandTagline}
            </p>
          </div>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-1">
          <Link
            href="/"
            className="px-3 py-1.5 text-sm text-[#8B949E] hover:text-[#E6EDF3] transition-colors rounded-md hover:bg-[#1A1F2B]"
          >
            {lang === 'ur' ? 'ہوم' : 'Home'}
          </Link>
          <Link
            href="/emergency"
            className="px-3 py-1.5 text-sm text-[#8B949E] hover:text-[#E6EDF3] transition-colors rounded-md hover:bg-[#1A1F2B]"
          >
            {lang === 'ur' ? 'ایمرجنسی' : 'Emergency'}
          </Link>
          <Link
            href="/nearby"
            className="px-3 py-1.5 text-sm text-[#8B949E] hover:text-[#E6EDF3] transition-colors rounded-md hover:bg-[#1A1F2B]"
          >
            {lang === 'ur' ? 'قریبی' : 'Nearby'}
          </Link>
          <Link
            href="/dashboard"
            className="px-3 py-1.5 text-sm text-[#8B949E] hover:text-[#E6EDF3] transition-colors rounded-md hover:bg-[#1A1F2B]"
          >
            {lang === 'ur' ? 'پورٹل' : 'Portal'}
          </Link>

          {/* More dropdown */}
          <div className="relative">
            <button
              onClick={() => setMoreOpen(!moreOpen)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-[#8B949E] hover:text-[#E6EDF3] transition-colors rounded-md hover:bg-[#1A1F2B]"
            >
              {lang === 'ur' ? 'مزید' : 'More'}
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
            </button>
            <AnimatePresence>
              {moreOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="absolute right-0 mt-1 w-52 rounded-lg border border-[#21262D] bg-[#11151C] p-1.5 shadow-xl"
                >
                  <Link
                    href="/operator"
                    onClick={() => setMoreOpen(false)}
                    className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-[#8B949E] hover:bg-[#1A1F2B] hover:text-[#E6EDF3]"
                  >
                    <Shield className="h-4 w-4" />
                    {t.operatorConsole}
                  </Link>
                  <Link
                    href="/responder"
                    onClick={() => setMoreOpen(false)}
                    className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-[#8B949E] hover:bg-[#1A1F2B] hover:text-[#E6EDF3]"
                  >
                    <Phone className="h-4 w-4" />
                    {t.responderApp}
                  </Link>
                  <Link
                    href="/login"
                    onClick={() => setMoreOpen(false)}
                    className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-[#8B949E] hover:bg-[#1A1F2B] hover:text-[#E6EDF3]"
                  >
                    <LogIn className="h-4 w-4" />
                    {t.login}
                  </Link>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </nav>

        {/* Right actions */}
        <div className="flex items-center gap-2">
          {/* Language Toggle */}
          <button
            onClick={toggleLang}
            className="flex items-center gap-1 rounded-full border border-[#21262D] px-3 py-1 text-xs font-medium text-[#8B949E] hover:border-[#30363D] hover:text-[#E6EDF3] transition-colors"
          >
            <Globe className="h-3.5 w-3.5" />
            {isUrdu ? 'EN' : 'اردو'}
          </button>

          {/* Emergency CTA - Desktop */}
          <Link
            href="/emergency"
            className="hidden md:flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#F85149] to-[#DA3633] px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-red-500/20 hover:shadow-red-500/40 transition-shadow"
          >
            <AlertTriangle className="h-4 w-4" />
            {t.emergencyHotline}
          </Link>

          {/* Mobile menu toggle */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden flex h-9 w-9 items-center justify-center rounded-lg border border-[#21262D] text-[#8B949E] hover:text-[#E6EDF3] transition-colors"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="md:hidden overflow-hidden border-t border-[#21262D] bg-[#0B0E14]"
          >
            <div className="flex flex-col gap-1 p-4">
              <Link
                href="/"
                onClick={() => setMobileOpen(false)}
                className="rounded-lg px-4 py-3 text-sm text-[#E6EDF3] hover:bg-[#1A1F2B]"
              >
                {lang === 'ur' ? 'ہوم' : 'Home'}
              </Link>
              <Link
                href="/emergency"
                onClick={() => setMobileOpen(false)}
                className="rounded-lg px-4 py-3 text-sm text-[#E6EDF3] hover:bg-[#1A1F2B]"
              >
                {lang === 'ur' ? 'ایمرجنسی' : 'Emergency'}
              </Link>
              <Link
                href="/nearby"
                onClick={() => setMobileOpen(false)}
                className="rounded-lg px-4 py-3 text-sm text-[#E6EDF3] hover:bg-[#1A1F2B]"
              >
                {lang === 'ur' ? 'قریبی' : 'Nearby'}
              </Link>
              <Link
                href="/dashboard"
                onClick={() => setMobileOpen(false)}
                className="rounded-lg px-4 py-3 text-sm text-[#E6EDF3] hover:bg-[#1A1F2B]"
              >
                {lang === 'ur' ? 'پورٹل' : 'Portal'}
              </Link>
              <Link
                href="/login"
                onClick={() => setMobileOpen(false)}
                className="rounded-lg px-4 py-3 text-sm text-[#8B949E] hover:bg-[#1A1F2B]"
              >
                {t.login}
              </Link>
              <Link
                href="/operator"
                onClick={() => setMobileOpen(false)}
                className="rounded-lg px-4 py-3 text-sm text-[#8B949E] hover:bg-[#1A1F2B]"
              >
                {t.operatorConsole}
              </Link>
              <Link
                href="/responder"
                onClick={() => setMobileOpen(false)}
                className="rounded-lg px-4 py-3 text-sm text-[#8B949E] hover:bg-[#1A1F2B]"
              >
                {t.responderApp}
              </Link>
              <div className="mt-2 pt-2 border-t border-[#21262D]">
                <Link
                  href="/emergency"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#F85149] to-[#DA3633] px-4 py-3 text-sm font-semibold text-white"
                >
                  <AlertTriangle className="h-4 w-4" />
                  {t.emergencyHotline}
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
