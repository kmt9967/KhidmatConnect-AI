/**
 * A single-owner live position subscription for responder tracking.
 *
 * Why this exists: the responder screens used to poll
 * `getCurrentPosition()` from a `setInterval` whose React effect depended on
 * the *polled assignment object*. Every 10s API refresh produced a new object
 * identity, which tore down and re-created the effect, which fired a fresh
 * browser permission request - with no user action involved at all. That is the
 * background request spam that got this origin blocked in Chrome.
 *
 * The contract this class enforces:
 *  - at most ONE `watchPosition` subscription alive at any instant (start() is
 *    idempotent and re-entrant safe; a reconnect closes the old handle first);
 *  - `start()` must be called from a user-initiated action (Accept / En Route /
 *    "Start Location Sharing"); polling must never call it;
 *  - the reporting interval reads `consumeNewFix()` instead of touching the
 *    Geolocation API, so posting coordinates costs zero permission requests;
 *  - `stop()` clears the watch exactly once and is safe to call repeatedly;
 *  - a transient GPS failure (no signal / timeout) is retried on a BOUNDED
 *    backoff for as long as the responder still wants sharing, so tracking does
 *    not die quietly mid-case. A blocked permission is terminal: retrying it in
 *    the background is precisely the spam that must never come back.
 */

import { watchPosition } from './geolocation';
import type { GeoFix, GeolocationResult, GeolocationStatus } from './types';

export interface PositionTrackerCallbacks {
  onFix: (fix: GeoFix) => void;
  /** A terminal failure. The watcher is stopped already and will not retry. */
  onError?: (result: GeolocationResult) => void;
  onWatchingChange?: (watching: boolean) => void;
  /** A transient failure that is being re-armed automatically. */
  onReconnect?: (info: { attempt: number; delayMs: number; status: GeolocationStatus }) => void;
}

export interface PositionTrackerConfig {
  /** Delays between automatic re-arms. Its length is the retry budget. */
  reconnectBackoffMs?: readonly number[];
}

/** Statuses the user cannot be expected to fix by tapping again. Never retried. */
const TERMINAL_STATUSES: readonly GeolocationStatus[] = ['DENIED', 'UNSUPPORTED', 'INSECURE'];
/** Defaults: 5s, 15s, 30s - then give up and hand control back to the responder. */
const DEFAULT_BACKOFF: readonly number[] = [5_000, 15_000, 30_000];

export class PositionTracker {
  private stopFn: (() => void) | null = null;
  private starting = false;
  private wanted = false;
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private lastOptions: { force?: boolean } = {};
  private lastFix: GeoFix | null = null;
  private lastReportedAt = Number.NEGATIVE_INFINITY;
  private readonly backoff: readonly number[];

  constructor(
    private readonly callbacks: PositionTrackerCallbacks,
    config: PositionTrackerConfig = {},
  ) {
    this.backoff = config.reconnectBackoffMs ?? DEFAULT_BACKOFF;
  }

  /** True while a subscription is alive OR a re-arm is pending. */
  get isWatching(): boolean {
    return this.stopFn !== null || this.retryTimer !== null;
  }

  get latestFix(): GeoFix | null {
    return this.lastFix;
  }

  /**
   * Begin (or keep) the single subscription. Pass `force: true` only for an
   * explicit user retry after a blocked permission.
   */
  start(options: { force?: boolean } = {}): void {
    this.wanted = true;
    this.lastOptions = options;
    // An explicit user action is a fresh budget, and it supersedes any pending
    // automatic re-arm so two opens can never race.
    this.attempt = 0;
    this.clearRetryTimer();
    if (this.stopFn !== null || this.starting) return;
    this.open();
  }

  /** Stop the subscription. Always safe; never throws when already stopped. */
  stop(): void {
    this.wanted = false;
    this.attempt = 0;
    this.clearRetryTimer();
    const stop = this.stopFn;
    this.stopFn = null;
    if (stop) {
      stop();
      this.callbacks.onWatchingChange?.(false);
    }
  }

  /**
   * Return the newest fix only if it has not already been reported. This is how
   * the tracking interval pushes coordinates without ever asking the browser
   * for a new position.
   */
  consumeNewFix(): GeoFix | null {
    const fix = this.lastFix;
    if (!fix || fix.timestamp <= this.lastReportedAt) return null;
    this.lastReportedAt = fix.timestamp;
    return fix;
  }

  /** Forget the cached fix (e.g. when a new assignment takes over). */
  reset(): void {
    this.lastFix = null;
    this.lastReportedAt = Number.NEGATIVE_INFINITY;
  }

  // ─── internals ───────────────────────────────────────────

  private open(): void {
    this.starting = true;

    // Object holder, because TypeScript's narrowing would otherwise forget that
    // the callback below can assign to it synchronously.
    const gate = { rejection: null as GeolocationResult | null };

    const stop = watchPosition(
      (fix) => {
        // A delivered observation proves the subscription is healthy again.
        this.attempt = 0;
        this.lastFix = fix;
        this.callbacks.onFix(fix);
      },
      (result) => {
        if (this.starting) {
          // Synchronous rejection: the API was never called (blocked permission,
          // insecure context or unsupported browser).
          gate.rejection = result;
          return;
        }
        this.handleFailure(result);
      },
      this.lastOptions,
    );

    this.starting = false;

    if (gate.rejection) {
      this.handleFailure(gate.rejection);
      return;
    }

    this.stopFn = stop;
    this.callbacks.onWatchingChange?.(true);
  }

  private handleFailure(result: GeolocationResult): void {
    const hadSubscription = this.stopFn !== null;
    const stop = this.stopFn;
    this.stopFn = null;
    if (stop) stop();

    const terminal =
      TERMINAL_STATUSES.includes(result.status) || !this.wanted || this.attempt >= this.backoff.length;

    if (!terminal) {
      const delayMs = this.backoff[this.attempt];
      this.attempt += 1;
      // onWatchingChange deliberately stays `true`: the responder still wants
      // sharing and the subscription is coming back. Only the label changes.
      this.callbacks.onReconnect?.({ attempt: this.attempt, delayMs, status: result.status });
      this.clearRetryTimer();
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        if (this.wanted && this.stopFn === null && !this.starting) this.open();
      }, delayMs);
      return;
    }

    this.attempt = 0;
    if (hadSubscription) this.callbacks.onWatchingChange?.(false);
    this.callbacks.onError?.(result);
  }

  private clearRetryTimer(): void {
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }
}
