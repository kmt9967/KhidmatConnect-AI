/**
 * Browser geolocation service - permission-aware, prompt-hungry-safe.
 *
 * Root-cause context: KhidmatConnect used to fire getCurrentPosition() merely
 * because a page loaded (/nearby, /responder) and again every ~10s from
 * timer-driven React effects. Content settings are stored PER ORIGIN, so those
 * background denials poisoned the citizen GPS button on /emergency on the same
 * profile and made the site's location permission appear "stuck on Block"
 * (other websites were never affected because they do not do this).
 *
 * Hard rules enforced here:
 *  1. Nothing in this module may be called just because a page mounted. Every
 *     entry point is expected to sit behind a deliberate user action
 *     ("Use My Current Location", "Detect My Location", Accept / En Route).
 *  2. If the stored permission state is `denied`, navigator.geolocation is NOT
 *     called at all. Repeated calls against a blocked permission are exactly
 *     what keeps an origin blocked. We return a structured DENIED instead so
 *     the UI can explain how to un-block it - only the user can do that, in the
 *     browser's own permission UI. We never pretend otherwise.
 *  3. Insecure origins short-circuit to INSECURE before touching the API.
 *  4. Every real API invocation is counted (geolocationCallStats) so automated
 *     tests and demo rehearsals can PROVE no hidden background request exists.
 *
 * SSR safety: all functions tolerate `window` / `navigator` being absent.
 */

import type {
  GeoFix,
  GeolocationPermissionState,
  GeolocationResult,
} from './types';

// ─── Tuning ────────────────────────────────────────────────
export const GEOLOCATION_DEFAULTS = {
  enableHighAccuracy: true,
  /** Emergency intake must not hang: give up after 10s and let the user type. */
  timeoutMs: 10_000,
  /** 30s of cache avoids re-surveying the radios on rapid retries. */
  maximumAgeMs: 30_000,
} as const;

export interface GeolocationRequestOptions {
  timeoutMs?: number;
  maximumAgeMs?: number;
  enableHighAccuracy?: boolean;
  /**
   * Explicit user intent to retry even though we believe the permission is
   * blocked (the "Try Again" button). Skips the cached-`denied` short circuit
   * exactly once and refreshes the cached probe in the background.
   */
  force?: boolean;
}

// ─── Runtime state ─────────────────────────────────────────
let cachedPermissionState: GeolocationPermissionState | null = null;
let permissionChangeSubscribed = false;
let apiCalls = 0;
let suppressedCalls = 0;
/** Orders concurrent permission probes so a slower one cannot roll the decision backwards. */
let probeSequence = 0;

interface NavigatorGeolocation {
  getCurrentPosition: (
    success: (position: GeolocationPosition) => void,
    error: (error: GeolocationPositionError) => void,
    options?: PositionOptions,
  ) => void;
  watchPosition: (
    success: (position: GeolocationPosition) => void,
    error: (error: GeolocationPositionError) => void,
    options?: PositionOptions,
  ) => number;
  clearWatch: (watchId: number) => void;
}

function geolocationRuntime(): NavigatorGeolocation | null {
  if (typeof navigator === 'undefined') return null;
  const nav = navigator as unknown as { geolocation?: NavigatorGeolocation };
  return nav.geolocation ?? null;
}

/** True when the page is served over HTTPS (or a localhost dev server). */
export function isSecureGeolocationContext(): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof window.isSecureContext === 'boolean') return window.isSecureContext;
  const host = window.location?.hostname ?? '';
  return (
    window.location?.protocol === 'https:' ||
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '[::1]'
  );
}

export function isGeolocationSupported(): boolean {
  return geolocationRuntime() !== null;
}

// ─── Permission awareness (read-only; never triggers a prompt) ───
function normalizeState(state: string | undefined | null): GeolocationPermissionState {
  if (state === 'granted' || state === 'denied' || state === 'prompt') return state;
  return 'unknown';
}

/**
 * Reads the stored decision via the Permissions API. This is a *read*: it can
 * never open a prompt, so it is safe to call while rendering. We subscribe to
 * `change` so a user un-blocking the site from the address bar is reflected
 * without a reload.
 */
export async function probePermissionState(
  options: { cache?: boolean } = {},
): Promise<GeolocationPermissionState> {
  if (typeof navigator === 'undefined') return 'unknown';
  const perms = (navigator as unknown as {
    permissions?: { query?: (d: { name: string }) => Promise<{ state?: string; onchange?: (() => void) | null }> };
  }).permissions;
  if (!perms?.query) return 'unknown';
  const ticket = ++probeSequence;
  try {
    const status = await perms.query({ name: 'geolocation' });
    const state = normalizeState(status.state);
    if (options.cache === false) return state;
    // Permission decisions can flip while a query is in flight. If a newer probe
    // already answered, this slower response must not overwrite it.
    if (ticket !== probeSequence) return cachedPermissionState ?? state;
    cachedPermissionState = state;
    subscribeToPermissionChanges(status);
    return state;
  } catch {
    // Firefox rejects unknown names in some versions; Safari lacks the API.
    return 'unknown';
  }
}

function subscribeToPermissionChanges(
  status: { state?: string; onchange?: (() => void) | null },
): void {
  if (permissionChangeSubscribed) return;
  permissionChangeSubscribed = true;
  try {
    status.onchange = () => {
      cachedPermissionState = normalizeState(status.state);
    };
  } catch {
    permissionChangeSubscribed = false;
  }
}

/** The last observed decision, or `null` when we have never probed. */
export function getCachedPermissionState(): GeolocationPermissionState | null {
  return cachedPermissionState;
}

/**
 * Pure decision function - the whole anti-spam policy lives here, so tests can
 * exercise every branch without a browser.
 * Returns a result when the request must NOT reach navigator.geolocation.
 */
export function evaluateGeolocationGate(
  knownPermissionState: GeolocationPermissionState | null,
  runtime: { supported: boolean; secure: boolean },
  options: { force?: boolean } = {},
): GeolocationResult | null {
  if (!runtime.supported) {
    return {
      status: 'UNSUPPORTED',
      error: 'Geolocation is not supported by this browser',
      permissionState: 'unknown',
    };
  }
  if (!runtime.secure) {
    return {
      status: 'INSECURE',
      error: 'Geolocation requires a secure HTTPS connection',
      permissionState: knownPermissionState ?? 'unknown',
    };
  }
  if (knownPermissionState === 'denied' && !options.force) {
    return {
      status: 'DENIED',
      error: 'Location permission is blocked for this site in your browser settings',
      permissionState: 'denied',
      suppressedApiCall: true,
    };
  }
  return null;
}

function currentRuntime() {
  return { supported: isGeolocationSupported(), secure: isSecureGeolocationContext() };
}

function mapPositionError(
  error: GeolocationPositionError,
  permissionState: GeolocationPermissionState,
): GeolocationResult {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return {
        status: 'DENIED',
        error: 'Location permission was denied',
        permissionState,
      };
    case error.POSITION_UNAVAILABLE:
      return {
        status: 'UNAVAILABLE',
        error: 'Location information was unavailable',
        permissionState,
      };
    case error.TIMEOUT:
      return {
        status: 'TIMEOUT',
        error: 'Location request timed out',
        permissionState,
      };
    default:
      return {
        status: 'UNAVAILABLE',
        error: 'An unknown geolocation error occurred',
        permissionState,
      };
  }
}

function toFix(position: GeolocationPosition): GeoFix {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
    timestamp: typeof position.timestamp === 'number' ? position.timestamp : Date.now(),
  };
}

/**
 * One-shot position request. Call this ONLY from a user-initiated handler and
 * as the first thing in that handler: awaiting a permission probe first would
 * throw away the browser's "transient user activation", which is precisely the
 * pattern that gets prompts silently denied.
 */
export function getCurrentPosition(
  options: GeolocationRequestOptions = {},
): Promise<GeolocationResult> {
  return new Promise((resolve) => {
    const permissionState = cachedPermissionState ?? 'unknown';
    const gate = evaluateGeolocationGate(
      cachedPermissionState,
      currentRuntime(),
      options,
    );
    if (gate) {
      if (gate.suppressedApiCall) suppressedCalls += 1;
      // Refresh the probe for next time; never awaited, never blocks.
      if (gate.suppressedApiCall || cachedPermissionState === null) {
        void probePermissionState();
      }
      resolve(gate);
      return;
    }

    const runtime = geolocationRuntime();
    if (!runtime) {
      // Defensive: the gate already covers this.
      resolve({ status: 'UNSUPPORTED', error: 'Geolocation runtime disappeared', permissionState });
      return;
    }

    apiCalls += 1;
    runtime.getCurrentPosition(
      (position) => {
        const fix = toFix(position);
        cachedPermissionState = 'granted';
        void probePermissionState();
        resolve({
          status: 'SUCCESS',
          latitude: fix.latitude,
          longitude: fix.longitude,
          accuracy: fix.accuracy,
          permissionState: 'granted',
        });
      },
      (error) => {
        // A real API-level denial means the origin is blocked - cache it so the
        // next click short-circuits instead of hammering the permission system.
        if (error.code === error.PERMISSION_DENIED) cachedPermissionState = 'denied';
        resolve(mapPositionError(error, cachedPermissionState ?? permissionState));
      },
      {
        enableHighAccuracy:
          options.enableHighAccuracy ?? GEOLOCATION_DEFAULTS.enableHighAccuracy,
        timeout: options.timeoutMs ?? GEOLOCATION_DEFAULTS.timeoutMs,
        maximumAge: options.maximumAgeMs ?? GEOLOCATION_DEFAULTS.maximumAgeMs,
      },
    );
  });
}

/**
 * Continuous observation. Returns a `stop` function; callers MUST call it on
 * unmount / tracking stop / case completion. Prefer this over polling
 * getCurrentPosition(): the user makes ONE permission decision and the browser
 * keeps a single subscription, instead of a fresh permission check every 15s.
 *
 * Deliberately NO `timeout` by default. For a watch, the spec applies the
 * timeout to each individual acquisition, so a responder standing still (no new
 * fix within 10s) would fire TIMEOUT and tear the subscription down - tracking
 * would silently die in the middle of a live case. A caller that genuinely
 * wants a deadline can pass `timeoutMs` explicitly.
 */
export function watchPosition(
  onFix: (fix: GeoFix) => void,
  onError: (result: GeolocationResult) => void,
  options: GeolocationRequestOptions = {},
): () => void {
  const permissionState = cachedPermissionState ?? 'unknown';
  const gate = evaluateGeolocationGate(cachedPermissionState, currentRuntime(), options);
  if (gate) {
    if (gate.suppressedApiCall) suppressedCalls += 1;
    if (gate.suppressedApiCall || cachedPermissionState === null) void probePermissionState();
    // Report synchronously, then hand back an inert stop handle.
    onError(gate);
    return () => {};
  }

  const runtime = geolocationRuntime();
  if (!runtime) {
    onError({ status: 'UNSUPPORTED', error: 'Geolocation runtime unavailable', permissionState });
    return () => {};
  }

  apiCalls += 1;
  const watchId = runtime.watchPosition(
    (position) => {
      cachedPermissionState = 'granted';
      onFix(toFix(position));
    },
    (error) => {
      if (error.code === error.PERMISSION_DENIED) cachedPermissionState = 'denied';
      onError(mapPositionError(error, cachedPermissionState ?? permissionState));
    },
    {
      enableHighAccuracy:
        options.enableHighAccuracy ?? GEOLOCATION_DEFAULTS.enableHighAccuracy,
      maximumAge: options.maximumAgeMs ?? GEOLOCATION_DEFAULTS.maximumAgeMs,
      ...(options.timeoutMs ? { timeout: options.timeoutMs } : {}),
    },
  );

  let cleared = false;
  return () => {
    if (cleared) return;
    cleared = true;
    runtime.clearWatch(watchId);
  };
}

/** Number of navigator.geolocation invocations actually made. Test seam + demo diagnostic. */
export function geolocationCallStats(): {
  apiCalls: number;
  suppressedCalls: number;
  cachedPermissionState: GeolocationPermissionState | null;
} {
  return { apiCalls, suppressedCalls, cachedPermissionState };
}

/** Test/rehearsal helper: clears cached decision + counters. */
export function resetGeolocationRuntime(): void {
  apiCalls = 0;
  suppressedCalls = 0;
  cachedPermissionState = null;
  probeSequence = 0;
  permissionChangeSubscribed = false;
}
