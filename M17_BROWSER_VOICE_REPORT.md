# M17 — Final Browser Voice + Emergency Dictation

**Scope:** Add a REAL browser microphone experience to `/voice-ai` (Retell Web
Call) and a REAL dictation mic to `/emergency` (Web Speech), **without** creating
a second voice architecture. No changes to Retell agent selection, Alibaba Qwen,
Twilio PSTN/SIP, or the Prisma schema.

**Status:** Implemented and verified. Not committed, not pushed, not deployed.

---

## 1. Root cause of the old `/voice-ai` behavior

The page was **100% scripted mock**, never a real call:

- It imported `mockConversationTurns` and `mockVoiceCaseDraft` from
  `@/data/mockData` and rendered them as if live.
- On load it defaulted to `callPhase = 'active'`, `callSeconds = 42`,
  `currentTurnIndex = 3`, `isDemoMode = true` — i.e. it *opened already inside a
  fake live call*.
- Every "live" behavior was a `setTimeout` chain in `handleStartDemoCall`,
  `handleSimulateCritical`, `handleSimulateLowConfidence`, `handleSimulateCallDrop`
  that walked the mock transcript and mutated a hardcoded case card.
- Hardcoded, non-real fields were presented as live truth:
  caller `+92 300 8241992`, cell tower `GL-18`, fixed case `KC-2026-1058`,
  ASR latency `180ms`.
- The only real network touch was a 10s poll of `/api/operator/voice-calls`,
  used merely to nudge the mock case card — it never started a call.

There was **no Retell Web SDK installed and no browser session endpoint**, so the
page had no way to place a real call even if it tried. It was an animation.

## 2. Root cause of the dead `/emergency` mic

The microphone button inside the *Emergency Message* field was **decorative**:

- It rendered a `Mic` icon but had **no `onClick` handler** and no reference to
  any speech API — clicking it did nothing.
- A translation string (`voiceInputTitle` = "Tap to speak (Urdu / English)")
  implied functionality that was never implemented.
- No `SpeechRecognition`/`webkitSpeechRecognition` integration existed anywhere
  in the codebase.

So the mic was a static icon with no handler, no permission request, and no
speech-to-text pipeline behind it.

## 3. Files changed

**Modified**
| File | Change |
| --- | --- |
| `src/app/emergency/page.tsx` | Wired the dead mic to real Web Speech dictation (Part B). |
| `src/app/voice-ai/page.tsx` | Rewritten as a thin shell: REAL mode (default) vs clearly-labelled DEMO mode. |
| `src/i18n/translations.ts` | +12 `voiceMic*` keys (Part B) and +35 real-mode keys (Parts C/E/F), in **both** `en` and `ur`. |
| `package.json` | Added `retell-client-js-sdk@^2.0.8` (browser) and `retell-sdk@^5.64.0` (server). |
| `package-lock.json` | Lockfile for the two packages above. |

**Added**
| File | Purpose |
| --- | --- |
| `src/lib/voice/speechRecognition.ts` | Browser Web Speech dictation lib + pure testable helpers (Part B). |
| `src/lib/voice/retellWebCall.ts` | Server-only Retell web-call helper (Part D). |
| `src/app/api/voice/retell/web-call/route.ts` | `POST` (mint token) + `GET` (status) endpoint, `runtime = 'nodejs'` (Part D). |
| `src/app/voice-ai/RealVoicePanel.tsx` | REAL browser Retell call UI (Parts C/E/F). |
| `src/app/voice-ai/DemoVoicePanel.tsx` | Original mock UI, demoted + labelled DEMO MODE (Part E). |
| `scripts/m17-browser-voice-verify.ts` | New deterministic M17 verification suite (Part H). |

**Untouched (regression-protected):** `retellService.ts`, `retellSecurity.ts`,
`twilioClient.ts`, `twilioValidation.ts`, `voiceService.ts`, the Retell
`webhook`/`update-case` routes, and `prisma/schema.prisma`.

## 4. Browser dictation implementation (`/emergency`)

`src/lib/voice/speechRecognition.ts` (browser-only, mirrors the geolocation
module's safety pattern):

- **Pure, offline-testable helpers:** `evaluateSpeechGate`,
  `isSpeechRecognitionSupported`, `isSecureSpeechContext`, `mapSpeechErrorToNotice`,
  `speechLangForLanguage`, `appendTranscript`.
- **`SpeechDictationController`:** a thin defensive wrapper over one
  `SpeechRecognition` instance.
  - Starts **only** from an explicit user click — never on mount, never on a
    timer (no background recording).
  - `continuous = true`, `interimResults = true`; **never auto-restarts** when the
    browser fires `onend`.
  - Final phrases are appended **verbatim** via `appendTranscript(existing, add,
    maxLength=2000)` — empty additions change nothing, a single space joins, the
    result is capped. It never invents or "corrects" words.
  - `stop()` (user), `onerror`, and `onend` all tear down cleanly; `destroy()`
    calls `abort()` on unmount so the mic is never left open.

`src/app/emergency/page.tsx`:
- The mic is now a real `type="button"` that toggles start/stop, with
  `aria-label` (idle / requesting / listening), `aria-pressed`, and distinct
  idle → starting (spinner) → listening (pulsing red + stop square) visuals.
- Live interim text previews under the field; recognized finals append to the
  **editable** `message` state. The user can always edit, and **typing is
  completely unaffected**.
- **Never auto-submits and never triggers dispatch** — dictation only writes into
  the message box. Submission remains the existing `handleSubmit` on the Submit
  button (proven by test: the `handleMicClick` body contains no `handleSubmit`).

**Language:** `ur*` → `ur-PK`, otherwise `en-US`. The Web Speech API recognizes
one language at a time; mixed Urdu-English relies on the provider's code-switch
tolerance within the chosen tag (see §10).

## 5. Retell web-call implementation (`/voice-ai`, REAL mode)

**Server (Part D) — `retellWebCall.ts` + `POST/GET /api/voice/retell/web-call`:**
- `createRetellWebCall()` calls the installed `retell-sdk`'s
  `client.call.createWebCall({ agent_id: RETELL_AGENT_ID, metadata })` using the
  server-side `RETELL_API_KEY`. The agent id is fixed on the server — the client
  cannot override it, and **no second agent** is created.
- `toPublicWebCall()` reduces Retell's response to exactly **two** short-lived
  fields: `{ accessToken, callId }` (test-proven to strip every other field,
  including any secret).
- `getWebCallConfig()` fails closed (`missing_api_key` / `missing_agent_id`).
- `rateLimitWebCall()` is a best-effort in-memory sliding window (6 per 10 min
  per caller IP) for unauthenticated public emergency access.
- `GET ?callId=` returns minimal, non-sensitive status only (`caseCode`,
  `sessionStatus`, `caseStatus`, `urgency`, `analysisStatus`, `turnCount`,
  `humanReviewRequired`) — **never transcript text, phone numbers, or
  credentials** — via the existing `getSessionByCallSid`.

**Browser (Part C) — `RealVoicePanel.tsx`:**
- `POST /api/voice/retell/web-call` → `{ accessToken, callId }`.
- **Dynamic import** `await import('retell-client-js-sdk')` (keeps the SDK +
  LiveKit out of the SSR bundle), then `new RetellWebClient()`.
- `startCall({ accessToken, emitRawAudioSamples: true })` then
  `startAudioPlayback()` (browser autoplay policy) — both inside the user-gesture
  task.
- Events wired are **only the ones this SDK version actually emits** (verified
  from the installed bundle, not invented): `call_started`, `call_ended`,
  `agent_start_talking`, `agent_stop_talking`, `error`. (`call_ready`,
  `node_transition`, `update`, `metadata`, `audio` also exist; raw node names are
  deliberately **not** shown to citizens.)
- Controls: **Start Voice Emergency**, **Mute/Unmute** (`.mute()`/`.unmute()`),
  **End Call** (`.stopCall()`).
- The waveform is driven by the SDK's **real** analyser
  (`analyzerComponent.calculateVolume()`, enabled by `emitRawAudioSamples`), not
  fake numbers.
- **Same backend as PSTN:** the web call runs on the same production agent, so it
  flows through the identical `/api/voice/retell/update-case` custom function and
  `/api/voice/retell/webhook` → `EmergencyCase` → async Alibaba Qwen → Human
  Operator. No fake local transcript pipeline was created.

> **Live transcript note:** Retell Web SDK `v2.0.8` does **not** expose a live
> word-by-word transcript to the browser. Rather than fabricate one, REAL mode
> polls `GET /api/voice/retell/web-call?callId=` for the real case number,
> session/analysis status, and turn count, and states plainly that the full
> transcript is captured securely and reviewed by the human coordinator.

## 6. Security model

- `RETELL_API_KEY` is read **only** in server code (`retellWebCall.ts`, and the
  pre-existing `retellSecurity.ts`). It is **never** referenced in client
  component code (only in explanatory comments) and **never** in the built client
  bundle.
- The browser receives only a **short-lived `accessToken` + opaque `callId`**
  (2 fields). The agent is chosen server-side; clients cannot inject or override
  it.
- `runtime = 'nodejs'` on the route; the SDK server package stays server-side.
- Best-effort per-IP rate limiting on the public endpoint; fail-closed responses
  (`503` unconfigured, `429` rate-limited, `502` upstream) that never leak secret
  detail.
- The status poll returns minimal data and is keyed by the unguessable Retell
  `call_id` returned only to its creator.
- **Verified:** `grep` of `.next/static` for `RETELL_API_KEY`,
  `TWILIO_AUTH_TOKEN`, `TWILIO_ACCOUNT_SID`, `ALIBABA_MODEL_STUDIO_API_KEY`,
  `createRetellWebCall` → **0 matches**.

## 7. Fallback behavior

**Dictation (`/emergency`)** — every branch is non-blocking and the form keeps
working exactly as before:
| Condition | Notice shown (user's language) |
| --- | --- |
| Unsupported browser (e.g. Firefox) | "Voice typing is not supported in this browser. Please type your emergency." |
| Insecure origin (non-HTTPS) | Secure-connection message; type instead. |
| Permission denied | Allow the mic in browser settings, or type. |
| No microphone | No mic found; type. |
| Network / no-speech / other error | Type your emergency. |

Submission, GPS, and typing are **never** blocked by dictation. Missing GPS still
never blocks intake (unchanged).

**Browser voice (`/voice-ai`)** — if `POST` returns non-2xx, the token is missing,
or the SDK emits `error`, the panel enters an `error` phase and shows:

> "Voice connection unavailable. You can still submit an emergency using the form
> or call the emergency line."

with buttons to `/emergency` and `tel:1122`. Web voice failure never blocks the
normal emergency form (separate page/flow). A persistent **safe note** states:
"AI supports a human coordinator. No responder is dispatched until a real
assignment is made." No false "ambulance is coming"/"dispatched"/"en route"
wording exists in REAL mode (test-enforced).

## 8. Tests

New deterministic suite: `scripts/m17-browser-voice-verify.ts` (offline — no DB,
no network, no browser; a fake `SpeechRecognition`/`window` drives the real
controller, and page sources are parsed with comments stripped).

| Suite | Command | Result |
| --- | --- | --- |
| **M17 browser voice (new)** | `npx tsx scripts/m17-browser-voice-verify.ts` | **117 passed, 0 failed** |
| Retell PSTN regression (Part G) | `npx tsx scripts/retell-verify-tests.ts` | **114 passed, 0 failed** |
| Geolocation + mobile | `npx tsx scripts/geolocation-mobile-verify.ts` | **181 passed, 0 failed** |
| Maps (offline) | `npx tsx scripts/maps-verify-tests.ts` | **68 passed, 0 failed** |
| Type check | `npx tsc --noEmit` | **exit 0** |

M17 coverage: unsupported browser; insecure origin; permission denial; no-mic;
transcript appended verbatim (+ interim does not append); stop cleanup; `onend`
never auto-restarts; destroy-on-unmount aborts; no auto-submit; config gate
fail-closed; public payload = exactly 2 fields with secrets stripped; analysis
mapping; rate limiter (6 then blocked, reset clears); API key absent from client
code/bundle; dynamic import; all 5 SDK events wired; mute/unmute/stopCall/
startAudioPlayback present; status polling; dead-mic fixed; no false-dispatch
wording; safe note + fallback + unsupported-dictation copy present.

The Retell suite confirms the PSTN path is intact: webhook signature validation +
replay window, speaker/utterance normalization, language tagging, disconnect
classification, no-false-dispatch guard, tool-arg strictness, capture-first
session/case creation, duplicate-webhook idempotency, transcript persistence
(Urdu/English/mixed verbatim), `update_case` fast path, Qwen-failure case
preservation, **Qwen fingerprint dedup**, dropped-call preservation, and
`call_analyzed` reference-only storage.

## 9. Build result

`npm run build` → **exit 0**:
- ✓ Compiled successfully in **38.8s**; linting + type validity passed.
- ✓ **31/31** static pages generated.
- `/voice-ai` → **○ (Static) 11.3 kB** First Load 141 kB — the Retell/LiveKit SDK
  is code-split via dynamic import and does **not** break prerendering.
- `/emergency` → **○ (Static) 7.44 kB**.
- `/api/voice/retell/web-call` → **ƒ (Dynamic)** server route, present.

## 10. Remaining browser compatibility limitations

- **Web Speech API** (`webkitSpeechRecognition`) is supported in Chromium
  (Chrome/Edge) and partially in Safari; **Firefox does not support it** → the
  unsupported-browser notice is shown and typing continues to work.
- Web Speech requires a **secure context** (HTTPS or `localhost`); over plain HTTP
  the insecure notice is shown.
- **No true mixed-language mode:** the API recognizes one tag at a time
  (`ur-PK` or `en-US`). Mixed Urdu-English depends on the provider's code-switch
  tolerance; recognition quality for Urdu varies by device/OS and often relies on
  a server-backed recognizer (network).
- **Retell Web SDK uses LiveKit WebRTC:** requires a modern browser with WebRTC
  and microphone permission. Some browsers enforce autoplay policies — mitigated
  by calling `startAudioPlayback()` within the user gesture, but a further tap may
  occasionally be needed to hear agent audio.
- The SDK exposes **no live transcript**, so REAL mode shows real backend status
  (case number/analysis/turns) rather than word-by-word captions.
- The rate limiter is **per-process/in-memory**; a multi-instance deployment would
  move it to a shared store (Redis). Sufficient for the single-node demo box.

## 11. Manual production test checklist

Prereq: `RETELL_API_KEY` + `RETELL_AGENT_ID` set in the server env; site served
over HTTPS; the production Retell agent's webhook + `update_case` custom function
point at this deployment.

**A. Emergency dictation (`/emergency`)**
1. Open `/emergency` in Chrome/Edge over HTTPS. The mic icon is idle in the
   Emergency Message field.
2. Tap the mic → browser shows a microphone permission prompt → Allow. Button
   turns to a pulsing "listening/stop" state with an accessible label.
3. Speak in Urdu, then English, then mixed. Final phrases append to the message;
   you can edit them. Typing still works while/after dictation.
4. Tap again to stop. Nothing is submitted automatically.
5. Deny permission (or test in Firefox) → a clear non-blocking message appears;
   the form still submits normally.
6. Fill location + message + phone and Submit → a real case is created (unchanged
   flow).

**B. Browser voice emergency (`/voice-ai`)**
7. Open `/voice-ai`. Default mode is **Browser Voice (Live)**; the primary action
   is **Start Voice Emergency**. No fake phone/tower/case/latency is shown.
8. Tap **Start Voice Emergency** → allow the mic → state moves
   Connecting → Connected → Listening; the AI greets and you can converse.
   Elapsed time counts up; the waveform reacts to the AI's voice.
9. Use **Mute/Unmute** (mic actually mutes) and **End Call** (session stops,
   state → Call Ended).
10. In a separate tab, open `/operator`: the browser call appears as a real
    `VoiceCallSession` with a real `EmergencyCase`, transcript turns, and (after
    async analysis) a Qwen summary — the same pipeline as a PSTN call.
11. The right-hand card shows the **real case number**, session status, urgency,
    turn count, and AI analysis status once the backend has them. The safe note is
    visible throughout.
12. Toggle to **DEMO MODE** (header chip) → the simulated experience loads under
    an explicit "DEMO MODE — not a live emergency" banner, with fake fields tagged
    `Demo`. Toggling back returns to the real panel.

**C. Failure fallback**
13. With `RETELL_API_KEY`/`RETELL_AGENT_ID` temporarily unset (or upstream down),
    tap **Start Voice Emergency** → the fallback message appears with working
    links to the emergency form and `tel:1122`. The `/emergency` form still
    submits normally.

**D. PSTN regression (must stay green)**
14. Place a real Twilio → SIP → Retell call; confirm the webhook, `update_case`,
    transcript turns, Qwen analysis, and operator voice transcript display all
    behave as before.

---

**Not committed. Not pushed. Not deployed.** Implementation + verification only.
