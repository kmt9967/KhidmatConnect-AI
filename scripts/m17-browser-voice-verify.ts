/**
 * M17 — BROWSER VOICE + EMERGENCY DICTATION verification.
 *
 * Deterministic, offline (no DB, no network, no browser). Two kinds of proof,
 * mirroring scripts/geolocation-mobile-verify.ts:
 *
 *  BEHAVIOURAL: the real src/lib modules are driven through every branch. A
 *  fake SpeechRecognition and fake window are injected so the dictation
 *  controller's lifecycle (start → listening → transcript → stop/destroy →
 *  error/end) is measured, not asserted by reading code. The server web-call
 *  helpers (config gate, public-payload reduction, analysis mapping, rate
 *  limiter) are exercised directly.
 *
 *  STRUCTURAL: the page/route sources are parsed (comments stripped, so prose
 *  is told apart from code) to prove the security + safety invariants:
 *   • the permanent RETELL_API_KEY / process.env never appear in client code;
 *   • the browser SDK is loaded with a dynamic import and the real events are
 *     wired (call_started / call_ended / agent_* / error);
 *   • the dead-mic fix is present and dictation never auto-submits;
 *   • no false-dispatch wording, and the safe note + fallback copy exist.
 *
 * Run: npx tsx scripts/m17-browser-voice-verify.ts
 */

import fs from 'node:fs';
import path from 'node:path';

import { loadEnvLocal } from './lib/env';
import {
  evaluateSpeechGate,
  isSpeechRecognitionSupported,
  isSecureSpeechContext,
  mapSpeechErrorToNotice,
  speechLangForLanguage,
  appendTranscript,
  SpeechDictationController,
  type SpeechPhase,
  type SpeechNotice,
} from '../src/lib/voice/speechRecognition';
import {
  getWebCallConfig,
  isWebCallConfigured,
  toPublicWebCall,
  mapAnalysisStatus,
  rateLimitWebCall,
  resetWebCallRateLimiter,
} from '../src/lib/voice/retellWebCall';
import { translations } from '../src/i18n/translations';

loadEnvLocal();

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

const ROOT = process.cwd();
const readSource = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** Remove // and /* *\/ comments but KEEP string-literal contents, so a
 *  forbidden phrase inside user-facing copy is still caught while the same
 *  phrase inside an explanatory comment is not. */
function stripComments(src: string): string {
  let out = '';
  let i = 0;
  let mode: 'code' | 'line' | 'block' | 'sq' | 'dq' | 'tpl' = 'code';
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (mode === 'code') {
      if (c === '/' && n === '/') { mode = 'line'; i += 2; continue; }
      if (c === '/' && n === '*') { mode = 'block'; i += 2; continue; }
      if (c === "'") { mode = 'sq'; out += c; i++; continue; }
      if (c === '"') { mode = 'dq'; out += c; i++; continue; }
      if (c === '`') { mode = 'tpl'; out += c; i++; continue; }
      out += c; i++; continue;
    }
    if (mode === 'line') { if (c === '\n') { mode = 'code'; out += c; } i++; continue; }
    if (mode === 'block') { if (c === '*' && n === '/') { mode = 'code'; i += 2; continue; } i++; continue; }
    if (mode === 'sq') { out += c; if (c === '\\') { out += n; i += 2; continue; } if (c === "'") mode = 'code'; i++; continue; }
    if (mode === 'dq') { out += c; if (c === '\\') { out += n; i += 2; continue; } if (c === '"') mode = 'code'; i++; continue; }
    if (mode === 'tpl') { out += c; if (c === '\\') { out += n; i += 2; continue; } if (c === '`') mode = 'code'; i++; continue; }
  }
  return out;
}

// ─── Fake Web Speech recognition (behavioural driver) ──────
const instances: FakeSR[] = [];

class FakeSR {
  lang = '';
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  // Loose handler types on purpose: this is a runtime stand-in for the browser
  // engine, and scripts/ is excluded from tsc. Shape matters, not variance.
  onresult: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  onend: (() => void) | null = null;
  onstart: (() => void) | null = null;
  startCount = 0;
  stopCount = 0;
  abortCount = 0;
  constructor() {
    instances.push(this);
  }
  start() { this.startCount++; }
  stop() { this.stopCount++; }
  abort() { this.abortCount++; }
}

const lastSR = () => instances[instances.length - 1];

function finalResultEvent(transcript: string) {
  return {
    resultIndex: 0,
    results: { length: 1, 0: { isFinal: true, length: 1, 0: { transcript, confidence: 0.93 } } },
  };
}

function interimResultEvent(transcript: string) {
  return {
    resultIndex: 0,
    results: { length: 1, 0: { isFinal: false, length: 1, 0: { transcript, confidence: 0.4 } } },
  };
}

const secureGlobal = () => ({ SpeechRecognition: FakeSR, isSecureContext: true });

// ═══ §1 — Emergency mic: pure gates & helpers ══════════════
section('1. Speech gate / error mapping / language / transcript append (pure)');
{
  assert(evaluateSpeechGate({ supported: false, secure: true }) === 'unsupported', 'unsupported browser → "unsupported"');
  assert(evaluateSpeechGate({ supported: true, secure: false }) === 'insecure', 'insecure origin → "insecure"');
  assert(evaluateSpeechGate({ supported: false, secure: false }) === 'unsupported', 'support checked before secure');
  assert(evaluateSpeechGate({ supported: true, secure: true }) === null, 'supported + secure → no block (null)');

  assert(mapSpeechErrorToNotice('not-allowed') === 'denied', 'not-allowed → denied');
  assert(mapSpeechErrorToNotice('service-not-allowed') === 'denied', 'service-not-allowed → denied');
  assert(mapSpeechErrorToNotice('audio-capture') === 'no-mic', 'audio-capture → no-mic');
  assert(mapSpeechErrorToNotice('network') === 'network', 'network → network');
  assert(mapSpeechErrorToNotice('no-speech') === 'no-speech', 'no-speech → no-speech');
  assert(mapSpeechErrorToNotice('aborted') === null, 'user abort → null (not alarming)');
  assert(mapSpeechErrorToNotice('something-new') === 'error', 'unknown code → generic error');
  assert(mapSpeechErrorToNotice(undefined) === 'error', 'missing code → generic error');

  assert(speechLangForLanguage('ur') === 'ur-PK', 'ur → ur-PK');
  assert(speechLangForLanguage('ur-PK') === 'ur-PK', 'ur-PK → ur-PK');
  assert(speechLangForLanguage('UR') === 'ur-PK', 'case-insensitive UR → ur-PK');
  assert(speechLangForLanguage('en') === 'en-US', 'en → en-US');
  assert(speechLangForLanguage(undefined) === 'en-US', 'undefined → en-US (safe default)');

  assert(appendTranscript('Hello', 'world') === 'Hello world', 'append joins with a space');
  assert(appendTranscript('', 'world') === 'world', 'append onto empty = addition only');
  assert(appendTranscript('Hello', '   ') === 'Hello', 'blank addition changes nothing (no invention)');
  assert(appendTranscript('a', 'b') === 'a b', 'recognized words used verbatim');
  const capped = appendTranscript('Hello', 'world', 8);
  assert(capped === 'Hello wo' && capped.length === 8, 'append never exceeds maxLength');
}

// ═══ §2 — Support / secure detection with fake window ══════
section('2. Runtime detection against injected globals');
{
  assert(isSpeechRecognitionSupported({ SpeechRecognition: FakeSR }) === true, 'standard SpeechRecognition detected');
  assert(isSpeechRecognitionSupported({ webkitSpeechRecognition: FakeSR }) === true, 'webkit-prefixed detected');
  assert(isSpeechRecognitionSupported({}) === false, 'no ctor → unsupported');
  assert(isSpeechRecognitionSupported(undefined) === false, 'undefined global → unsupported (SSR-safe)');

  assert(isSecureSpeechContext({ isSecureContext: true }) === true, 'isSecureContext true honoured');
  assert(isSecureSpeechContext({ isSecureContext: false }) === false, 'isSecureContext false honoured');
  assert(isSecureSpeechContext({ location: { protocol: 'https:' } }) === true, 'https → secure');
  assert(isSecureSpeechContext({ location: { protocol: 'http:', hostname: 'localhost' } }) === true, 'localhost → secure');
  assert(isSecureSpeechContext({ location: { protocol: 'http:', hostname: 'example.com' } }) === false, 'plain http host → insecure');
}

// ═══ §3 — Dictation controller lifecycle (behavioural) ═════
section('3. SpeechDictationController: start → listen → transcript → stop/destroy');
{
  // 3a. Unsupported browser: start() refuses, emits the non-blocking notice.
  {
    instances.length = 0;
    const phases: SpeechPhase[] = [];
    const notices: SpeechNotice[] = [];
    const finals: string[] = [];
    const c = new SpeechDictationController(
      { onPhaseChange: (p) => phases.push(p), onNotice: (n) => notices.push(n), onFinalTranscript: (t) => finals.push(t) },
      { lang: 'en-US', globalObj: { isSecureContext: true } }, // no SpeechRecognition
    );
    const started = c.start();
    assert(started === false, 'unsupported: start() returns false');
    assert(notices.includes('unsupported'), 'unsupported: surfaces "unsupported" notice');
    assert(instances.length === 0, 'unsupported: never constructs a recognition engine');
    assert(finals.length === 0, 'unsupported: no transcript produced');
  }

  // 3b. Insecure origin refuses too.
  {
    instances.length = 0;
    const notices: SpeechNotice[] = [];
    const c = new SpeechDictationController(
      { onPhaseChange: () => {}, onNotice: (n) => notices.push(n), onFinalTranscript: () => {} },
      { lang: 'en-US', globalObj: { SpeechRecognition: FakeSR, isSecureContext: false } },
    );
    assert(c.start() === false, 'insecure: start() returns false');
    assert(notices.includes('insecure'), 'insecure: surfaces "insecure" notice');
  }

  // 3c. Happy path: permission prompt (starting) → listening → final transcript.
  {
    instances.length = 0;
    const phases: SpeechPhase[] = [];
    const notices: SpeechNotice[] = [];
    const finals: string[] = [];
    const interims: string[] = [];
    const c = new SpeechDictationController(
      {
        onPhaseChange: (p) => phases.push(p),
        onNotice: (n) => notices.push(n),
        onFinalTranscript: (t) => finals.push(t),
        onInterimTranscript: (t) => interims.push(t),
      },
      { lang: 'ur-PK', globalObj: secureGlobal() },
    );
    assert(c.start() === true, 'supported+secure: start() returns true');
    assert(phases.includes('starting'), 'emits "starting" (permission prompt phase)');
    const sr = lastSR();
    assert(sr.lang === 'ur-PK', 'recognition lang set from UI language');
    assert(sr.continuous === true && sr.interimResults === true, 'continuous + interim enabled');
    assert(sr.startCount === 1, 'engine.start() called exactly once');
    assert(c.isActive === false, 'not yet active until onstart fires');

    sr.onstart?.();
    assert(c.isActive === true, 'onstart → active (listening)');
    assert(phases[phases.length - 1] === 'listening', 'phase becomes "listening"');

    sr.onresult?.(interimResultEvent('مری ماں'));
    assert(interims[interims.length - 1] === 'مری ماں', 'interim transcript forwarded (preview only)');
    assert(finals.length === 0, 'interim does NOT append to the message');

    sr.onresult?.(finalResultEvent('میری امی بے ہوش ہیں'));
    assert(finals[finals.length - 1] === 'میری امی بے ہوش ہیں', 'final transcript forwarded verbatim');

    // stop cleanup
    c.stop();
    assert(sr.stopCount === 1, 'user stop → engine.stop() called');
    assert(c.isActive === false, 'stop → no longer active');
    assert(phases[phases.length - 1] === 'idle', 'stop → phase returns to idle');
    assert(c.wasUserStopped === true, 'stop is recorded as user-initiated');
  }

  // 3d. Permission denial via onerror.
  {
    instances.length = 0;
    const notices: SpeechNotice[] = [];
    const phases: SpeechPhase[] = [];
    const c = new SpeechDictationController(
      { onPhaseChange: (p) => phases.push(p), onNotice: (n) => notices.push(n), onFinalTranscript: () => {} },
      { lang: 'en-US', globalObj: secureGlobal() },
    );
    c.start();
    const sr = lastSR();
    sr.onstart?.();
    sr.onerror?.({ error: 'not-allowed' });
    assert(notices.includes('denied'), 'permission denial → "denied" notice');
    assert(c.isActive === false, 'denial tears down the session');
    assert(phases[phases.length - 1] === 'idle', 'denial → phase idle');
  }

  // 3e. No microphone.
  {
    instances.length = 0;
    const notices: SpeechNotice[] = [];
    const c = new SpeechDictationController(
      { onPhaseChange: () => {}, onNotice: (n) => notices.push(n), onFinalTranscript: () => {} },
      { lang: 'en-US', globalObj: secureGlobal() },
    );
    c.start();
    lastSR().onerror?.({ error: 'audio-capture' });
    assert(notices.includes('no-mic'), 'audio-capture error → "no-mic" notice');
  }

  // 3f. Browser onend never auto-restarts (no background recording).
  {
    instances.length = 0;
    const phases: SpeechPhase[] = [];
    const c = new SpeechDictationController(
      { onPhaseChange: (p) => phases.push(p), onNotice: () => {}, onFinalTranscript: () => {} },
      { lang: 'en-US', globalObj: secureGlobal() },
    );
    c.start();
    const sr = lastSR();
    sr.onstart?.();
    sr.onend?.();
    assert(c.isActive === false, 'onend → inactive');
    assert(phases[phases.length - 1] === 'idle', 'onend → phase idle');
    assert(sr.startCount === 1, 'onend does NOT auto-restart the engine (no background recording)');
  }

  // 3g. Destroy on unmount aborts without further callbacks.
  {
    instances.length = 0;
    let phasesAfterDestroy = 0;
    const c = new SpeechDictationController(
      { onPhaseChange: () => { phasesAfterDestroy++; }, onNotice: () => {}, onFinalTranscript: () => {} },
      { lang: 'en-US', globalObj: secureGlobal() },
    );
    c.start();
    const sr = lastSR();
    sr.onstart?.();
    const before = phasesAfterDestroy;
    c.destroy();
    assert(sr.abortCount === 1, 'destroy → engine.abort() called (frees the mic)');
    assert(c.isActive === false, 'destroy → inactive');
    assert(phasesAfterDestroy === before, 'destroy emits no further phase callbacks');
  }
}

// ═══ §4 — Web-call server helpers (config, payload, limiter) ═
section('4. Retell web-call server helpers');
{
  const savedKey = process.env.RETELL_API_KEY;
  const savedAgent = process.env.RETELL_AGENT_ID;

  delete process.env.RETELL_API_KEY;
  delete process.env.RETELL_AGENT_ID;
  let cfg = getWebCallConfig();
  assert(cfg.ok === false && cfg.reason === 'missing_api_key', 'no API key → fail closed (missing_api_key)');
  assert(isWebCallConfigured() === false, 'isWebCallConfigured false when unconfigured');

  process.env.RETELL_API_KEY = 'rk_test';
  cfg = getWebCallConfig();
  assert(cfg.ok === false && cfg.reason === 'missing_agent_id', 'key but no agent → missing_agent_id');

  process.env.RETELL_AGENT_ID = 'agent_test';
  cfg = getWebCallConfig();
  assert(cfg.ok === true, 'both present → configured');
  assert(isWebCallConfigured() === true, 'isWebCallConfigured true when configured');

  // restore
  if (savedKey === undefined) delete process.env.RETELL_API_KEY; else process.env.RETELL_API_KEY = savedKey;
  if (savedAgent === undefined) delete process.env.RETELL_AGENT_ID; else process.env.RETELL_AGENT_ID = savedAgent;

  // Public payload reduction — ONLY accessToken + callId survive.
  const pub = toPublicWebCall({ access_token: 'tok_abc', call_id: 'call_xyz' });
  assert(pub.accessToken === 'tok_abc' && pub.callId === 'call_xyz', 'public payload maps access_token/call_id');
  assert(Object.keys(pub).length === 2, 'public payload exposes exactly 2 fields');

  const leaky = toPublicWebCall({
    access_token: 'tok', call_id: 'cid',
    // @ts-expect-error — simulate extra server fields that must be dropped
    agent_id: 'a', call_cost: 5, api_key: 'SECRET_PERMANENT_KEY', RETELL_API_KEY: 'SECRET_PERMANENT_KEY',
  });
  const leakyJson = JSON.stringify(leaky);
  assert(!leakyJson.includes('SECRET_PERMANENT_KEY'), 'extra/secret fields are stripped from the public payload');
  assert(!leakyJson.includes('agent_id') && !leakyJson.includes('call_cost'), 'server-only fields never reach the browser');

  // Analysis status mapping.
  assert(mapAnalysisStatus(null) === 'pending', 'no analysis row → pending');
  assert(mapAnalysisStatus(undefined) === 'pending', 'undefined → pending');
  assert(mapAnalysisStatus('AI_ANALYSIS_COMPLETED') === 'analyzed', 'completed → analyzed');
  assert(mapAnalysisStatus('AI_ANALYSIS_FAILED') === 'needs_human_review', 'failed → needs_human_review');

  // Rate limiter: 6 allowed per window, 7th blocked; reset clears.
  resetWebCallRateLimiter();
  const key = 'test-ip-1.2.3.4';
  const now = 1_000_000;
  let allowedCount = 0;
  for (let i = 0; i < 6; i++) if (rateLimitWebCall(key, now).allowed) allowedCount++;
  assert(allowedCount === 6, 'first 6 attempts in the window are allowed');
  const seventh = rateLimitWebCall(key, now);
  assert(seventh.allowed === false, '7th attempt is rate-limited');
  assert(seventh.retryAfterMs > 0, 'rate-limited response carries a retry hint');
  resetWebCallRateLimiter();
  assert(rateLimitWebCall(key, now).allowed === true, 'reset clears the limiter');
  resetWebCallRateLimiter();
}

// ═══ §5 — Security: permanent key never in client code ══════
section('5. Security invariants (structural)');
{
  const panel = readSource('src/app/voice-ai/RealVoicePanel.tsx');
  const panelCode = stripComments(panel);
  assert(!panelCode.includes('RETELL_API_KEY'), 'RealVoicePanel code never references RETELL_API_KEY');
  assert(!panelCode.includes('process.env'), 'RealVoicePanel code never reads process.env');
  assert(!panelCode.includes('apiKey'), 'RealVoicePanel code never handles an apiKey');
  assert(panelCode.includes("await import('retell-client-js-sdk')"), 'browser SDK is loaded via dynamic import');
  assert(!panelCode.includes('import { RetellWebClient }'), 'no static VALUE import of the SDK (type-only is fine)');

  const emergency = readSource('src/app/emergency/page.tsx');
  const emergencyCode = stripComments(emergency);
  assert(!emergencyCode.includes('RETELL_API_KEY'), 'emergency page never references RETELL_API_KEY');

  const route = readSource('src/app/api/voice/retell/web-call/route.ts');
  const routeCode = stripComments(route);
  assert(!routeCode.includes('RETELL_API_KEY'), 'web-call route delegates the key to the server helper (never inline)');
  assert(route.includes("runtime = 'nodejs'"), 'web-call route runs on the nodejs runtime (server-only)');

  const helper = readSource('src/lib/voice/retellWebCall.ts');
  assert(helper.includes('process.env.RETELL_API_KEY'), 'RETELL_API_KEY is used ONLY in the server helper');
  assert(helper.includes('export async function createRetellWebCall'), 'server helper owns web-call creation');
}

// ═══ §6 — Browser Retell: state transitions & methods ══════
section('6. Real call wiring: events, controls, dynamic import (structural)');
{
  const panel = readSource('src/app/voice-ai/RealVoicePanel.tsx');
  for (const ev of ['call_started', 'call_ended', 'agent_start_talking', 'agent_stop_talking', 'error']) {
    assert(panel.includes(`.on('${ev}'`), `wires the real SDK event: ${ev}`);
  }
  assert(panel.includes('startCall({ accessToken'), 'calls startCall with the short-lived accessToken');
  assert(panel.includes('startAudioPlayback('), 'calls startAudioPlayback (autoplay policy)');
  assert(panel.includes('.stopCall()'), 'End Call invokes stopCall()');
  assert(panel.includes('.mute()') && panel.includes('.unmute()'), 'mute/unmute invoke the SDK methods');
  assert(panel.includes("fetch('/api/voice/retell/web-call'"), 'POSTs the secure session endpoint to start');
  assert(panel.includes('/api/voice/retell/web-call?callId='), 'polls the real status endpoint by callId');
  assert(panel.includes("setPhase('live')") && panel.includes("setPhase('error')"), 'start/end/error phase transitions present');

  const emergency = readSource('src/app/emergency/page.tsx');
  assert(emergency.includes('onClick={handleMicClick}'), 'dead mic is fixed: button has a real click handler');
  assert(emergency.includes('appendTranscript(prev, text)'), 'recognized speech only appends to the editable message');
  const micStart = emergency.indexOf('const handleMicClick');
  const micSlice = emergency.slice(micStart, micStart + 1600);
  assert(micStart !== -1 && !micSlice.includes('handleSubmit'), 'dictation never auto-submits the form');
}

// ═══ §7 — Safety: no false dispatch + required copy ════════
section('7. Safety wording (no false dispatch) + fallback/safe note');
{
  const realKeys = [
    'voiceModeReal', 'voiceBrowserTitle', 'voiceBrowserSubtitle', 'voiceStartVoiceEmergency',
    'voiceConnecting', 'voiceConnected', 'voiceAiSpeaking', 'voiceCallEnded', 'voiceSafeNote',
    'voiceTranscriptNote', 'voiceStartPrompt', 'voiceFallback', 'voiceAnalysis', 'voiceAnalysisAnalyzed',
    'voiceAnalysisNeedsReview', 'voiceMicListeningHint', 'voiceMicUnsupported',
  ] as const;

  const en = translations.en as unknown as Record<string, string>;
  const ur = translations.ur as unknown as Record<string, string>;
  const panelCode = stripComments(readSource('src/app/voice-ai/RealVoicePanel.tsx'));

  const copy = [panelCode, ...realKeys.map((k) => en[k] ?? ''), ...realKeys.map((k) => ur[k] ?? '')]
    .join('\n')
    .toLowerCase();

  const forbidden = [
    'ambulance is coming', 'help is on the way', 'is on its way', 'responders are en route',
    'en route', 'help is arriving', 'ambulance has been dispatched', 'your ambulance is',
    'responder is on the way', 'help has been sent',
  ];
  for (const phrase of forbidden) {
    assert(!copy.includes(phrase), `no false-dispatch wording: "${phrase}"`);
  }

  assert(
    en.voiceSafeNote.includes('No responder is dispatched until a real assignment is made'),
    'safe note states no dispatch without a real assignment',
  );
  assert(
    en.voiceFallback.includes('Voice connection unavailable') &&
      en.voiceFallback.includes('submit an emergency using the form'),
    'voice-failure fallback points to the form / emergency line',
  );
  assert(
    en.voiceMicUnsupported.includes('Voice typing is not supported in this browser'),
    'unsupported-browser dictation message is present and non-blocking',
  );
}

// ─── Result ────────────────────────────────────────────────
console.log(`\n═══ RESULT: ${passed} passed, ${failed} failed ═══`);
if (failures.length) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(failed > 0 ? 1 : 0);
