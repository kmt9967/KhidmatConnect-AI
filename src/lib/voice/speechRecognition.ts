/**
 * Browser speech-to-text (Web Speech API) for emergency dictation — M17.
 *
 * BROWSER-ONLY module (like src/lib/maps/geolocation.ts). It adds a REAL
 * microphone dictation affordance to the /emergency form. It is an INPUT
 * CONVENIENCE ONLY and is deliberately walled off from everything critical:
 *
 *   • It never submits the form, never creates a case, never triggers dispatch.
 *   • It only ever APPENDS recognized text to the message the user can edit.
 *   • Nothing here runs on page mount — recognition starts ONLY from an
 *     explicit user click, and stops on user stop / final error / unmount.
 *   • If the Web Speech API is unavailable (Firefox/Safari/older browsers) or
 *     permission is denied, we surface a clear NON-BLOCKING message and the
 *     form keeps working exactly as before. Typing is never affected.
 *
 * The pure decision helpers (support/secure gate, error mapping, language
 * selection, transcript append) are exported separately so they can be unit
 * tested offline without a browser (scripts/m17-browser-voice-verify.ts).
 */

// ─── Minimal Web Speech API typings (not in TS lib.dom) ─────

export interface SpeechAlternative {
  transcript: string;
  confidence: number;
}

export interface SpeechResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechAlternative;
}

export interface SpeechResultEventLike {
  resultIndex: number;
  results: { length: number; [index: number]: SpeechResultLike };
}

export interface SpeechErrorEventLike {
  error: string;
  message?: string;
}

/** The subset of SpeechRecognition we use — kept narrow on purpose. */
export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechResultEventLike) => void) | null;
  onerror: ((event: SpeechErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

export type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

// ─── UI-facing state model ─────────────────────────────────

/** Lifecycle the mic button renders from. `starting` covers the permission prompt. */
export type SpeechPhase = 'idle' | 'starting' | 'listening';

/**
 * Non-blocking notice kinds. Each maps to citizen-safe copy; `null` clears it.
 * `unsupported` is the "this browser can't do voice typing" case.
 */
export type SpeechNotice =
  | 'unsupported'
  | 'insecure'
  | 'denied'
  | 'no-mic'
  | 'network'
  | 'no-speech'
  | 'error'
  | null;

// ─── Pure helpers (offline-testable) ───────────────────────

/**
 * Locate the browser's SpeechRecognition constructor (standard or the
 * `webkit`-prefixed one Chrome/Edge/Safari expose). Returns null when absent.
 * Accepts an injectable global so tests can simulate any browser.
 */
export function getSpeechRecognitionCtor(
  globalObj: unknown = typeof window !== 'undefined' ? window : undefined,
): SpeechRecognitionCtor | null {
  if (!globalObj || typeof globalObj !== 'object') return null;
  const w = globalObj as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  const ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return typeof ctor === 'function' ? (ctor as SpeechRecognitionCtor) : null;
}

export function isSpeechRecognitionSupported(
  globalObj: unknown = typeof window !== 'undefined' ? window : undefined,
): boolean {
  return getSpeechRecognitionCtor(globalObj) !== null;
}

/** True when served over HTTPS or a localhost dev origin (mic requires it). */
export function isSecureSpeechContext(
  globalObj: unknown = typeof window !== 'undefined' ? window : undefined,
): boolean {
  if (!globalObj || typeof globalObj !== 'object') return false;
  const w = globalObj as { isSecureContext?: boolean; location?: { protocol?: string; hostname?: string } };
  if (typeof w.isSecureContext === 'boolean') return w.isSecureContext;
  const host = w.location?.hostname ?? '';
  return w.location?.protocol === 'https:' || host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

/**
 * Pure gate: decide whether recognition may start. Returns a blocking notice
 * when it must NOT, or null when it is safe to proceed. Mirrors the
 * geolocation gate so every branch is testable without a browser.
 */
export function evaluateSpeechGate(runtime: { supported: boolean; secure: boolean }): SpeechNotice {
  if (!runtime.supported) return 'unsupported';
  if (!runtime.secure) return 'insecure';
  return null;
}

/**
 * Map a Web Speech `onerror` code onto our notice vocabulary. Unknown codes
 * fall back to the generic `error` notice (never a crash, never a silent fail).
 * A user abort maps to null (not an error worth alarming the citizen about).
 */
export function mapSpeechErrorToNotice(code: string | undefined | null): SpeechNotice {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'denied';
    case 'audio-capture':
      return 'no-mic';
    case 'network':
      return 'network';
    case 'no-speech':
      return 'no-speech';
    case 'aborted':
      return null;
    default:
      return 'error';
  }
}

/**
 * BCP-47 tag for the recognition engine from the app's UI language. The Web
 * Speech API recognizes ONE language at a time; there is no true mixed mode, so
 * mixed Urdu-English relies on the provider's code-switch tolerance within the
 * selected tag (documented limitation). Urdu → ur-PK, otherwise en-US.
 */
export function speechLangForLanguage(lang: string | undefined | null): string {
  return (lang ?? '').toLowerCase().startsWith('ur') ? 'ur-PK' : 'en-US';
}

/**
 * Append recognized speech to the existing message WITHOUT inventing content:
 *  • empty/whitespace additions change nothing;
 *  • a space joins existing text and the addition;
 *  • the result is trimmed and never exceeds `maxLength` (kept in sync with the
 *    form's own limit so dictation can't overflow the field).
 * Raw recognized words are used verbatim — we do not "correct" or expand them.
 */
export function appendTranscript(existing: string, addition: string, maxLength = 2000): string {
  const add = (addition ?? '').trim();
  if (!add) return existing ?? '';
  const base = (existing ?? '').trimEnd();
  const joined = base ? `${base} ${add}` : add;
  return joined.length > maxLength ? joined.slice(0, maxLength) : joined;
}

// ─── Browser controller (not unit-tested; robust by construction) ───

export interface SpeechDictationCallbacks {
  onPhaseChange: (phase: SpeechPhase) => void;
  onNotice: (notice: SpeechNotice) => void;
  /** Finalized phrase — the caller appends it to the editable message. */
  onFinalTranscript: (text: string) => void;
  /** Live partial phrase — optional preview; callers may ignore it. */
  onInterimTranscript?: (text: string) => void;
}

/**
 * Thin, defensive wrapper around one SpeechRecognition instance. Starts only on
 * an explicit user action; stops cleanly on stop()/error/end; and is safe to
 * destroy on unmount. It NEVER auto-restarts, so there is no background
 * recording after the browser ends a phrase.
 */
export class SpeechDictationController {
  private recognition: SpeechRecognitionLike | null = null;
  private userStopped = false;
  private active = false;

  constructor(
    private readonly callbacks: SpeechDictationCallbacks,
    private readonly options: { lang: string; globalObj?: unknown } = { lang: 'en-US' },
  ) {}

  get isActive(): boolean {
    return this.active;
  }

  /** Attempt to start listening. Returns false (with a notice) if gated. */
  start(): boolean {
    if (this.active) return true;

    const globalObj = this.options.globalObj ?? (typeof window !== 'undefined' ? window : undefined);
    const gate = evaluateSpeechGate({
      supported: isSpeechRecognitionSupported(globalObj),
      secure: isSecureSpeechContext(globalObj),
    });
    if (gate) {
      this.callbacks.onNotice(gate);
      this.callbacks.onPhaseChange('idle');
      return false;
    }

    const Ctor = getSpeechRecognitionCtor(globalObj);
    if (!Ctor) {
      this.callbacks.onNotice('unsupported');
      return false;
    }

    let recognition: SpeechRecognitionLike;
    try {
      recognition = new Ctor();
    } catch {
      this.callbacks.onNotice('error');
      return false;
    }

    recognition.lang = this.options.lang;
    recognition.continuous = true; // listen across sentences until the user stops
    recognition.interimResults = true; // show live partial text
    recognition.maxAlternatives = 1;

    this.userStopped = false;
    this.recognition = recognition;
    this.callbacks.onPhaseChange('starting');

    recognition.onstart = () => {
      this.active = true;
      this.callbacks.onPhaseChange('listening');
      this.callbacks.onNotice(null);
    };

    recognition.onresult = (event: SpeechResultEventLike) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result?.[0]?.transcript ?? '';
        if (!text) continue;
        if (result.isFinal) {
          this.callbacks.onFinalTranscript(text.trim());
        } else {
          interim += text;
        }
      }
      if (interim) this.callbacks.onInterimTranscript?.(interim);
    };

    recognition.onerror = (event: SpeechErrorEventLike) => {
      const notice = mapSpeechErrorToNotice(event?.error);
      if (notice) this.callbacks.onNotice(notice);
      this.teardown();
      this.callbacks.onPhaseChange('idle');
    };

    recognition.onend = () => {
      // Browser ended the phrase/session. We never auto-restart (no background
      // recording); return to idle so the user can tap again if they want more.
      this.teardown();
      this.callbacks.onPhaseChange('idle');
    };

    try {
      recognition.start();
      return true;
    } catch {
      // start() throws if already started or if the engine refuses; treat as a
      // generic, non-blocking error and keep the form usable.
      this.teardown();
      this.callbacks.onNotice('error');
      this.callbacks.onPhaseChange('idle');
      return false;
    }
  }

  /** User-initiated stop. Safe to call when not listening. */
  stop(): void {
    this.userStopped = true;
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        /* ignore — teardown below clears state regardless */
      }
    }
    this.teardown();
    this.callbacks.onPhaseChange('idle');
  }

  /** Unmount cleanup — abort without emitting further callbacks. */
  destroy(): void {
    this.userStopped = true;
    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch {
        /* ignore */
      }
    }
    this.teardown();
  }

  private teardown(): void {
    if (this.recognition) {
      this.recognition.onresult = null;
      this.recognition.onerror = null;
      this.recognition.onend = null;
      this.recognition.onstart = null;
    }
    this.recognition = null;
    this.active = false;
  }

  /** Exposed for tests/diagnostics: whether the last stop was user-driven. */
  get wasUserStopped(): boolean {
    return this.userStopped;
  }
}
