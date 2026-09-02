# Milestone 9 — Voice AI Emergency Intake

## Status: WORKING PROTOTYPE (Checkpoint)

Voice AI phone-based emergency intake is functional but not production-ready.
Further optimization is **parked** until end of project.

---

## Working Features

- Twilio incoming call handling with signature validation
- Emergency case pre-creation before AI analysis (partial emergency preserved on failure)
- Google Chirp 2 Urdu ASR (primary) + Alibaba ASR (fallback)
- Alibaba qwen-turbo fast conversational reasoning
- Alibaba qwen3.7-plus asynchronous full emergency analysis
- Google Chirp 3 HD Puck Urdu TTS (primary) + Alibaba TTS (fallback)
- No recording beep (`playBeep="false"`)
- Async background processing architecture
- DB processing state tracking (`VoiceCallSession.processingState`)
- `/wait` polling endpoint (bounded: 25 polls max, 30s timeout)
- Disk-based audio serving (`.audio-cache/`)
- Pre-generated bilingual greeting audio (greeting_ur.wav, greeting_en.wav)
- Cloudflare quick tunnel for local testing
- Real human Urdu call successfully produced audible AI response

---

## Known Remaining Issues

### Critical (before production)

1. **Conversational latency too high** — Current async record→download→ASR→AI→TTS→serve pipeline takes 5-10 seconds per turn. Production requires sub-2-second response.

2. **Final call sometimes ends with Twilio application error** — The call completion/disconnect flow occasionally triggers a Twilio error. Root cause not fully identified.

3. **No real-time streaming** — Current architecture uses Twilio `<Record>` + `<Play>` (store-and-forward). Production voice UX requires real-time bidirectional audio streaming (e.g., Twilio Media Streams / WebSocket).

### Deferred (evaluate at final polish stage)

4. **Evaluate Retell AI** — Consider replacing custom Twilio pipeline with Retell real-time streaming for lower latency and better voice quality.

5. **Production domain** — Currently using temporary Cloudflare tunnel URL. Needs stable domain for production.

6. **Production credentials/security** — Current setup uses local ADC credentials and dev keys. Needs proper service accounts and security hardening.

7. **Gemini-TTS billing issue** — Google Cloud "Lightning dunning" blocks Gemini-TTS (ur-PK) model. Chirp 3 HD (ur-IN) works fine.

---

## Architecture Summary

```
Twilio → /incoming (create case) → <Record>
       → /recording-action (fire-and-forget)
         → acknowledge audio
         → download recording from Twilio
         → Google Chirp 2 ASR
         → qwen-turbo conversation
         → qwen3.7-plus full analysis (async)
         → Google Puck TTS → save to disk
         → update processingState = RESPONSE_READY
       → /wait (polling, <500ms per poll)
         → RESPONSE_READY → <Play> + <Record>
         → still processing → <Pause> + <Redirect>
       → /status (call completed/disconnected)
```

---

## Key Files

| Module | Path |
|--------|------|
| Twilio client | `src/lib/voice/twilioClient.ts` |
| Voice orchestration | `src/lib/voice/voiceOrchestration.ts` |
| Voice service | `src/lib/voice/voiceService.ts` |
| Google ASR | `src/lib/voice/googleAsr.ts` |
| Google TTS | `src/lib/voice/googleTts.ts` |
| Alibaba ASR | `src/lib/voice/alibabaAsr.ts` |
| Alibaba TTS | `src/lib/voice/alibabaTts.ts` |
| Audio storage | `src/lib/voice/audioStorage.ts` |
| Fast conversation AI | `src/lib/ai/fastVoiceConversation.ts` |
| Incoming webhook | `src/app/api/voice/twilio/incoming/route.ts` |
| Recording action | `src/app/api/voice/twilio/recording-action/route.ts` |
| Wait polling | `src/app/api/voice/twilio/wait/route.ts` |
| Call status | `src/app/api/voice/twilio/status/route.ts` |
| Audio serving | `src/app/api/voice/audio/[sessionId]/route.ts` |
| Operator voice calls | `src/app/api/operator/voice-calls/route.ts` |
| DB schema | `prisma/schema.prisma` (VoiceCallSession, VoiceCallTurn) |

---

## Checkpoint Commit

Branch: `feature/twilio-voice-intake`
Commit message: `feat: checkpoint voice AI emergency intake prototype`

This is NOT final Milestone 9 completion. Voice work will resume after other milestones.
