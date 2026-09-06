/**
 * GEOLOCATION + MOBILE POLISH — automated verification
 *
 * Two kinds of proof, because the defect had two halves.
 *
 *  BEHAVIOURAL (§1-8): a fake navigator.geolocation / window is installed on
 *  globalThis and the real src/lib modules are driven through every branch.
 *  Call counters turn "no background permission request" into a measured fact
 *  instead of a code-reading claim.
 *
 *  STRUCTURAL (§9-12): the page sources are parsed. A React effect that reaches
 *  the Geolocation API is the exact mechanism that got this origin blocked, so
 *  the tests assert where geolocation may and may not appear. There is no
 *  browser driver in this repo, so component-level rules are checked against
 *  the source that renders them.
 *
 * Run: npx tsx scripts/geolocation-mobile-verify.ts
 */

import fs from 'node:fs';
import path from 'node:path';

import {
  evaluateGeolocationGate,
  getCachedPermissionState,
  getCurrentPosition,
  geolocationCallStats,
  isGeolocationSupported,
  isSecureGeolocationContext,
  probePermissionState,
  resetGeolocationRuntime,
  watchPosition,
} from '../src/lib/maps/geolocation';
import { PositionTracker } from '../src/lib/maps/positionTracker';
import {
  GEOLOCATION_STATUSES,
  GPS_UI_STATES,
  gpsButtonLabel,
  gpsHelpMessage,
  needsForcedRetry,
  shouldOfferGpsRetry,
  toGpsUiState,
  type GpsCopy,
} from '../src/lib/maps/geolocationUi';
import {
  SPLASH_MAX_TOTAL_MS,
  SPLASH_VIEWPORT_QUERY,
  shouldOfferSplash,
  splashTiming,
} from '../src/lib/ui/splashPolicy';
import { translations } from '../src/i18n/translations';

// ─── Runner ────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, label: string) {
  if (condition) {
    passed += 1;
    console.log(`  \u2713 ${label}`);
  } else {
    failed += 1;
    failures.push(label);
    console.log(`  \u2717 ${label}`);
  }
}

function section(title: string) {
  console.log(`\n\u2500\u2500 ${title} \u2500\u2500`);
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const ROOT = process.cwd();
const readSource = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/**
 * Removes line and block comments and nothing else, so "the code does X" is
 * told apart from "a comment mentions X". The comments in these files
 * deliberately narrate the removed bug, and a source scan that counted prose
 * would be worthless as a regression guard.
 */
function stripComments(src: string): string {
  let out = '';
  let i = 0;
  let mode: 'code' | 'line' | 'block' | 'sq' | 'dq' | 'tpl' = 'code';
  // Last non-space code character, used to tell a regex literal from division.
  let prev = '';
  const REGEX_CAN_START = "([,=:[!&|?{};+-*%<>~^";
  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];
    if (mode === 'code') {
      if (ch === '/' && REGEX_CAN_START.includes(prev) && next !== '/' && next !== '*') {
        // Regex literal: pass through verbatim (it may contain // or /*).
        let j = i + 1;
        let inClass = false;
        while (j < src.length) {
          const c = src[j];
          if (c === '\\') { j += 2; continue; }
          if (c === '\n') break;
          if (c === '[') inClass = true;
          else if (c === ']') inClass = false;
          else if (c === '/' && !inClass) break;
          j += 1;
        }
        out += src.slice(i, Math.min(j + 1, src.length));
        prev = '/';
        i = j + 1;
        continue;
      }
      if (ch === '/' && next === '/') { mode = 'line'; i += 2; continue; }
      if (ch === '/' && next === '*') { mode = 'block'; i += 2; continue; }
      if (ch === "'") mode = 'sq';
      else if (ch === '"') mode = 'dq';
      else if (ch === '`') mode = 'tpl';
      out += ch;
      if (!/\s/.test(ch)) prev = ch;
      i += 1;
      continue;
    }
    if (mode === 'line') {
      if (ch === '\n') { mode = 'code'; out += ch; }
      i += 1;
      continue;
    }
    if (mode === 'block') {
      if (ch === '*' && next === '/') { mode = 'code'; i += 2; continue; }
      if (ch === '\n') out += ch;
      i += 1;
      continue;
    }
    // inside a string literal: keep it, honour escapes
    if (ch === '\\') { out += ch + (next ?? ''); i += 2; continue; }
    if ((mode === 'sq' && ch === "'") || (mode === 'dq' && ch === '"') || (mode === 'tpl' && ch === '`')) {
      mode = 'code';
    }
    out += ch;
    i += 1;
  }
  return out;
}

function walkSources(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkSources(full, acc);
    else if (/\.tsx?$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

/**
 * Collects `useEffect(() => { ... }, [deps])` blocks. Deliberately simple: it
 * only matches the arrow form used across these pages, and the assertions only
 * care about what the bodies contain.
 */
function extractEffects(src: string): { body: string; deps: string }[] {
  const re = /useEffect\(\s*(?:async\s*)?\(\s*\)\s*=>\s*\{([\s\S]*?)\}\s*,\s*\[([^\]]*)\]\s*\)/g;
  const out: { body: string; deps: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) out.push({ body: m[1], deps: m[2] });
  return out;
}

// ═══════════════════════════════════════════════════════════
// FAKE BROWSER
// ═══════════════════════════════════════════════════════════
type FakeError = {
  code: number;
  message: string;
  PERMISSION_DENIED: number;
  POSITION_UNAVAILABLE: number;
  TIMEOUT: number;
};

const CODE = { PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 };

const api = { getCurrentPosition: 0, watchPosition: 0, clearWatch: 0, permissionsQuery: 0 };

let watchers: { id: number; onFix: (p: unknown) => void; onErr: (e: FakeError) => void }[] = [];
let nextWatchId = 1;
let gcpBehavior: 'success' | 'denied' | 'unavailable' | 'timeout' | 'silent' = 'success';
let storedPermission = 'prompt';
let geolocationPresent = true;
let secureContext = true;
let lastPermissionStatus: { state?: string; onchange?: (() => void) | null } | null = null;

/**
 * A real PermissionStatus reports the LIVE decision whenever `.state` is read,
 * not a snapshot frozen when query() was called. Copying `storedPermission` into
 * a plain field let a still-in-flight probe from an earlier block write a stale
 * 'denied' into the module cache after the next block had already re-set it.
 */
function makePermissionStatus(): { state?: string; onchange?: (() => void) | null } {
  return {
    get state() {
      return storedPermission;
    },
    // Writable so a test can flip the decision the way the address bar does
    // before firing `onchange`. ESM runs in strict mode, so a getter-only
    // accessor would throw on assignment.
    set state(value: string | undefined) {
      if (value) storedPermission = value;
    },
    onchange: null,
  };
}

function fakeError(code: number): FakeError {
  return { code, message: 'forced', ...CODE };
}

function makePosition(latitude: number, longitude: number, timestamp = Date.now()) {
  return { coords: { latitude, longitude, accuracy: 24 }, timestamp };
}

const realGeolocation = {
  getCurrentPosition: (success: (p: unknown) => void, error: (e: FakeError) => void) => {
    api.getCurrentPosition += 1;
    if (gcpBehavior === 'silent') return;
    if (gcpBehavior === 'success') return success(makePosition(24.9245, 67.0982));
    if (gcpBehavior === 'denied') return error(fakeError(CODE.PERMISSION_DENIED));
    if (gcpBehavior === 'unavailable') return error(fakeError(CODE.POSITION_UNAVAILABLE));
    return error(fakeError(CODE.TIMEOUT));
  },
  watchPosition: (success: (p: unknown) => void, error: (e: FakeError) => void) => {
    api.watchPosition += 1;
    const id = nextWatchId++;
    watchers.push({ id, onFix: success, onErr: error });
    return id;
  },
  clearWatch: (id: number) => {
    api.clearWatch += 1;
    watchers = watchers.filter((w) => w.id !== id);
  },
};

const navigatorFake: { userAgent: string; permissions: { query: (d: { name: string }) => Promise<unknown> }; geolocation?: unknown } = {
  userAgent: 'khidmatconnect-verify',
  permissions: {
    query: async (_desc: { name: string }) => {
      api.permissionsQuery += 1;
      lastPermissionStatus = makePermissionStatus();
      return lastPermissionStatus;
    },
  },
};

function installFakeBrowser() {
  navigatorFake.geolocation = realGeolocation;
  Object.defineProperty(globalThis, 'navigator', { value: navigatorFake, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'window', {
    value: {
      get isSecureContext() {
        return secureContext;
      },
      location: { protocol: 'https:', hostname: 'localhost' },
    },
    configurable: true,
    writable: true,
  });
  syncGeolocationPresence();
}

function syncGeolocationPresence() {
  const nav = globalThis.navigator as unknown as { geolocation?: unknown };
  if (geolocationPresent) nav.geolocation = realGeolocation;
  else delete nav.geolocation;
}

function reset(
  permission: string | null = null,
  opts: { behavior?: typeof gcpBehavior; supported?: boolean; secure?: boolean } = {},
) {
  resetGeolocationRuntime();
  if (permission) storedPermission = permission;
  gcpBehavior = opts.behavior ?? 'success';
  geolocationPresent = opts.supported ?? true;
  secureContext = opts.secure ?? true;
  watchers = [];
  api.getCurrentPosition = 0;
  api.watchPosition = 0;
  api.clearWatch = 0;
  api.permissionsQuery = 0;
  syncGeolocationPresence();
}

/**
 * The realistic starting point for every case: a fresh page load probes the
 * stored permission (a read), which is what fills the cache the gate uses.
 */
async function boot(
  permission: string | null = null,
  opts: { behavior?: typeof gcpBehavior; supported?: boolean; secure?: boolean } = {},
) {
  reset(permission, opts);
  await probePermissionState();
}

function fireWatchers(latitude: number, longitude: number, timestamp?: number) {
  for (const w of watchers) w.onFix(makePosition(latitude, longitude, timestamp ?? Date.now()));
}

installFakeBrowser();

const copy: GpsCopy = {
  defaultLabel: 'Default',
  loadingLabel: 'Loading',
  successLabel: 'Success',
  blocked: 'Blocked',
  unavailable: 'Unavailable',
  timeout: 'Timeout',
  unsupported: 'Unsupported',
  insecure: 'Insecure',
  tryAgain: 'Try Again',
};

async function main() {
  console.log('KhidmatConnect AI - geolocation + mobile polish verification');

  // ═════════════════════════════════════════════════════════
  section('1. The gate decides before the API is touched');
  // ═════════════════════════════════════════════════════════
  assert(evaluateGeolocationGate('denied', { supported: true, secure: true })?.status === 'DENIED', 'stored Block short-circuits to DENIED');
  assert(evaluateGeolocationGate('denied', { supported: true, secure: true })?.suppressedApiCall === true, 'DENIED is flagged as a suppressed API call');
  assert(evaluateGeolocationGate('denied', { supported: true, secure: true }, { force: true }) === null, 'an explicit Try Again is the only way past the denied gate');
  assert(evaluateGeolocationGate('granted', { supported: true, secure: true }) === null, 'granted proceeds');
  assert(evaluateGeolocationGate('prompt', { supported: true, secure: true }) === null, 'prompt proceeds (from a click only - enforced by the callers)');
  assert(evaluateGeolocationGate(null, { supported: true, secure: true }) === null, 'unknown proceeds (never assume Block)');
  assert(evaluateGeolocationGate('granted', { supported: true, secure: false })?.status === 'INSECURE', 'insecure origin returns INSECURE even when granted');
  assert(evaluateGeolocationGate(null, { supported: false, secure: true })?.status === 'UNSUPPORTED', 'missing API returns UNSUPPORTED');
  assert(evaluateGeolocationGate('denied', { supported: false, secure: false })?.status === 'UNSUPPORTED', 'capability is judged before permission state');

  // ═════════════════════════════════════════════════════════
  section('2. A blocked permission is respected, never hammered');
  // ═════════════════════════════════════════════════════════
  {
    await boot('denied');
    const before = api.getCurrentPosition;
    const results = [await getCurrentPosition(), await getCurrentPosition(), await getCurrentPosition()];
    assert(api.getCurrentPosition === before, 'three clicks against a blocked permission => zero navigator.geolocation calls');
    assert(results.every((r) => r.status === 'DENIED'), 'all three return a structured DENIED');
    assert(geolocationCallStats().suppressedCalls === 3, 'suppressions are counted, so the behaviour is provable');
  }
  {
    await boot('prompt', { behavior: 'denied' });
    const r1 = await getCurrentPosition();
    assert(r1.status === 'DENIED' && api.getCurrentPosition === 1, 'a real API denial costs exactly one call');
    assert(getCachedPermissionState() === 'denied', 'a real denial caches the denied state');
    storedPermission = 'denied';
    const r2 = await getCurrentPosition();
    assert(r2.status === 'DENIED' && api.getCurrentPosition === 1, 'the next click is suppressed by the cached denial');
  }
  {
    await boot('denied', { behavior: 'denied' });
    const r = await getCurrentPosition({ force: true });
    assert(r.status === 'DENIED' && api.getCurrentPosition === 1, 'Try Again makes exactly one real attempt');
    assert(r.suppressedApiCall !== true, 'a forced call is not reported as suppressed');
  }
  {
    // The address-bar un-block must heal without a page reload.
    await boot('denied');
    assert(getCachedPermissionState() === 'denied', 'the mount-time probe cached the Block decision');
    storedPermission = 'granted';
    gcpBehavior = 'success';
    lastPermissionStatus!.state = 'granted';
    lastPermissionStatus!.onchange?.();
    const r = await getCurrentPosition();
    assert(r.status === 'SUCCESS' && api.getCurrentPosition === 1, 'a permission change is picked up live (onchange), no reload');
  }
  {
    // Two probes in flight at once. The slower one answers with an OLDER
    // decision, so it must be discarded rather than rolling the cache backwards.
    reset('prompt');
    const queryReal = navigatorFake.permissions.query;
    const pending: Array<(value: unknown) => void> = [];
    let probeCalls = 0;
    navigatorFake.permissions.query = () => {
      probeCalls += 1;
      if (probeCalls === 1) return new Promise((resolve) => { pending.push(resolve); });
      return Promise.resolve(makePermissionStatus());
    };
    const staleProbe = probePermissionState();
    await sleep(0);
    storedPermission = 'granted';
    await probePermissionState();
    assert(getCachedPermissionState() === 'granted', 'the newest probe caches the fresh decision');
    pending.shift()!({ state: 'denied', onchange: null });
    const staleResult = await staleProbe;
    assert(getCachedPermissionState() === 'granted', 'a slower probe cannot roll the cached decision backwards');
    assert(staleResult === 'granted', 'a superseded probe reports the current decision, not its own stale read');
    navigatorFake.permissions.query = queryReal;
  }

  // ═════════════════════════════════════════════════════════
  section('3. Secure context and capability diagnostics');
  // ═════════════════════════════════════════════════════════
  {
    reset('granted', { secure: false });
    const before = api.getCurrentPosition;
    const r = await getCurrentPosition();
    assert(r.status === 'INSECURE', 'http:// returns a distinct INSECURE, not a fake DENIED');
    assert(api.getCurrentPosition === before, 'INSECURE never reaches the API');
    assert(isSecureGeolocationContext() === false, 'isSecureGeolocationContext() reads window.isSecureContext');
  }
  {
    reset('granted', { supported: false });
    const r = await getCurrentPosition();
    assert(r.status === 'UNSUPPORTED', 'a browser without geolocation returns UNSUPPORTED');
    assert(isGeolocationSupported() === false, 'isGeolocationSupported() reflects the runtime');
  }
  {
    reset('granted');
    const r = await getCurrentPosition();
    assert(r.status === 'SUCCESS' && r.latitude === 24.9245 && r.longitude === 67.0982, 'a granted click returns coordinates');
    assert(getCachedPermissionState() === 'granted', 'a success caches granted');
  }

  // ═════════════════════════════════════════════════════════
  section('4. Each API failure keeps its own status');
  // ═════════════════════════════════════════════════════════
  for (const [behavior, status] of [
    ['unavailable', 'UNAVAILABLE'],
    ['timeout', 'TIMEOUT'],
  ] as const) {
    reset('granted', { behavior });
    const r = await getCurrentPosition();
    assert(r.status === status, `${behavior} maps to ${status}`);
  }

  // ═════════════════════════════════════════════════════════
  section('5. The permission probe is a read, not a request');
  // ═════════════════════════════════════════════════════════
  {
    reset('prompt');
    const before = api.getCurrentPosition + api.watchPosition;
    const state = await probePermissionState();
    assert(state === 'prompt', 'the probe reports the stored decision');
    assert(api.getCurrentPosition + api.watchPosition === before, 'probing never calls the Geolocation API');
    assert(api.permissionsQuery >= 1, 'the Permissions API is what makes this prompt-free');
  }

  // ═════════════════════════════════════════════════════════
  section('6. watchPosition: one subscription, cleanly closed');
  // ═════════════════════════════════════════════════════════
  {
    reset('granted');
    const fixes: number[] = [];
    const errors: string[] = [];
    const stop = watchPosition((f) => fixes.push(f.latitude), (r) => errors.push(r.status));
    assert(api.watchPosition === 1, 'one watch opened');
    assert(api.getCurrentPosition === 0, 'watching never polls getCurrentPosition');
    fireWatchers(24.9, 67.1, 1000);
    fireWatchers(24.91, 67.11, 2000);
    assert(fixes.length === 2 && errors.length === 0, 'both fixes arrive on the same subscription');
    stop();
    assert(api.clearWatch === 1 && watchers.length === 0, 'stop() clears the watch');
    stop();
    assert(api.clearWatch === 1, 'stop() is idempotent (no double clear)');
  }
  {
    await boot('denied');
    const errors: string[] = [];
    const before = api.watchPosition;
    const stop = watchPosition(() => {}, (r) => errors.push(r.status));
    assert(api.watchPosition === before, 'a denied permission never opens a watch');
    assert(errors[0] === 'DENIED', 'the gate reports DENIED synchronously');
    stop();
    assert(true, 'the inert handle from a gated start is safe to call');
  }

  // ═════════════════════════════════════════════════════════
  section('7. PositionTracker - the responder\'s single owner');
  // ═════════════════════════════════════════════════════════
  {
    reset('granted');
    const seen: number[] = [];
    const brackets: boolean[] = [];
    const tracker = new PositionTracker({
      onFix: (f) => seen.push(f.latitude),
      onWatchingChange: (watching) => brackets.push(watching),
    });
    tracker.start();
    tracker.start();
    tracker.start();
    assert(api.watchPosition === 1, 'D. three start() calls still open exactly one watcher');
    assert(tracker.isWatching === true, 'the tracker knows it is watching');
    fireWatchers(24.7, 67.02, 5000);
    assert(seen.length === 1, 'each observation is forwarded once');
    assert(tracker.latestFix?.timestamp === 5000, 'the latest fix lives in the tracker, not in effect state');
    assert(tracker.consumeNewFix()?.timestamp === 5000, 'consumeNewFix yields the fresh fix');
    assert(tracker.consumeNewFix() === null, 'the same fix is never posted twice');
    fireWatchers(24.71, 67.03, 6000);
    assert(tracker.consumeNewFix()?.timestamp === 6000, 'a newer fix is consumable');
    tracker.stop();
    tracker.stop();
    assert(api.clearWatch === 1, 'E. stop() clears exactly once and is idempotent');
    assert(brackets[0] === true && brackets[brackets.length - 1] === false, 'watching-change brackets the session');
    assert(tracker.isWatching === false, 'the tracker is idle after stop');
  }
  {
    reset('granted');
    const tracker = new PositionTracker({ onFix: () => {} });
    tracker.stop();
    assert(api.watchPosition === 0 && api.clearWatch === 0, 'stopping before starting is a no-op');
  }
  {
    await boot('denied');
    const errors: string[] = [];
    const tracker = new PositionTracker({ onFix: () => {}, onError: (r) => errors.push(r.status) });
    tracker.start();
    assert(api.watchPosition === 0 && tracker.isWatching === false, 'a blocked responder never opens a watcher');
    assert(errors[0] === 'DENIED', 'the owner is told why, so the UI can explain');
    tracker.start();
    assert(errors.length === 2 && api.watchPosition === 0, 'C. repeated polls/renders keep the API untouched');
  }
  {
    // A dropped signal must not end live tracking. The dead subscription is
    // closed, exactly one bounded re-arm is scheduled, and nothing is reported
    // as terminal while a re-arm is still pending.
    reset('granted');
    const reconnections: { attempt: number; delayMs: number; status: string }[] = [];
    const terminal: string[] = [];
    const tracker = new PositionTracker(
      {
        onFix: () => {},
        onError: (r) => terminal.push(r.status),
        onReconnect: (i) => reconnections.push(i),
      },
      { reconnectBackoffMs: [10, 20, 30] },
    );
    tracker.start();
    for (const w of watchers) w.onErr(fakeError(CODE.POSITION_UNAVAILABLE));
    assert(api.clearWatch === 1, 'a transient failure closes the dead subscription');
    assert(api.watchPosition === 1, 'no second watcher is opened synchronously');
    assert(reconnections.length === 1 && reconnections[0].attempt === 1, 'exactly one re-arm is scheduled');
    assert(terminal.length === 0, 'a transient failure is not reported as terminal');
    assert(tracker.isWatching === true, 'the session stays live while a re-arm is pending');
    await sleep(40);
    assert(api.watchPosition === 2 && watchers.length === 1, 'the re-arm re-opens exactly ONE subscription');
    fireWatchers(24.8, 67.2, 7000);
    assert(tracker.consumeNewFix()?.timestamp === 7000, 'the recovered watcher delivers fixes again');
    tracker.stop();
    assert(api.clearWatch === 2 && tracker.isWatching === false, 'stop() after a reconnect leaves nothing running');
  }
  {
    // The re-arm budget is bounded, and a blocked permission is never retried
    // in the background - that is the spam this whole change exists to stop.
    reset('granted');
    const reconnections: number[] = [];
    const terminal: string[] = [];
    const tracker = new PositionTracker(
      {
        onFix: () => {},
        onError: (r) => terminal.push(r.status),
        onReconnect: (i) => reconnections.push(i.attempt),
      },
      { reconnectBackoffMs: [10, 20, 30] },
    );
    tracker.start();
    const fail = async () => {
      for (const w of watchers) w.onErr(fakeError(CODE.POSITION_UNAVAILABLE));
      await sleep(40);
    };
    await fail();
    await fail();
    await fail();
    assert(reconnections.length === 3 && api.watchPosition === 4, 'three failures re-arm three times');
    assert(watchers.length === 1, 'never more than one watcher alive at an instant');
    await fail();
    assert(terminal.length === 1 && reconnections.length === 3, 'a fourth failure gives up and tells the owner');
    assert(tracker.isWatching === false, 'giving up leaves the tracker idle, not half-alive');
    tracker.stop();

    await boot('denied');
    const deniedReconnects: number[] = [];
    const deniedTerminal: string[] = [];
    const blocked = new PositionTracker(
      { onFix: () => {}, onError: (r) => deniedTerminal.push(r.status), onReconnect: (i) => deniedReconnects.push(i.attempt) },
      { reconnectBackoffMs: [10] },
    );
    blocked.start();
    await sleep(60);
    assert(api.watchPosition === 0 && deniedReconnects.length === 0, 'a blocked permission never retries in the background');
    assert(deniedTerminal[0] === 'DENIED', 'and is reported once, terminally');
  }
  {
    // A successful fix resets the budget, so a long case survives many
    // independent short dropouts.
    reset('granted');
    let reconnects = 0;
    const tracker = new PositionTracker(
      { onFix: () => {}, onReconnect: () => { reconnects += 1; } },
      { reconnectBackoffMs: [10] },
    );
    tracker.start();
    for (let cycle = 0; cycle < 3; cycle += 1) {
      fireWatchers(24.5 + cycle, 67.0, 10_000 + cycle);
      for (const w of watchers) w.onErr(fakeError(CODE.TIMEOUT));
      await sleep(40);
    }
    assert(reconnects === 3 && api.watchPosition === 4, 'each dropout gets its own single retry after a good fix');
    tracker.stop();
  }
  {
    reset('granted');
    const tracker = new PositionTracker({ onFix: () => {} });
    tracker.start();
    fireWatchers(24.5, 67.0, 9000);
    tracker.reset();
    assert(tracker.latestFix === null && tracker.consumeNewFix() === null, 'reset() forgets the previous responder\'s coordinates');
    tracker.stop();
  }
  {
    reset('granted');
    const a = new PositionTracker({ onFix: () => {} });
    const b = new PositionTracker({ onFix: () => {} });
    a.start();
    b.start();
    assert(api.watchPosition === 2, 'two owners means two watchers - which is why each screen owns exactly one');
    a.stop();
    b.stop();
  }

  // ═════════════════════════════════════════════════════════
  section('8. UX mapping, spec copy, EN/UR parity');
  // ═════════════════════════════════════════════════════════
  const specCopy: Record<string, string> = {
    useMyLocation: 'Use My Current Location',
    gpsLocating: 'Getting your location\u2026',
    gpsDetected: 'Location detected',
    gpsBlockedHelp:
      'Location access is blocked. Enable location permission for KhidmatConnect or continue using an address / landmark.',
    gpsUnavailableHelp: "We couldn't detect your location. Please enter a nearby address or landmark.",
    gpsTimeoutHelp: 'Location detection timed out. Try again or continue using a landmark.',
    gpsUnsupportedHelp:
      'Your browser does not support location detection. Please enter a location manually.',
    gpsInsecureHelp: 'Location requires a secure HTTPS connection.',
    nearbyDetectPrompt: 'Use your location to find nearby help.',
    nearbyDetectButton: 'Detect My Location',
  };
  for (const [key, expected] of Object.entries(specCopy)) {
    assert((translations.en as Record<string, string>)[key] === expected, `EN copy matches the spec: ${key}`);
  }
  {
    const enKeys = Object.keys(translations.en);
    const urKeys = Object.keys(translations.ur);
    const missingInUr = enKeys.filter((k) => !urKeys.includes(k));
    const missingInEn = urKeys.filter((k) => !enKeys.includes(k));
    assert(missingInUr.length === 0, `every EN key exists in UR (${missingInUr.join(', ') || 'none missing'})`);
    assert(missingInEn.length === 0, `every UR key exists in EN (${missingInEn.join(', ') || 'none missing'})`);
  }
  {
    assert(GEOLOCATION_STATUSES.every((s) => toGpsUiState(s) !== undefined), 'every GeolocationStatus maps to a UI state');
    assert(GEOLOCATION_STATUSES.length === 6, 'the status union is fully enumerated');
    assert(toGpsUiState('DENIED') === 'blocked', 'DENIED reads as "blocked", not as a GPS failure');
    assert(toGpsUiState('INSECURE') === 'insecure', 'INSECURE has its own state');
    const wrong = GPS_UI_STATES.filter(
      (state) => (state === 'default' || state === 'loading' || state === 'success') === (gpsHelpMessage(state, copy) !== ''),
    );
    assert(wrong.length === 0, `happy states show no help text and every failure state does (${wrong.join(', ')})`);
    const blank = GPS_UI_STATES.filter((state) => gpsButtonLabel(state, copy) === '');
    assert(blank.length === 0, 'no state can render an empty button');
    assert(gpsButtonLabel('blocked', copy) === 'Default', 'a blocked state still shows an actionable label');
    assert(gpsButtonLabel('loading', copy) === 'Loading', 'the loading label replaces the button text');
    assert(shouldOfferGpsRetry('blocked') === true, 'blocked offers Try Again');
    assert(shouldOfferGpsRetry('timeout') === true && shouldOfferGpsRetry('unavailable') === true, 'transient failures offer Try Again');
    assert(shouldOfferGpsRetry('unsupported') === false && shouldOfferGpsRetry('insecure') === false, 'states the user cannot fix by tapping offer no retry');
    assert(needsForcedRetry('blocked', true) === true, 'a suppressed denial retries with force');
    assert(needsForcedRetry('blocked', false) === false, 'a genuine API denial is not re-forced blindly');
    assert(needsForcedRetry('timeout', true) === false, 'only denials need the forced path');
    const allCopy = Object.values(translations.en as unknown as Record<string, unknown>).filter((v): v is string => typeof v === 'string');
    const claims = allCopy.filter((text) => /we (will|have|can) (enable|turn on|grant)|automatically (enabl|grant|allow)/i.test(text));
    assert(claims.length === 0, `no string claims the app can turn the permission on (${claims.length} offenders)`);
    const urBlank = Object.entries(translations.ur as unknown as Record<string, unknown>)
      .filter(([k, v]) => typeof v === 'string' && (v as string).trim() === '')
      // A blank is only acceptable where English is blank on purpose.
      .filter(([k]) => (translations.en as Record<string, unknown>)[k] !== '');
    assert(urBlank.length === 0, `no Urdu string is missing where English has content (${urBlank.map(([k]) => k).join(', ')})`);
  }

  // ═════════════════════════════════════════════════════════
  section('9. Mobile opening screen policy');
  // ═════════════════════════════════════════════════════════
  assert(shouldOfferSplash({ isMobileViewport: false, alreadySeen: false }) === false, 'H. desktop never gets the opening screen');
  assert(shouldOfferSplash({ isMobileViewport: true, alreadySeen: false }) === true, 'a first mobile/tablet visit does');
  assert(shouldOfferSplash({ isMobileViewport: true, alreadySeen: true }) === false, 'never repeats inside the same session');
  assert(shouldOfferSplash({ isMobileViewport: false, alreadySeen: true }) === false, 'desktop stays clean regardless of history');
  assert(SPLASH_VIEWPORT_QUERY === '(max-width: 1023px)', 'the mobile boundary sits below the desktop breakpoint');
  {
    const normal = splashTiming(false);
    const reduced = splashTiming(true);
    assert(normal.totalMs >= 1300 && normal.totalMs <= 1700, `default run is ~1.5s (${normal.totalMs}ms)`);
    assert(normal.totalMs <= SPLASH_MAX_TOTAL_MS, `hard ceiling of ${SPLASH_MAX_TOTAL_MS}ms is honoured`);
    assert(reduced.totalMs < normal.totalMs, `prefers-reduced-motion is shorter (${reduced.totalMs}ms)`);
  }

  // ═════════════════════════════════════════════════════════
  section('10. Geolocation call-site census (source of truth)');
  // ═════════════════════════════════════════════════════════
  const GEO_API = /getCurrentPosition\s*\(|watchPosition\s*\(|navigator\s*\.\s*geolocation/;
  const allSources = walkSources(path.join(ROOT, 'src'));
  const census: { file: string; line: number; text: string }[] = [];
  for (const file of allSources) {
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    stripComments(fs.readFileSync(file, 'utf8'))
      .split('\n')
      .forEach((line, i) => {
        if (GEO_API.test(line)) census.push({ file: rel, line: i + 1, text: line.trim() });
      });
  }
  console.log('\n  remaining Geolocation API references in src/:');
  for (const site of census) console.log(`    ${site.file}:${site.line}  ${site.text.slice(0, 96)}`);
  console.log('');

  const censusFiles = [...new Set(census.map((s) => s.file))].sort();
  const expectedFiles = [
    'src/app/emergency/page.tsx',
    'src/app/nearby/page.tsx',
    'src/lib/maps/geolocation.ts',
    'src/lib/maps/positionTracker.ts',
  ];
  assert(
    JSON.stringify(censusFiles) === JSON.stringify(expectedFiles),
    `only the gate module, the tracker and the two click handlers touch geolocation (${censusFiles.join(', ')})`,
  );
  assert(!census.some((s) => s.file.startsWith('src/app/responder')), 'both responder screens are free of direct geolocation calls');
  assert(!census.some((s) => s.file !== 'src/lib/maps/geolocation.ts' && /navigator\s*\.\s*geolocation/.test(s.text)), 'only the gate module reads navigator.geolocation');

  const citizenPages = [
    'src/app/emergency/page.tsx',
    'src/app/nearby/page.tsx',
    'src/app/responder/page.tsx',
    'src/app/responder/cases/[caseId]/page.tsx',
  ];
  for (const page of citizenPages) {
    const effects = extractEffects(stripComments(readSource(page)));
    const offenders = effects.filter((e) => GEO_API.test(e.body));
    assert(offenders.length === 0, `A/B. ${page}: no React effect reaches the Geolocation API (${effects.length} effects scanned)`);
  }

  // ═════════════════════════════════════════════════════════
  section('11. Click-driven GPS on the citizen pages');
  // ═════════════════════════════════════════════════════════
  {
    const src = stripComments(readSource('src/app/emergency/page.tsx'));
    assert(/const handleGps = async \(force = false\)/.test(src), 'emergency keeps one click handler');
    assert(/onClick=\{\(\) => handleGps\(false\)\}/.test(src), 'A. the button is what requests GPS');
    assert(/onClick=\{\(\) => handleGps\(true\)\}/.test(src), 'Try Again uses the forced single retry');
    assert(!/onMount|useEffect\(\(\) => \{\s*getCurrentPosition/.test(src), 'no load-time request anywhere in the file');
    assert(/gpsUiState === 'loading'/.test(src) || /const gpsLoading = gpsUiState === 'loading'/.test(src), 'the loading state is derived from one state variable');
    assert(/if \(!location \|\| !message \|\| !primaryPhone\) return;/.test(src), 'F. submission needs text location + message + phone');
    assert(!/!geoCoords/.test(src), 'F. no submit path ever requires coordinates');
    assert(/locationText: location/.test(src), 'G. the typed address / landmark is what reaches the backend');
    assert(/value=\{location\}/.test(src) && /setLocation\(e\.target\.value\)/.test(src), 'G. the manual field stays editable in every GPS state');
    assert(/if \(geoCoords\) \{/.test(src), 'coordinates are attached only when they exist');
    assert(/role="status"/.test(src), 'screen readers hear the GPS outcome');
  }
  {
    const src = stripComments(readSource('src/app/nearby/page.tsx'));
    assert(/const handleDetectLocation = async \(force = false\)/.test(src), 'nearby keeps one click handler');
    assert(/onClick=\{\(\) => handleDetectLocation\(false\)\}/.test(src), 'B. Detect My Location is the only GPS entry point');
    assert(/onClick=\{\(\) => handleDetectLocation\(true\)\}/.test(src), 'its Try Again forces one attempt');
    assert(!/setUserLocation\(\{[^}]*24\.92/.test(src), 'no fake coordinates are injected when GPS is unavailable');
  }

  // ═════════════════════════════════════════════════════════
  section('12. Responder tracking design');
  // ═════════════════════════════════════════════════════════
  {
    const listPage = stripComments(readSource('src/app/responder/page.tsx'));
    const casePage = stripComments(readSource('src/app/responder/cases/[caseId]/page.tsx'));

    for (const [name, src] of [['/responder', listPage], ['/responder/cases/[caseId]', casePage]] as const) {
      assert((src.match(/new PositionTracker\(/g) ?? []).length === 1, `D. ${name}: exactly one tracker instance`);
      assert(/trackerRef\.current = new PositionTracker/.test(src), `D. ${name}: the tracker is held in a ref`);
      assert(/trackerRef\.current\?\.start\(/.test(src), `D. ${name}: sharing starts through the tracker`);
      assert(
        /useEffect\(\(\) => \(\) => trackerRef\.current\?\.stop\(\), \[\]\);/.test(src),
        `E. ${name}: unmount clears the watcher`,
      );
      const churny = extractEffects(src).filter(
        (e) => /tracker|report|Sharing/i.test(e.body) && /\b(data|apiAssignment|assignment)\b/.test(e.deps),
      );
      assert(churny.length === 0, `C. ${name}: no tracking effect depends on polled object state`);
      assert(!/setInterval\(\s*updateLocation/.test(src), `${name}: the getCurrentPosition poll is gone`);
      assert(!/getCurrentPosition/.test(src), `${name}: never polls a one-shot position`);
    }

    assert(/}, \[sharingRequested, activeAssignmentId\]\);/.test(listPage), 'C. list-page reporting is keyed on primitives');
    assert(/}, \[sharingRequested, trackedAssignmentId\]\);/.test(casePage), 'C. case-page reporting is keyed on primitives');
    assert(/const \[sharingRequested, setSharingRequested\] = useState\(false\)/.test(listPage), 'sharing starts closed and opens only on an action');
    assert(/startLocationSharing\(\);[\s\S]{0,400}newStatus: 'ACCEPTED'/.test(listPage), 'Accept consents to live sharing before the await');
    assert(/startLocationSharing\(\);[\s\S]{0,400}newStatus: 'EN_ROUTE'/.test(listPage), 'En Route consents to live sharing');
    assert(/if \(\['ACCEPTED', 'EN_ROUTE', 'ARRIVED'\]\.includes\(newStatus\)\) startLocationSharing\(\);/.test(casePage), 'case-page status actions consent to sharing');
    assert(/stopLocationSharing\(\);/.test(listPage) && /if \(newStatus === 'COMPLETED'\) stopLocationSharing\(\);/.test(casePage), 'E. completion stops sharing');
    assert(
      /data\.assignment\.status === 'COMPLETED'[\s\S]{0,400}trackerRef\.current\?\.stop\(\)/.test(listPage),
      'E. a completion seen by the poll also closes the watcher',
    );
    assert(/LOCATION_REPORT_INTERVAL_MS = 15_000/.test(listPage) && /LOCATION_REPORT_INTERVAL_MS = 15_000/.test(casePage), 'the existing 15s reporting interval is preserved');
    assert(/consumeNewFix\(\)/.test(listPage) && /consumeNewFix\(\)/.test(casePage), 'posts reuse the watched fix instead of re-asking the device');
    assert(/t\.sharingConsentNotice/.test(listPage) && /t\.sharingConsentNotice/.test(casePage), 'the consent notice explains when sharing is active');
    assert(/t\.gpsBlockedResponder/.test(listPage) && /t\.gpsBlockedResponder/.test(casePage), 'a blocked responder is told how to un-block');
    assert(/t\.startLocationSharing/.test(listPage) && /t\.startLocationSharing/.test(casePage), 'an explicit Start Location Sharing control exists');
  }

  // ═════════════════════════════════════════════════════════
  section('13. Splash mounting + hero spacing');
  // ═════════════════════════════════════════════════════════
  {
    const home = readSource('src/app/page.tsx');
    const layout = readSource('src/app/layout.tsx');
    const src = readSource('src/components/AppSplash.tsx');
    const importers = allSources
      .filter((f) => {
        const rel = path.relative(ROOT, f).split(path.sep).join('/');
        return rel !== 'src/components/AppSplash.tsx' && /AppSplash/.test(fs.readFileSync(f, 'utf8'));
      })
      .map((f) => path.relative(ROOT, f).split(path.sep).join('/'));

    assert(/import AppSplash from '@\/components\/AppSplash'/.test(home), 'H. only the homepage mounts the opening screen');
    assert(JSON.stringify(importers.sort()) === JSON.stringify(['src/app/page.tsx']), `I. importers of AppSplash are exactly the homepage (${importers.join(', ')})`);
    assert(!/AppSplash/.test(layout), 'I. the root layout never mounts it, so no deep link can be blocked');
    for (const route of ['src/app/case/[caseId]/page.tsx', 'src/app/operator/page.tsx', 'src/app/responder/page.tsx', 'src/app/emergency/page.tsx']) {
      assert(!/AppSplash/.test(readSource(route)), `I. ${route} renders no splash`);
    }
    assert(/if \(!showing\) return null;/.test(src), 'H. nothing renders until the mobile gate passes (no SSR or desktop paint)');
    assert(/fixed inset-0 z-\[100\]/.test(src), 'the overlay floats above the page, so it cannot shift layout');
    assert(/onClick=\{dismiss\}/.test(src), 'a tap skips it - nobody is ever stuck behind the brand');
    assert(/prefers-reduced-motion/.test(src), 'reduced motion is respected at both the gate and the timers');
    assert(!/serviceWorker|register\(|Play Store|App Store|install|native app|Add to Home/i.test(src), 'it never claims to be a native app');
    assert(/t\.brand/.test(src) && /t\.appSplashTagline/.test(src), 'brand and humanitarian tagline come from i18n');
    assert(/#3FB950/.test(src) && /#0B0E14/.test(src), 'existing dark branding with the green accent');

    assert(/px-4 pt-8 pb-5 sm:px-6 md:pb-8/.test(home), 'Part 7: hero container has 20px mobile / 32px desktop breathing room');
    assert(!/pt-8 pb-1[0-9]|pt-8 pb-2/.test(home), 'Part 7: the hero was not made unnecessarily tall');
    assert(/noLoginRequired/.test(home), 'the zero-friction line is still the last hero element');
    assert(/bg-dot-pattern/.test(home), 'the dot-pattern edge it clears is still the visual boundary');

    const globals = readSource('src/app/globals.css');
    assert(/\.splash-bar/.test(globals) && /animation: shimmer/.test(globals), 'the loading affordance reuses the existing shimmer keyframe');
  }

  // ═════════════════════════════════════════════════════════
  section('14. Untouched surfaces (safety)');
  // ═════════════════════════════════════════════════════════
  {
    const config = readSource('next.config.ts');
    assert(!/Permissions-Policy|geolocation=/.test(config), 'no Permissions-Policy was added (the header is not the cause)');
    const intake = readSource('src/app/api/emergency-cases/route.ts');
    assert(/locationText/.test(intake), 'the emergency intake contract is unchanged');
    assert(!fs.existsSync(path.join(ROOT, 'middleware.ts')), 'no middleware was introduced');
    const voiceFiles = walkSources(path.join(ROOT, 'src', 'lib', 'voice'));
    assert(voiceFiles.length > 0, 'voice modules still exist untouched (retell/twilio out of scope)');
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`passed: ${passed}   failed: ${failed}`);
  if (failed > 0) {
    console.log('\nFAILURES:');
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  } else {
    console.log('all geolocation + mobile polish checks passed');
  }
}

main().catch((error) => {
  console.error('\nverification crashed:', error);
  process.exitCode = 1;
});
