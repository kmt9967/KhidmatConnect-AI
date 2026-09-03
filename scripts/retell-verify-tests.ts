/**
 * M9 Retell integration — verification tests.
 *
 * Part A (offline, no DB): webhook signature validation, replay window,
 * speaker/utterance normalization, language tagging, disconnect
 * classification, no-false-dispatch message guard, tool-arg strictness.
 *
 * Part B (LOCALHOST PostgreSQL only — hard guard, never production):
 * capture-first session/case creation, duplicate-webhook idempotency,
 * transcript persistence (Urdu/English/mixed verbatim), update_case tool
 * safety, Qwen-failure case preservation, dropped-call partial preservation,
 * normal-completion path, tool-before-call_started recovery.
 *
 * Run: npx tsx scripts/retell-verify-tests.ts
 */

import { loadEnvLocal } from './lib/env';
import { createHmac, randomUUID } from 'crypto';
import { prisma } from '../src/lib/db/prisma';
import {
  verifyRetellSignature,
  parseRetellSignature,
  computeRetellDigest,
  WEBHOOK_MAX_SKEW_MS,
} from '../src/lib/voice/retellSecurity';
import {
  normalizeSpeaker,
  extractUtterances,
  parseRawTranscript,
  detectLanguageTag,
  isNormalRetellDisconnect,
  buildToolAgentMessage,
  retellToolArgsSchema,
  stripNullKeys,
  handleRetellWebhook,
  handleRetellToolCall,
  runQwenAnalysis,
  setQwenAnalyzerForTests,
  maybeScheduleQwenAnalysis,
  computeAnalysisFingerprint,
  type RetellCallObject,
} from '../src/lib/voice/retellService';
import { getSessionByCallSid } from '../src/lib/voice/voiceService';

// ─── Test harness ───────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${label}`);
  }
}

function section(name: string) {
  console.log(`\n--- ${name} ---`);
}

// ═══ PART A — OFFLINE (pure) ════════════════════════════════

const TEST_KEY = 'test-key-not-a-real-secret-0123456789';

function sign(body: string, ts: number, key = TEST_KEY): string {
  return `v=${ts},d=${createHmac('sha256', key).update(`${body}${ts}`, 'utf8').digest('hex')}`;
}

section('A1. Webhook signature validation');
{
  const body = JSON.stringify({ event: 'call_started', call: { call_id: 'c1' } });
  const now = Date.now();

  assert(verifyRetellSignature(body, sign(body, now), TEST_KEY, now).ok === true, 'valid signature accepted');
  assert(verifyRetellSignature(body + 'x', sign(body, now), TEST_KEY, now).ok === false, 'tampered body rejected');
  assert(verifyRetellSignature(body, sign(body, now, 'other-key'), TEST_KEY, now).ok === false, 'wrong key rejected');
  assert(
    verifyRetellSignature(body, sign(body, now - WEBHOOK_MAX_SKEW_MS - 10_000), TEST_KEY, now).ok === false,
    'stale timestamp (replay) rejected',
  );
  assert(verifyRetellSignature(body, null, TEST_KEY, now).ok === false, 'missing header rejected');
  assert(verifyRetellSignature(body, 'garbage', TEST_KEY, now).ok === false, 'malformed header rejected');
  assert(verifyRetellSignature(body, 'v=abc,d=deadbeef', TEST_KEY, now).ok === false, 'bad header shape rejected');

  const upper = `v=${now},d=${createHmac('sha256', TEST_KEY).update(`${body}${now}`, 'utf8').digest('hex').toUpperCase()}`;
  assert(verifyRetellSignature(body, upper, TEST_KEY, now).ok === true, 'uppercase hex digest accepted');

  const parsed = parseRetellSignature(sign(body, now));
  assert(parsed?.timestampMs === now && parsed.digest.length === 64, 'header parse extracts ts + 64-hex digest');
  assert(
    computeRetellDigest(body, now, TEST_KEY) === parseRetellSignature(sign(body, now))!.digest,
    'digest matches documented HMAC(rawBody+ts, key) construction',
  );
}

section('A2. Speaker + utterance normalization (real Retell role shape + legacy shapes)');
{
  assert(normalizeSpeaker('user') === 'CALLER', 'user → CALLER');
  assert(normalizeSpeaker('agent') === 'AI', 'agent → AI');
  assert(normalizeSpeaker('Agent') === 'AI', 'case-insensitive agent');
  assert(normalizeSpeaker('system') === null, 'unknown speaker ignored');
  assert(normalizeSpeaker('transfer_target') === null, 'transfer_target never guessed into CALLER/AI');

  // Production get-call shape: flat array of { role, content, words } — NO speaker/utterance_id fields.
  const roleArray = extractUtterances({ call_id: 'x', transcript_object: [{ role: 'user', content: 'a' }, { role: 'agent', content: 'b' }] });
  assert(roleArray.length === 2 && roleArray[0].role === 'user', 'role-array shape extracted');

  const wrapped = extractUtterances({ call_id: 'x', transcript_object: { utterances: [{ speaker: 'user', content: 'a' }] } });
  const flat = extractUtterances({ call_id: 'x', transcript_object: [{ speaker: 'user', content: 'a' }] });
  const none = extractUtterances({ call_id: 'x' });
  assert(wrapped.length === 1 && flat.length === 1 && none.length === 0, 'legacy utterances/array shapes still accepted');

  const participantMap = extractUtterances({ call_id: 'x', transcript_object: { '+92300A': [{ role: 'user', content: 'a' }], '+92300B': [{ role: 'agent', content: 'b' }] } });
  assert(participantMap.length === 2, 'participant-map transcript flattened');

  // Plain-text fallback keeps internal colons byte-exact.
  const raw = parseRawTranscript('Agent: hello\nUser: meri location: Gulshan 12: help');
  assert(raw.length === 2 && raw[1].content === 'meri location: Gulshan 12: help' && raw[1].role === 'user', 'raw transcript parsed with content preserved exactly');
  assert(parseRawTranscript(null).length === 0, 'null transcript → no turns');
  const viaFallback = extractUtterances({ call_id: 'x', transcript: 'Agent: hi\nUser: مدد', transcript_object: null });
  assert(viaFallback.length === 2 && viaFallback[1].content === 'مدد', 'missing transcript_object falls back to raw transcript');
}

section('A3. Urdu / English / mixed language tagging (raw text never modified)');
{
  assert(detectLanguageTag('مجھے سانس نہیں آ رہی') === 'ur', 'pure Urdu tagged ur');
  assert(detectLanguageTag('I cannot breathe') === 'en', 'pure English tagged en');
  assert(detectLanguageTag('mera saans问题 hai — please help') !== undefined, 'mixed input handled without error');
  assert(detectLanguageTag('سانس not coming') === 'ur-en', 'mixed Urdu+Latin tagged ur-en');
}

section('A4. Disconnect classification');
{
  assert(isNormalRetellDisconnect('agent_hangup') === true, 'agent_hangup is normal');
  assert(isNormalRetellDisconnect('phone_user_released') === true, 'phone_user_released is normal');
  assert(isNormalRetellDisconnect(undefined) === true, 'absent reason treated as normal');
  assert(isNormalRetellDisconnect('voicemail_detected') === false, 'voicemail flagged abnormal');
  assert(isNormalRetellDisconnect('exceeded_initial_conversation_timeout') === false, 'timeout flagged abnormal');
}

section('A5. No-false-dispatch guard (safety rule 5)');
{
  const forbidden = ['dispatched', 'on the way', 'on its way', 'has been assigned', 'assigned', 'ambulance sent', 'is coming'];
  const noAssignment = buildToolAgentMessage({ caseCode: 'KC-2026-999999', hasRealAssignment: false });
  const spoken = noAssignment.say_to_caller.toLowerCase();
  for (const phrase of forbidden) {
    assert(!spoken.includes(phrase), `caller-safe text contains no "${phrase}" claim`);
  }
  assert(spoken.includes('kc-2026-999999'), 'case code relayed to caller');
  assert(noAssignment.instruction.toLowerCase().includes('do not'), 'agent explicitly instructed not to claim dispatch');

  const withAssignment = buildToolAgentMessage({
    caseCode: 'KC-2026-999999',
    hasRealAssignment: true,
    assignmentSummary: 'Ahmed Khan (en_route)',
  });
  assert(withAssignment.say_to_caller.includes('Ahmed Khan'), 'real assignment name relayed (real data only)');
}

section('A6. Tool argument strictness (no invented facts, missing GPS allowed)');
{
  const empty = retellToolArgsSchema.safeParse({});
  assert(empty.success, 'all args optional — missing location/GPS never blocks intake');
  assert(retellToolArgsSchema.safeParse({ location_text: 'Liaquatabad' }).success, 'partial details accepted');
  assert(!retellToolArgsSchema.safeParse({ urgency: 'CRITICAL' }).success, 'unknown arg rejected (.strict) — agent cannot inject urgency');
  assert(!retellToolArgsSchema.safeParse({ people_affected: 1e9 }).success, 'absurd people_affected rejected');
  assert(retellToolArgsSchema.safeParse({ emergency_category: 'MEDICAL', location_confirmed: true }).success, 'valid category+flag accepted');

  // Retell sends unknown optional params as explicit null (production 400 root
  // cause) — null must behave exactly like "not provided":
  assert(retellToolArgsSchema.safeParse({ location_text: 'Gulshan Block 7', people_affected: null }).success, 'null people_affected accepted');
  assert(retellToolArgsSchema.safeParse({ people_affected: null, location_confirmed: null }).success, 'null location_confirmed accepted');
  assert(retellToolArgsSchema.safeParse({ caller_details: 'Building fire', emergency_category: null }).success, 'null emergency_category accepted');
  assert(
    retellToolArgsSchema.safeParse({ location_text: null, location_confirmed: null, emergency_category: null, people_affected: null, caller_details: null }).success,
    'ALL-NULL optional args accepted (safe no-op)',
  );
  const nullStrip = retellToolArgsSchema.safeParse({ location_text: 'X', people_affected: null });
  assert(nullStrip.success && (nullStrip.data as { people_affected?: number }).people_affected === undefined, 'null normalized to undefined — not coerced to a value');
  assert(!retellToolArgsSchema.safeParse({ people_affected: 'five' }).success, 'real invalid value NOT coerced ("five" stays rejected)');
  assert(!retellToolArgsSchema.safeParse({ people_affected: false }).success, 'false is not null — wrong type still rejected');
  assert(JSON.stringify(stripNullKeys({ a: 1, b: null, c: false, d: null })) === '{"a":1,"c":false}', 'stripNullKeys preserves non-null values');
}

// ═══ PART B — LOCALHOST DB INTEGRATION ═════════════════════

loadEnvLocal();

const dbUrl = process.env.DATABASE_URL ?? '';
const isLocalhost = /@(localhost|127\.0\.0\.1)(:\d+)?\//.test(dbUrl) || dbUrl === '';

if (!isLocalhost) {
  console.error('\n❌ DATABASE_URL does not point at localhost — refusing to run DB tests. Aborting.');
  process.exit(1);
}

async function partB(): Promise<void> {
  // Deterministic Qwen-failure path: hide Alibaba config for the whole DB run.
  const savedAlibabaKey = process.env.ALIBABA_MODEL_STUDIO_API_KEY;
  const savedAlibabaUrl = process.env.ALIBABA_MODEL_STUDIO_BASE_URL;
  delete process.env.ALIBABA_MODEL_STUDIO_API_KEY;
  delete process.env.ALIBABA_MODEL_STUDIO_BASE_URL;

const run = randomUUID().slice(0, 8);
const R1 = `RETELL_TEST_${run}_R1`;
const R2 = `RETELL_TEST_${run}_R2`;
const createdCaseIds: string[] = [];

const urduTurn = 'میری ماں کو ہوش نہیں ہے، وہ چل نہیں رہی';
const englishTurn = 'She collapsed and cannot stand up';
const mixedTurn = 'Location is Liaquatabad — نمبر 12';

function callObject(overrides: Partial<RetellCallObject>): RetellCallObject {
  return {
    call_id: R1,
    from_number: '+923000000000',
    direction: 'INBOUND',
    call_status: 'ongoing',
    ...overrides,
  };
}

try {
  section('B1. call_started → capture-first provisional case + session');
  {
    await handleRetellWebhook('call_started', callObject({ call_id: R1 }));
    const s = await getSessionByCallSid(R1);
    assert(!!s, 'session exists for call_id');
    assert(s?.provider === 'RETELL', "session provider is 'RETELL'");
    assert(s?.status === 'ACTIVE', 'session ACTIVE');
    assert(s?.emergencyCase?.source === 'VOICE_CALL', 'linked case source VOICE_CALL');
    assert(s?.emergencyCase?.status === 'NEW', 'case status NEW (queued for operator)');
    assert((s?.emergencyCase?.id ?? '') !== '', 'case id present');
    if (s?.emergencyCase) createdCaseIds.push(s.emergencyCase.id);
  }

  section('B2. Duplicate webhook idempotency (call_started retry)');
  {
    await handleRetellWebhook('call_started', callObject({ call_id: R1 }));
    const sessions = await prisma.voiceCallSession.count({ where: { providerCallSid: R1 } });
    assert(sessions === 1, 'retried call_started did NOT duplicate the session');
  }

  section('B3. Transcript persistence — production role shape, retry + cumulative dedup');
  {
    // EXACT production shape (get-call Utterance): flat array, role+content, no utterance_id.
    const utterances = [
      { role: 'agent', content: 'Assalam-o-Alaikum, KhidmatConnect AI Emergency Assistant.' },
      { role: 'user', content: urduTurn },
      { role: 'agent', content: 'Main samajh gaya.' },
      { role: 'user', content: englishTurn },
      { role: 'user', content: mixedTurn },
    ];
    const transcriptCall = callObject({ call_id: R1, transcript_object: utterances });
    await handleRetellWebhook('transcript_updated', transcriptCall);
    let turns = await prisma.voiceCallTurn.findMany({ where: { session: { providerCallSid: R1 } }, orderBy: { createdAt: 'asc' } });
    assert(turns.length === 5, `5 role-based turns persisted (got ${turns.length})`);

    // Duplicate delivery of the same payload → no new rows.
    await handleRetellWebhook('transcript_updated', transcriptCall);
    turns = await prisma.voiceCallTurn.findMany({ where: { session: { providerCallSid: R1 } }, orderBy: { createdAt: 'asc' } });
    assert(turns.length === 5, `retried transcript_updated did NOT duplicate turns (got ${turns.length})`);

    // CUMULATIVE delivery: all 5 old + 2 new → only the 2 new ones are added,
    // order preserved (requirement: cumulative must not duplicate history).
    const newUrdu = 'ہم تین افراد ہیں، بچاؤ';
    await handleRetellWebhook('transcript_updated', callObject({
      call_id: R1,
      transcript_object: [
        ...utterances,
        { role: 'user', content: newUrdu },
        { role: 'agent', content: 'Shukriya. Aap line par rahein.' },
      ],
    }));
    turns = await prisma.voiceCallTurn.findMany({ where: { session: { providerCallSid: R1 } }, orderBy: { createdAt: 'asc' } });
    assert(turns.length === 7, `cumulative delivery added exactly 2 new turns (got ${turns.length})`);
    assert(turns[1].transcript === urduTurn && turns[5].transcript === newUrdu, 'utterance order preserved across cumulative redelivery');

    const callerUrdu = turns.find((t) => t.transcript === urduTurn);
    const callerMixed = turns.find((t) => t.transcript === mixedTurn);
    assert(callerUrdu?.speaker === 'CALLER', 'role user → speaker CALLER');
    assert(turns[0].speaker === 'AI', 'role agent → speaker AI');
    assert(callerUrdu?.detectedLanguage === 'ur', 'Urdu turn tagged ur');
    assert(callerMixed?.detectedLanguage === 'ur-en', 'Mixed turn tagged ur-en (raw text preserved verbatim)');
    assert(callerUrdu?.transcript === urduTurn, 'raw Urdu text stored unchanged (authoritative)');

    const sess = await getSessionByCallSid(R1);
    assert((sess?.turnCount ?? 0) === 7, `session turnCount advanced to 7 (got ${sess?.turnCount})`);
    const caseT = await prisma.emergencyCase.findUnique({ where: { id: sess!.emergencyCaseId! } });
    assert((caseT?.transcript ?? '').includes(urduTurn), 'cumulative transcript on the case');
  }

  section('B4. update_case fast path — null-safe, idempotent, NEVER awaits Qwen');
  {
    const sess = await getSessionByCallSid(R1);
    const caseId = sess!.emergencyCaseId!;

    // Mock Qwen at 3 s (represents the real 25-30 s analysis proportionally):
    // the tool response must return well under it and the mock must run AFTER.
    let slowCalls = 0;
    setQwenAnalyzerForTests(async () => {
      await new Promise((r) => setTimeout(r, 3000));
      slowCalls++;
      return { success: false, analysis: null, error: 'mock slow', model: 'mock' };
    });

    // Exactly what Retell sends in production: unknown optionals as NULL.
    const rawArgs = {
      location_text: 'Liaquatabad No. 12, Karachi',
      location_confirmed: null,
      emergency_category: 'MEDICAL',
      people_affected: 1,
      caller_details: urduTurn + '. ' + englishTurn,
    };
    const parsed = retellToolArgsSchema.parse(rawArgs);
    const t0 = Date.now();
    const res = await handleRetellToolCall(callObject({ call_id: R1 }), parsed);
    const latency = Date.now() - t0;
    console.log(`  measured update_case latency: ${latency}ms (mock Qwen duration: 3000ms)`);

    assert(res.ok === true && !!res.case_number, 'tool ack with case number (null args accepted)');
    assert(latency < 1500, `update_case responded in ${latency}ms (<1500ms) despite 3000ms mock Qwen`);
    assert(slowCalls === 0, 'response path does NOT await analyzeEmergency (0 runs at reply time)');
    assert(res.analysis_status === 'pending', 'analysis_status pending — capture returned before AI');
    assert(res.assignment_confirmed === false, 'no real Assignment → assignment_confirmed false');

    const c = await prisma.emergencyCase.findUnique({
      where: { id: caseId },
      include: { categories: true, updates: true },
    });
    assert(c?.locationText === 'Liaquatabad No. 12, Karachi', 'location persisted');
    assert(c?.peopleAffected === 1, 'peopleAffected persisted');
    assert(c?.locationConfirmed === false, 'null location_confirmed → unknown → false, never guessed true');
    assert(c?.categories.some((x) => x.category === 'MEDICAL'), 'category added');
    assert(c?.originalMessage.includes(urduTurn), 'raw Urdu+English caller details replaced provisional placeholder verbatim');
    assert(!res.say_to_caller.toLowerCase().includes('dispatched'), 'tool reply contains no dispatch claim');

    // Duplicate identical tool call (Flex-loop re-invocation) → same case, no dupes.
    const res2 = await handleRetellToolCall(callObject({ call_id: R1 }), retellToolArgsSchema.parse(rawArgs));
    assert(res2.case_id === res.case_id, 'repeat update_case resolves the SAME EmergencyCase');
    const sessions = await prisma.voiceCallSession.count({ where: { providerCallSid: R1 } });
    const audits = await prisma.caseUpdate.count({ where: { emergencyCaseId: caseId, updateType: 'REQUESTER_INFORMATION_ADDED' } });
    assert(sessions === 1, 'duplicate tool call did not duplicate the session');
    assert(audits === 1, `identical repeat call not re-audited (got ${audits} audit rows)`);

    // All-null args → accepted as safe no-op, no writes, no audit spam.
    const noop = await handleRetellToolCall(callObject({ call_id: R1 }), retellToolArgsSchema.parse({ location_text: null, people_affected: null, caller_details: null }));
    assert(noop.ok === true && noop.updated === false, 'all-null tool call accepted as safe no-op');
    const factAudits = await prisma.caseUpdate.count({ where: { emergencyCaseId: caseId, updateType: { in: ['REQUESTER_INFORMATION_ADDED', 'VOICE_AI_UPDATED'] } } });
    assert(factAudits === 1, `no-op wrote nothing (got ${factAudits})`);

    // Async analysis must have run EXACTLY ONCE after the responses (deduped).
    await new Promise((r) => setTimeout(r, 3600));
    assert(slowCalls === 1, `detached Qwen ran exactly once after return (got ${slowCalls}) — not blocked, not piled up`);

    // Qwen total failure → update_case still succeeds, status reflects reality.
    setQwenAnalyzerForTests(async () => { throw new Error('mock total outage'); });
    const t1 = Date.now();
    const failRes = await handleRetellToolCall(callObject({ call_id: R1 }), retellToolArgsSchema.parse({ caller_details: 'اماں کو ہوش نہیں ہے — فیملی پریشان ہے' }));
    console.log(`  measured update_case latency during Qwen outage: ${Date.now() - t1}ms`);
    assert(failRes.ok === true && Date.now() - t1 < 1500, 'update_case OK while Qwen mock throws immediately');
    assert(failRes.analysis_status === 'needs_human_review', 'prior AI failure surfaces as needs_human_review');
    const urduAudit = await prisma.caseUpdate.findFirst({
      where: { emergencyCaseId: caseId, updateType: 'REQUESTER_INFORMATION_ADDED' },
      orderBy: { createdAt: 'desc' },
    });
    assert((urduAudit?.message ?? '').includes('اماں کو ہوش نہیں ہے'), 'Urdu tool text stored unchanged (authoritative)');
    await new Promise((r) => setTimeout(r, 400));
    setQwenAnalyzerForTests(null); // restore the real analyzer for remaining tests
  }

  section('B5. Qwen failure never loses the case');
  {
    // ALIBABA_* are unset in this run → analyzeEmergency short-circuits to failure.
    const sess = await getSessionByCallSid(R1);
    const caseId = sess!.emergencyCaseId!;
    const status = await runQwenAnalysis(caseId, { force: true });
    assert(status === 'FAILED', 'analysis reports FAILED gracefully when Qwen unconfigured');
    const c = await prisma.emergencyCase.findUnique({ where: { id: caseId }, include: { updates: true } });
    assert(!!c, 'case still exists');
    assert(!!c?.transcript?.length, 'raw transcript intact after AI failure');
    assert(c?.updates.some((u) => u.updateType === 'AI_ANALYSIS_FAILED'), 'AI_ANALYSIS_FAILED audit recorded');
    // Skip-if-done semantics for the webhook fallback path:
    const skipped = await runQwenAnalysis(caseId, { force: false });
    assert(skipped === 'SKIPPED', 'non-forced rerun skips (analysis already recorded)');
  }

  section('B5b. Qwen fingerprint dedup — unchanged facts never re-analyze');
  {
    const sess = await getSessionByCallSid(R1);
    const caseId = sess!.emergencyCaseId!;
    let runs = 0;
    setQwenAnalyzerForTests(async () => {
      runs++;
      return { success: false, analysis: null, error: 'mock dedup run', model: 'mock' };
    });

    // B5 stamped the CURRENT facts → scheduling with nothing changed = zero AI calls.
    maybeScheduleQwenAnalysis(caseId);
    maybeScheduleQwenAnalysis(caseId);
    await new Promise((r) => setTimeout(r, 300));
    assert(runs === 0, `unchanged facts scheduled ZERO analyses (runs=${runs})`);

    // Materially new caller fact via tool → exactly ONE new analysis.
    const fpBefore = await computeAnalysisFingerprint(caseId);
    await handleRetellToolCall(callObject({ call_id: R1 }), retellToolArgsSchema.parse({ people_affected: 5 }));
    await new Promise((r) => setTimeout(r, 400));
    assert(runs === 1, `materially new fact scheduled exactly one analysis (runs=${runs})`);
    const fpAfter = await computeAnalysisFingerprint(caseId);
    assert(fpBefore !== fpAfter, 'fingerprint changes when authoritative facts change');

    // Duplicate delivery of that SAME new fact → no additional run.
    await handleRetellToolCall(callObject({ call_id: R1 }), retellToolArgsSchema.parse({ people_affected: 5 }));
    await new Promise((r) => setTimeout(r, 400));
    assert(runs === 1, `duplicate new-fact delivery added no analysis (runs=${runs})`);

    // Transcript webhook (not a triage input) → no additional run.
    await handleRetellWebhook('transcript_updated', callObject({
      call_id: R1,
      transcript_object: [{ role: 'user', content: 'barish ka paani ghutno tak hai' }],
    }));
    await new Promise((r) => setTimeout(r, 300));
    assert(runs === 1, `transcript webhook scheduled no analysis (runs=${runs})`);

    setQwenAnalyzerForTests(null);
  }

  section('B6. Abnormal disconnect preserves partial emergency + flags review');
  {
    const turnsBefore = await prisma.voiceCallTurn.count({ where: { session: { providerCallSid: R1 } } });
    // call_ended carries the FULL cumulative transcript again — must not erase
    // or duplicate turns.
    await handleRetellWebhook('call_ended', callObject({
      call_id: R1,
      call_status: 'ended',
      disconnection_reason: 'voicemail_detected',
      transcript_object: [{ role: 'user', content: 'barish ka paani ghutno tak hai' }],
    }));
    const turnsAfter = await prisma.voiceCallTurn.count({ where: { session: { providerCallSid: R1 } } });
    assert(turnsAfter === turnsBefore, `call_ended redelivery preserved turn count (${turnsBefore} → ${turnsAfter})`);
    const sess = await prisma.voiceCallSession.findUnique({ where: { providerCallSid: R1 } });
    assert(sess?.status === 'DISCONNECTED', 'session DISCONNECTED on abnormal end');
    assert(sess?.humanReviewRequired === true, 'human review flagged (no silent loss)');
    assert(sess?.turnCount === turnsAfter, `completed-session turn count matches rows (${sess?.turnCount} = ${turnsAfter})`);
    const c = await prisma.emergencyCase.findUnique({ where: { id: sess!.emergencyCaseId! } });
    assert(!!c?.transcript?.length, 'partial transcript preserved after drop');

    // Duplicate call_ended → terminal-state no-op, must not throw
    await handleRetellWebhook('call_ended', callObject({ call_id: R1, call_status: 'ended', disconnection_reason: 'voicemail_detected' }));
    assert(true, 'duplicate call_ended handled without error');
  }

  section('B7. Tool-before-call_started recovery + clean completion');
  {
    const res = await handleRetellToolCall(callObject({ call_id: R2 }), { caller_details: 'Flood water entered house, family stuck on roof' });
    const sess = await getSessionByCallSid(R2);
    assert(!!sess && !!sess.emergencyCaseId, 'session+case lazily created when call_started was lost');
    assert(res.ok === true && res.case_number.startsWith('KC-'), 'tool answered with real case number');
    if (sess?.emergencyCaseId) createdCaseIds.push(sess.emergencyCaseId);

    await handleRetellWebhook('transcript_updated', callObject({
      call_id: R2,
      transcript_object: { utterances: [{ utterance_id: 'r2u1', speaker: 'user', content: 'پانی گھر میں آگیا ہے' }] },
    }));
    await handleRetellWebhook('call_ended', callObject({ call_id: R2, call_status: 'ended', disconnection_reason: 'agent_hangup' }));
    const s2 = await prisma.voiceCallSession.findUnique({ where: { providerCallSid: R2 } });
    assert(s2?.status === 'COMPLETED', 'normal end → COMPLETED');
    assert((s2?.endedAt ?? null) !== null, 'endedAt set on completion');
  }

  section('B8. call_analyzed stores summary as reference-only');
  {
    await handleRetellWebhook('call_analyzed', callObject({
      call_id: R2,
      call_analysis: { call_summary: 'Caller reported flooding.', user_sentiment: 'Negative', call_successful: true },
    }));
    const s2 = await prisma.voiceCallSession.findUnique({ where: { providerCallSid: R2 } });
    const note = await prisma.caseUpdate.findFirst({
      where: { emergencyCaseId: s2!.emergencyCaseId!, message: { contains: 'Retell call summary' } },
    });
    assert(!!note, 'Retell summary stored as labelled reference note');
    assert(note?.updateType === 'OPERATOR_NOTE', 'reference note does not masquerade as Qwen triage');
  }
} catch (err) {
  failed++;
  console.error('DB test run error:', err);
} finally {
  // Allow detached Qwen fallbacks triggered by call_ended to settle first.
  await new Promise((r) => setTimeout(r, 800));

  section('B9. Cleanup (only rows created by this run)');
  try {
    await prisma.voiceCallSession.deleteMany({ where: { providerCallSid: { startsWith: 'RETELL_TEST_' } } });
    if (createdCaseIds.length) {
      await prisma.emergencyCase.deleteMany({ where: { id: { in: createdCaseIds }, demoKey: null } });
    }
    const leftovers = await prisma.voiceCallSession.count({ where: { providerCallSid: { startsWith: 'RETELL_TEST_' } } });
    assert(leftovers === 0, 'no test rows left behind');
  } catch (e) {
    console.error('cleanup warning:', e);
  }

  if (savedAlibabaKey) process.env.ALIBABA_MODEL_STUDIO_API_KEY = savedAlibabaKey;
  if (savedAlibabaUrl) process.env.ALIBABA_MODEL_STUDIO_BASE_URL = savedAlibabaUrl;
  await prisma.$disconnect();
}
}

void partB()
  .catch((err) => {
    failed++;
    console.error('Part B unexpected top-level error:', err);
  })
  .finally(() => {
    console.log(`\n═══ RESULT: ${passed} passed, ${failed} failed ═══`);
    process.exit(failed > 0 ? 1 : 0);
  });
