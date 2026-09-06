/**
 * Opening-screen ("splash") policy for the public homepage.
 *
 * Kept as pure functions so the gating rules can be asserted without a DOM:
 *  - mobile / tablet only - a desktop visitor never sees it;
 *  - homepage only - the component is mounted by src/app/page.tsx, so deep
 *    links (/case, /operator, /responder, /emergency) can never be blocked;
 *  - once per browsing session;
 *  - about 1.5s, with a hard 2s ceiling, and shorter under prefers-reduced-motion.
 *
 * This is a mobile *web* experience. Nothing here installs, presents as, or
 * otherwise implies a native Android/iOS application.
 */

/** Mobile + tablet. Tailwind's `lg` (desktop) starts at 1024px. */
export const SPLASH_VIEWPORT_QUERY = '(max-width: 1023px)';

/** Session flag so a refresh does not replay the animation. */
export const SPLASH_SESSION_KEY = 'khidmatconnect.splashSeen';

export const SPLASH_HOLD_MS = 1200;
export const SPLASH_FADE_MS = 300;
/** Reduced motion: the brand frame still lands, but nothing moves. */
export const SPLASH_REDUCED_HOLD_MS = 600;
/** Absolute ceiling, per the demo-polish requirement. */
export const SPLASH_MAX_TOTAL_MS = 2000;

export function shouldOfferSplash(env: { isMobileViewport: boolean; alreadySeen: boolean }): boolean {
  return env.isMobileViewport && !env.alreadySeen;
}

export function splashTiming(reducedMotion: boolean): {
  holdMs: number;
  fadeMs: number;
  totalMs: number;
} {
  const holdMs = reducedMotion ? SPLASH_REDUCED_HOLD_MS : SPLASH_HOLD_MS;
  // +80ms lets the fade finish before the node is removed.
  return { holdMs, fadeMs: SPLASH_FADE_MS, totalMs: holdMs + SPLASH_FADE_MS + 80 };
}
