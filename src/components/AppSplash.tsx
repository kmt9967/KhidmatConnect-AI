'use client';

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Shield } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import { getTranslation } from '@/i18n/translations';
import {
  SPLASH_FADE_MS,
  SPLASH_SESSION_KEY,
  SPLASH_VIEWPORT_QUERY,
  shouldOfferSplash,
  splashTiming,
} from '@/lib/ui/splashPolicy';

/**
 * App-like opening screen for the public homepage.
 *
 * Why this exists: during the demo the site is mirrored from a phone, and a
 * blank navbar-to-hero first frame reads as "a web page". A short branded
 * open makes it feel like a purpose-built mobile tool - nothing more. This is
 * a mobile web experience; it deliberately makes no native-app claim.
 *
 * Guardrails, in order of importance:
 *  1. Emergency access is never delayed in a way that matters. The overlay is
 *     mounted only by the homepage, shows for ~1.5s, is tap-to-dismiss, and is
 *     entirely absent on desktop, on every deep link (/case, /operator,
 *     /responder, /emergency ...), and on any repeat visit in the session.
 *  2. Nothing renders during SSR. The decision needs matchMedia + sessionStorage,
 *     so it happens in an effect; rendering it in the server HTML would both
 *     flash on desktop and mismatch on hydration.
 *  3. position: fixed, so the layout underneath is identical with or without it
 *     (no cumulative layout shift when it disappears).
 */

// Module scope, not component state: React's development double-invocation of
// effects must not clear the dismiss timers and leave the overlay on screen.
let claimedThisPageLoad = false;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Whether this mount may show the opening screen. See splashPolicy for rules. */
function offerSplashNow(): boolean {
  if (claimedThisPageLoad) return false;
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  let alreadySeen = false;
  try {
    alreadySeen = Boolean(window.sessionStorage.getItem(SPLASH_SESSION_KEY));
  } catch {
    // Storage blocked (private mode / embedded webview): skip the splash.
    return false;
  }
  const isMobileViewport = window.matchMedia(SPLASH_VIEWPORT_QUERY).matches;
  if (!shouldOfferSplash({ isMobileViewport, alreadySeen })) return false;
  claimedThisPageLoad = true;
  try {
    window.sessionStorage.setItem(SPLASH_SESSION_KEY, '1');
  } catch {
    /* non-blocking */
  }
  return true;
}

export default function AppSplash() {
  const { lang, isUrdu } = useLanguage();
  const t = getTranslation(lang);

  const [showing, setShowing] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;
    if (mq?.matches) setReduced(true);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq?.addEventListener?.('change', onChange);
    return () => mq?.removeEventListener?.('change', onChange);
  }, []);

  useEffect(() => {
    if (!offerSplashNow()) return;
    setShowing(true);
    const { holdMs, totalMs } = splashTiming(prefersReducedMotion());
    setTimeout(() => setLeaving(true), holdMs);
    setTimeout(() => setShowing(false), totalMs);
    // No cleanup: see claimedThisPageLoad above.
  }, []);

  if (!showing) return null;

  const dismiss = () => {
    setLeaving(true);
    setTimeout(() => setShowing(false), 120);
  };

  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: leaving ? 0 : 1 }}
      transition={{ duration: reduced ? 0 : SPLASH_FADE_MS / 1000, ease: 'easeOut' }}
      onClick={dismiss}
      aria-hidden="true"
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden bg-[#0B0E14]"
    >
      <div className="absolute inset-0 bg-dot-pattern opacity-40" />
      <div className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#3FB950]/10 blur-3xl" />

      <div className="relative flex flex-col items-center px-8 text-center">
        {/* Shield mark with a single expanding halo */}
        <div className="relative flex h-20 w-20 items-center justify-center">
          {!reduced && (
            <span
              className="absolute inset-0 rounded-3xl border border-[#3FB950]/40"
              style={{ animation: 'pulse-ring 1.6s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}
            />
          )}
          <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-[#3FB950] to-[#059669] glow-emerald">
            <Shield className="h-8 w-8 text-white" />
          </span>
        </div>

        <motion.h1
          initial={reduced ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduced ? 0 : 0.45, delay: reduced ? 0 : 0.1 }}
          className="mt-5 text-2xl font-extrabold tracking-tight text-[#E6EDF3]"
        >
          {t.brand}
        </motion.h1>

        <motion.p
          initial={reduced ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduced ? 0 : 0.45, delay: reduced ? 0 : 0.22 }}
          className={`mt-1.5 max-w-[16rem] text-[11px] font-medium leading-relaxed text-[#8B949E] ${
            // Letter-spacing and caps are Latin-script decoration only; tracking
            // would pull Urdu glyphs apart at their joins.
            isUrdu ? '' : 'uppercase tracking-wide'
          }`}
        >
          {t.appSplashTagline}
        </motion.p>

        {/* Loading affordance (shimmer keyframe lives in globals.css) */}
        <div className="mt-7 h-0.5 w-28 overflow-hidden rounded-full bg-[#21262D]">
          <div className={reduced ? 'h-full w-full bg-[#3FB950]/60' : 'splash-bar h-full w-full'} />
        </div>
      </div>
    </motion.div>
  );
}
