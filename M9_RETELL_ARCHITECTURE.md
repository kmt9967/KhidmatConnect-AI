# M9 Final Voice — Retell AI Integration — Architecture Report

Date: 2026-09-03 · Branch: `feature/twilio-voice-intake` · Status: APPROVED FOR IMPLEMENTATION
Research basis: official Retell docs (spec revision `2026-09-02`) — docs.retellai.com.

---

## 1. Decision

Retell AI becomes the **realtime speech/conversation transport** for phone emergency
intake. It owns: listening, turn-taking, interruption handling, ASR, TTS, and its own
conversational LLM. KhidmatConnect remains the **authoritative emergency backend**:

- Every call creates a real `EmergencyCase` (capture-first) in our PostgreSQL DB.
- **Alibaba Qwen** (`analyzeEmergency`) remains the only emergency *decision-support*
  analyzer. Retell's `call_analysis` is stored for reference but never drives triage.
- Dispatch remains human: nothing in this integration ever creates an `Assignment`.
  The agent is never allowed to claim dispatch unless a real Assignment exists.

The old Twilio record→ASR→TTS prototype (`src/app/api/voice/twilio/**`,
`src/lib/voice/voiceOrchestration.ts`, ASR/TTS modules) is **kept untouched** and is
now marked LEGACY PROTOTYPE. Retell replaces it only at the conversation layer.

## 2. Verified Retell capabilities (what shaped the design)

| Fact (verified in official docs) | Consequence for us |
|---|---|
| Webhooks deliver `{ "event", "call" }` to ONE URL: `call_started`, `transcript_updated`, `call_ended`, `call_analyzed` (+ transfer events) | Single dispatcher endpoint `/api/voice/retell/webhook` — NOT one endpoint per lifecycle stage as originally sketched |
| Webhooks are HMAC-SHA256 signed: header `X-Retell-Signature: v={ts_ms},d={hex}`, digest = HMAC(rawBody + ts, **the API key that has the webhook badge**) | We verify with our `RETELL_API_KEY`; there is **no separate webhook secret** env var in Retell |
| Webhook timeout 10 s, up to 3 retries | Endpoints persist fast and return 2xx; Qwen enrichment runs as a detached async job; dedup via unique `call_id` |
| **Custom Functions**: Retell POSTs `{ name, call, args }` synchronously to our public HTTPS URL during the call (timeout configurable 1–600 s, same `X-Retell-Signature`) | Mid-call tool `/api/voice/retell/update-case`; 120 s default is enough to persist details + await Qwen and answer the agent |
| Call object carries `transcript_object` (utterances), `transcript`, `disconnection_reason`, `call_analysis` after analysis | Transcript persistence reads `transcript_object`; per-utterance `utterance_id` maps onto existing `VoiceCallTurn.recordingReference` dedup |
| Retell-managed number purchase is **US/CA only**; Pakistan numbers require BYO telephony (elastic SIP trunk / `POST /import-phone-number`) | Phone-number cutover is a LATER ops step (out of scope now, per instructions). Demo/testing uses Retell dashboard/test calling |
| Urdu (`ur-IN`) supported for ASR via Azure/Soniox and TTS via ElevenLabs(`eleven_v3`)/OpenAI/Fish; code-switching via Soniox | Agent console config listed in §8; no code change needed for multilingual — we store raw text verbatim |
| `Authorization: Bearer <RETELL_API_KEY>` for REST; API key doubles as webhook HMAC secret | One new required env var |

## 3. End-to-end call flow (implemented)

```
Caller dials hotline (Retell telephony / SIP-imported number)
  └─ Retell Agent "KhidmatConnect AI Emergency Assistant" answers
       │  (Retell LLM + Retell ASR/TTS — our Qwen NOT used for conversation)
       │
       ├─ call_started webhook ──► POST /api/voice/retell/webhook
       │     • verify X-Retell-Signature (HMAC, 5-min replay window, constant-time)
       │     • createVoiceSession(provider='RETELL', providerCallSid=call_id)
       │       → SAME transaction pre-creates provisional EmergencyCase
       │         ("Phone emergency call in progress", status NEW)  ← CAPTURE FIRST
       │
       ├─ transcript_updated webhook (per turn + final)
       │     • sync new utterances → VoiceCallTurn (dedup on utterance_id)
       │     • cumulative transcript → session.transcriptText + case.transcript
       │     • detected language per caller turn (ur / en / ur-en) — raw text untouched
       │
       ├─ Agent invokes custom function update_case ──► POST /api/voice/retell/update-case
       │     • verify signature; ensure session exists (recovers lost call_started)
       │     • persist ONLY caller-provided facts: locationText, category,
       │       peopleAffected, raw caller details → CaseUpdate audit
       │     • Alibaba Qwen analyzeEmergency() on raw transcript →
       │       enrichCaseWithAiAnalysis() | recordAiAnalysisFailure()  (case survives either)
       │     • respond JSON to the agent:
       │       { status, caseCode, aiAnalysisStatus, urgency, message_for_agent }
       │       message_for_agent is built by NO-FALSE-DISPATCH guard: without a real
       │       Assignment it may only say "case registered, human coordinator reviewing"
       │
       ├─ call_ended webhook
       │     • final transcript sync (partial preserved if call dropped)
       │     • clean disconnect → COMPLETED; abnormal → DISCONNECTED + humanReviewRequired
       │     • detached fallback: if Qwen analysis never ran, run it now (never blocks 2xx)
       │
       └─ call_analyzed webhook
             • store Retell call_summary as reference-only OPERATOR_NOTE audit
             • same detached Qwen fallback (idempotent: skips if AI_ANALYSIS_* exists)

Case appears in existing operator queue (/operator, /api/operator/voice-calls)
→ human operator reviews, triages and performs REAL assignment via existing flows.
```

## 4. Existing M9 infrastructure reused (nothing redesigned)

| Reused | Where | Role for Retell |
|---|---|---|
| `createVoiceSession()` | `src/lib/voice/voiceService.ts` | capture-first provisional case + session; idempotent on `providerCallSid` (unique). +1 optional field `provider` |
| `addVoiceTurn()` | same | per-utterance persistence; already dedups on `recordingReference` ← `utterance_id` |
| `transitionVoiceSession()`, `handleCallDisconnect()` | same | end-state machine, human-review flagging |
| `getSessionByCallSid()` | same | correlation by Retell `call_id` |
| `analyzeEmergency()` + `enrichCaseWithAiAnalysis()` + `recordAiAnalysisFailure()` | `src/lib/ai/*`, `src/lib/services/emergencyCaseService.ts` | Alibaba Qwen structured analysis — unchanged |
| Operator queue UI + `/api/operator/voice-calls` | existing | shows Retell sessions with no UI change (provider-agnostic) |
| `CaseUpdateType.VOICE_*` audit vocabulary | schema | no new enum values needed |

## 5. New files (minimum adapter surface)

| File | Purpose |
|---|---|
| `src/lib/voice/retellSecurity.ts` | `X-Retell-Signature` parse + HMAC-SHA256 verify (raw body, replay window, `timingSafeEqual`), `isRetellConfigured()` |
| `src/lib/voice/retellService.ts` | typed Retell payloads; pure helpers (utterance extraction, speaker mapping, language tagging, disconnect classification, no-false-dispatch message builder); event handlers; custom-function handler; detached Qwen fallback |
| `src/app/api/voice/retell/webhook/route.ts` | single signed event dispatcher (204 fast; 500 only on retryable infra errors) |
| `src/app/api/voice/retell/update-case/route.ts` | synchronous signed custom-function endpoint |
| `scripts/retell-verify-tests.ts` | offline + localhost-DB verification suite |

Modified: `voiceService.ts` (+optional `provider`), `.env.example` (+Retell block),
this report. **No schema migration. No deletions.** Twilio prototype code untouched.

## 6. Database changes

**None required.** `VoiceCallSession.provider` is a free String (`"TWILIO"` default) —
Retell sessions store `"RETELL"`; `providerCallSid` (unique) stores Retell's `call_id`.
All transcript/audit/case fields already exist. This also means zero migration risk on
the cPanel PostgreSQL instance (which already has operational migration constraints).

## 7. Webhook security approach

- Every inbound Retell request is verified **before parsing trust**: HMAC-SHA256 over
  `rawBody + timestamp` keyed by `RETELL_API_KEY` (the webhook-badged key), parsed from
  `X-Retell-Signature: v={ts},d={digest}`; reject on missing/malformed header, timestamp
  skew > 5 min, or digest mismatch (constant-time compare). Unverified → 401, logged without payload.
- Raw body is read via `await req.text()` once — verification and parsing use the same bytes.
- If `RETELL_API_KEY` is unset, both endpoints return 503 — fail closed.
- Optional hardening documented (not required): allowlist Retell webhook egress IP `100.20.5.228` at nginx/cPanel.
- No secrets in responses or logs; operator-facing surfaces keep masking caller numbers.

## 8. Retell console configuration (manual, done by operator — listed here for the final report)

1. Agent prompt: identity **"KhidmatConnect AI Emergency Assistant"**; language policy:
   reply in the caller's language (Urdu / English / mixed); never claim dispatch.
2. Agent `language`: multiselect `["en-US","ur-IN"]` (Urdu requires explicit `ur-IN`;
   legacy "Multilingual" does not include Urdu). ASR: Soniox (code-switching) — Azure has
   no code-switch. TTS: ElevenLabs `eleven_v3` or OpenAI/Fish (Urdu coverage).
3. LLM: keep Retell-hosted (do NOT configure Custom LLM → our Qwen is never bypassed nor replaced into conversation).
4. Custom Function `update_case` → `POST https://khidmatconnect.teqprotech.com/api/voice/retell/update-case`,
   params: `location_text`, `emergency_category`, `people_affected`, `caller_details` (raw facts),
   timeout 30–60 s, `max_retry = 0` (endpoint is idempotent anyway).
5. Webhook URL (agent-level `webhook_url` or account System Settings):
   `https://khidmatconnect.teqprotech.com/api/voice/retell/webhook`,
   `webhook_events`: `call_started`, `transcript_updated`, `call_ended`, `call_analyzed`.
6. Telephony: Pakistan hotline via elastic SIP trunk + number import — DEFERRED (no live
   number changes in this milestone; use Retell test calling only).

## 9. Environment variables (names only — values never logged/committed)

| Var | Required | Purpose |
|---|---|---|
| `RETELL_API_KEY` | yes | REST Bearer auth **and** webhook/custom-function HMAC verification key |
| `RETELL_AGENT_ID` | optional | future server-side outbound/test-call triggers |
| `RETELL_FROM_NUMBER` | optional | outbound caller-ID once a number is provisioned |

`RETELL_WEBHOOK_SECRET` is deliberately NOT used — Retell signs with the API key itself.

## 10. Safety-rule compliance map

| Rule | Mechanism |
|---|---|
| Capture first | Provisional case at `call_started`, before any AI |
| Never lose emergency to AI failure | Case creation independent of Qwen; failure path writes `AI_ANALYSIS_FAILED` audit + human review |
| Persist case before long AI | Same pattern reused from Twilio prototype (transaction, then AI outside) |
| No auto-dispatch | Adapter never creates Assignments; assignment stays human (operator queue) |
| No false "dispatched" claims | `buildToolAgentMessage()` — dispatch wording only when real active Assignment exists (unit-tested) |
| Raw transcript authoritative | Verbatim storage; Qwen input is raw transcript; Retell summary stored separately as reference |
| No invented facts | Tool writes only caller-supplied args; unknowns stay null; `missingInformation` from Qwen already flags gaps |
| Missing GPS never blocks | Tool params all optional; case created with zero location; existing WEB flow precedent |
| Urdu/English/mixed | Retell multilingual agent; our storage is language-agnostic; per-turn language tagging only |
| No DTMF menus | None introduced |

## 11. Failure behavior

| Failure | Result |
|---|---|
| `call_started` webhook lost | `update_case` / `call_ended` handlers lazily create session+case (correlated by `call_id`) |
| Duplicate webhook (retry) | unique `providerCallSid` + turn `recordingReference` dedup + terminal-state checks → no-op |
| Qwen down/timeout | case keeps raw transcript; `AI_ANALYSIS_FAILED` audit; `humanReviewRequired` on disconnect; operator still sees full raw content |
| Call drops mid-sentence | provisional case + partial transcript persist; DISCONNECTED + review flag |
| Our endpoint 5xx | Retell retries webhooks (≤3, idempotent); custom function not retried → agent apologizes, case already captured |
| `RETELL_API_KEY` unset | endpoints 503 fail-closed; app otherwise unaffected |

## 12. Production compatibility

Plain HTTPS POST handlers on the existing Next.js 15 app under cPanel/Passenger.
No Docker, no Redis, no WebSockets, no new long-running worker. Only env addition:
`RETELL_API_KEY`. Deploy = `git pull && npm run build && passenger restart` (standard runbook).

## 13. Complexity estimate

LOW–MODERATE: ~2 new lib modules + 2 thin routes + 1 optional param on an existing
service + 1 test script. Zero migrations, zero UI changes, zero changes to legacy Twilio
or existing API contracts. Main external dependency is Retell console setup (manual).
