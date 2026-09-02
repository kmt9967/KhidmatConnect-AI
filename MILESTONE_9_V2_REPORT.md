# Milestone 9 v2 — Urdu Voice Experience Report
**Date:** August 31, 2026  
**Branch:** feature/twilio-voice-integration  
**Status:** Testing Complete — NOT READY TO COMMIT

---

## Executive Summary

**CRITICAL FINDING: Alibaba qwen3-asr-flash CANNOT perform Urdu ASR.**

Urdu is a HARD REQUIREMENT. The current Alibaba ASR model transcribes Urdu speech to Chinese, Arabic, Danish, or other random languages. This is a fundamental limitation that blocks the Urdu phone emergency intake use case.

**Recommendation:** A different ASR provider is required for Urdu support. Alibaba can remain the AI brain (Qwen reasoning, case extraction, emergency analysis), but ASR must be replaced or supplemented for Urdu.

---

## 1. ASR Model Correction

### ✅ COMPLETED
- **Old model:** `qwen-asr-turbo` (returned 404)
- **New model:** `qwen3-asr-flash` (working)
- **API endpoint:** DashScope native multimodal generation
  - Endpoint: `{workspaceBase}/api/v1/services/aigc/multimodal-generation/generation`
  - Header: `X-DashScope-SSE: disable`
  - Request format: `{"model":"qwen3-asr-flash","input":{"messages":[{"role":"user","content":[{"audio":"data:audio/wav;base64,..."}]}]}}`
  - Response format: `{"output":{"choices":[{"message":{"content":[{"text":"..."}]}}]}}`

### Environment Variables
```
ALIBABA_ASR_MODEL=qwen3-asr-flash
ALIBABA_TTS_MODEL=qwen3-tts-flash
ALIBABA_FAST_MODEL_NAME=qwen-turbo
```

---

## 2. Urdu ASR Live Testing Results

### ❌ FAILED — Urdu ASR Not Supported

**Test Method:** Round-trip TTS→ASR (generate Urdu speech with TTS, transcribe with ASR)

| Test Case | Input | ASR Output | Language Detected | Keywords Found | Result |
|-----------|-------|------------|-------------------|----------------|--------|
| **A. English Emergency** | "My mother is unconscious. We are near Gulshan Block 7." | "My mother is unconscious. We are near Gulshan Block Seven." | English | 2/2 (100%) | ✅ PASS |
| **B. Urdu Emergency** | "یہ صرف ایک ٹیسٹ ہے، میری والدہ بے ہوش ہیں۔" | "Ja, så foræg, det er her Mary Wildeberg højt hi." | Danish | 0/3 (0%) | ❌ FAIL |
| **C. Urdu Location** | "ہم گلشن بلاک سات میں ہیں اور ہمیں ایمبولینس چاہیے۔" | "嗯，感谢Black Sat Mi V或Mi Imulin斯加伊。" | Chinese | 0/3 (0%) | ❌ FAIL |
| **D. Roman Urdu** | "Ye sirf test hai, meri walida behosh hain aur ambulance chahiye." | "Yusuf Teshay Mary Walida Bihoche O ambulance shai." | English | 2/4 (50%) | ⚠️ PARTIAL |
| **E. Mixed Urdu/English** | "Ye test call hai, meri mother behosh hain and ambulance urgently chahiye." | "ये टेस्ट का है मारी मदर बेहोश हैं एंड एन एंबुलेंस अर्जेंटली चाहिए।" | Hindi (Devanagari) | 0/4 (0%) | ❌ FAIL |
| **F. Urdu Greeting** | "یہ خدمت کنیکٹ اے آئی ایمرجنسی اسسٹنٹ ہے۔" | "já þá þú kannið að eyða marga gæsir á sæstustu stöðum." | Icelandic | 0/3 (0%) | ❌ FAIL |
| **G. Urdu Confirmation** | "آپ کی درخواست محفوظ ہو گئی ہے۔ براہِ کرم اپنی لوکیشن بتائیں۔" | "هَب که درخت محو و از هاگهه، بله که هم اپنیو کیشن بتهین." | Arabic | 0/2 (0%) | ❌ FAIL |

### Key Findings
- **English ASR:** Perfect (100% keyword preservation)
- **Urdu script ASR:** Completely fails — transcribes to random languages (Danish, Chinese, Hindi, Icelandic, Arabic)
- **Roman Urdu ASR:** Partial success (50% keywords) — some English words survive ("ambulance", "walida")
- **Mixed Urdu/English ASR:** Fails — transcribes to Hindi Devanagari script

### Conclusion
**qwen3-asr-flash does NOT support Urdu.** Urdu is not in the official supported language list (30 languages including Hindi and Arabic, but not Urdu). The model attempts to transcribe Urdu audio but maps it to the closest supported language (Hindi, Arabic, or even unrelated languages).

**Emergency meaning is NOT preserved for Urdu callers.** A Pakistani caller speaking Urdu will have their speech transcribed as Chinese, Arabic, or Danish — completely unintelligible to the system.

---

## 3. Alternative ASR Models Tested

### ❌ NONE AVAILABLE

Tested 10 candidate models in our Singapore workspace:

| Model | Status | Notes |
|-------|--------|-------|
| `qwen3-asr-flash` | ✅ Working | Only working real-time ASR |
| `qwen3-asr-flash-2025-09-08` | ✅ Working | Same as above (stable alias) |
| `qwen3-asr-flash-realtime` | ⚠️ Exists | Returns empty transcripts |
| `fun-asr` | ⚠️ Exists | Async-only (403 "does not support synchronous calls") — not suitable for phone |
| `fun-asr-realtime` | ❌ 400 | Different API format, not compatible |
| `qwen2-asr` | ❌ 404 | Model not found |
| `qwen-asr-plus` | ❌ 404 | Model not found |
| `paraformer-realtime-v2` | ❌ 404 | Model not found |
| `paraformer-v2` | ❌ 404 | Model not found |
| `sensevoice-v1` | ❌ 404 | Model not found |

### Conclusion
**No alternative Alibaba ASR models are available for Urdu.** The only working real-time ASR is `qwen3-asr-flash`, which does not support Urdu.

**fun-asr** exists but is async-only (batch file transcription), not suitable for real-time phone calls.

---

## 4. TTS Live Testing Results

### ✅ COMPLETED — Urdu TTS Works (Needs Listening Evaluation)

**Model:** `qwen3-tts-flash`  
**API endpoint:** DashScope native multimodal generation  
**Voice:** Cherry (female)

### Test Results

| Test Case | Text | Latency | Audio Size | Status |
|-----------|------|---------|------------|--------|
| English greeting | "This is KhidmatConnect AI Emergency Assistant." | 1833ms | 157KB | ✅ Generated |
| Urdu greeting | "یہ خدمت کنیکٹ اے آئی ایمرجنسی اسسٹنٹ ہے۔" | 2049ms | 181KB | ✅ Generated |
| Urdu follow-up | "آپ کی درخواست محفوظ ہو گئی ہے۔ براہِ کرم اپنی لوکیشن بتائیں۔" | 1617ms | 277KB | ✅ Generated |
| Urdu acknowledgement | "جی، میں آپ کی معلومات محفوظ کر رہا ہوں۔" | 1122ms | 188KB | ✅ Generated |
| Mixed Urdu/English | "آپ کی emergency request محفوظ ہو گئی ہے۔" | 1506ms | 150KB | ✅ Generated |
| Urdu completion | "آپ کی ہنگامی درخواست درج کر لی گئی ہے اور کوآرڈینیٹر کو بھیجی جا رہی ہے۔" | 2142ms | 426KB | ✅ Generated |
| English completion | "Your emergency request has been recorded..." | 1592ms | 303KB | ✅ Generated |
| Urdu emergency | "میری والدہ بے ہوش ہیں۔ ہم گلشن بلاک سات میں ہیں۔" | 1410ms | 269KB | ✅ Generated |

### Audio Samples
**Location:** `scripts/tts-samples/` (8 WAV files)

**Listen to these files to evaluate Urdu TTS quality:**
- `01-english-greeting.wav`
- `02-urdu-greeting.wav`
- `03-urdu-followup.wav`
- `04-urdu-acknowledgement.wav`
- `05-mixed.wav`
- `06-urdu-completion.wav`
- `07-english-completion.wav`
- `08-urdu-emergency.wav`

### Key Findings
- **Urdu TTS produces audio** — the model accepts Urdu text and generates WAV files
- **Latency:** 1.1-2.1 seconds (acceptable for phone)
- **Audio size:** 150-426KB (reasonable)
- **Language mapping:** Urdu uses `language_type: "Auto"` (not in official supported list)

### Conclusion
**Alibaba qwen3-tts-flash CAN generate Urdu audio**, but quality requires listening evaluation. The model does not officially list Urdu in supported languages, but it produces audio for Urdu text.

**Pronunciation quality unknown** — requires human listening evaluation of the saved WAV files.

---

## 5. TTS Fallback Evaluation

### ⚠️ NOT YET EVALUATED

If Alibaba TTS Urdu quality is poor, fallback options:
1. **Twilio `<Say>`** — Limited Urdu voice support
2. **Google Cloud TTS** — Excellent Urdu support (Wavenet voices)
3. **Azure Cognitive Services TTS** — Excellent Urdu support
4. **ElevenLabs** — Good multilingual support

**Recommendation:** Listen to Alibaba TTS samples first. If quality is acceptable, keep Alibaba. If not, evaluate Google Cloud TTS as fallback (already has Pakistan Urdu voices).

---

## 6. Fast Conversation Model

### ✅ COMPLETED — Two-Model Strategy Implemented

**Fast model:** `qwen-turbo`  
**Full analysis model:** `qwen3.7-plus`

### Live Test Results

| Model | Latency | Response Quality | Language Matching |
|-------|---------|------------------|-------------------|
| **qwen-turbo** | 340-1124ms | Good | ✅ Matches caller language |
| **qwen-plus** | 720-1686ms | Better | ✅ Matches caller language |
| **qwen3.7-plus** | 9796ms+ | Excellent | ✅ But too slow for real-time |

### qwen-turbo Conversational Quality

| Input | Response | Latency | Quality |
|-------|----------|---------|---------|
| Urdu script: "میری امی بے ہوش ہیں۔" | "آپ کی امی کو چاہیے ہسپتال لے جائیں۔" | 1124ms | ✅ Urdu script response |
| Roman Urdu: "Meri ami behosh hain." | "Aap ka koi kharaab nahi hai. Kya madad chahiye?" | 490ms | ⚠️ Response doesn't match emergency |
| English: "My mother is unconscious." | "Call emergency services immediately." | 340ms | ✅ Perfect |
| Mixed: "Meri mother behosh hain, ambulance chahiye." | "Aapko ambulance chahiye, kya aapko koi saath dene wala hain?" | 500ms | ✅ Good Roman Urdu |

### qwen-plus Conversational Quality

| Input | Response | Latency | Quality |
|-------|----------|---------|---------|
| Urdu script: "میری امی بے ہوش ہیں۔" | "فوری طور پر 1122 یا 911 کال کریں۔" | 1686ms | ✅ Good, mentions emergency number |
| Roman Urdu: "Meri ami behosh hain." | "Ambulance bhejo—1122 ya 1022 dial karein." | 720ms | ✅ Actionable |
| English: "My mother is unconscious." | "Call 1122 immediately. Stay with her, check breathing..." | 731ms | ✅ Excellent |
| Mixed: "Meri mother behosh hain, ambulance chahiye." | "Ambulance bhej raha hoon. Aapki location bataiye?" | 758ms | ✅ Perfect |

### qwen3.7-plus Full Analysis (Async)

**Latency:** 9796ms (~10 seconds)  
**Quality:** Excellent structured analysis

```
Category: Medical Emergency
Urgency: Critical
Location: Gulshan Block 7
Action: Dispatch ambulance immediately
```

### Implementation

**Two-model strategy implemented in `voiceOrchestration.ts`:**

1. **Fast model (qwen-turbo)** runs synchronously during call turn (~300-500ms)
   - Generates immediate conversational response
   - Language matching (Urdu script, Roman Urdu, English)
   - Short follow-up questions

2. **Full analysis (qwen3.7-plus)** runs asynchronously (~10s)
   - Fire-and-forget after fast response sent
   - Deep structured emergency enrichment
   - Category, urgency, location extraction
   - Operator-quality summary

**Code:** `src/lib/ai/fastVoiceConversation.ts`

### Conclusion
**qwen-turbo is suitable for fast voice turns** (340-500ms latency, good language matching).  
**qwen3.7-plus is suitable for async full analysis** (10s latency, excellent quality).

---

## 7. No Long Silence

### ✅ COMPLETED — Acknowledgement Implemented

**Problem:** qwen3.7-plus takes ~10s for full analysis → caller hears silence

**Solution:** Fast model (qwen-turbo) responds immediately (~500ms) with acknowledgement

**Example flow:**
```
Caller: "Meri walida behosh hain."
AI (fast model, 500ms): "Aapki location kya hai?"
[Meanwhile, qwen3.7-plus runs async for 10s to enrich case]
Caller: "Gulshan Block 7."
AI (fast model, 500ms): "Aapki emergency request محفوظ ہو گئی ہے۔"
```

**Static acknowledgement fallback:**
- Urdu: "جی، میں آپ کی معلومات محفوظ کر رہا ہوں۔"
- English: "Okay, I am recording your emergency information."

**Code:** `buildAcknowledgementText()` in `alibabaTts.ts`

---

## 8. Target Phone Experience

### ⚠️ BLOCKED — Urdu ASR Not Working

**Desired flow (Urdu call):**
```
AI: "یہ خدمت کنیکٹ اے آئی ایمرجنسی اسسٹنٹ ہے۔ براہِ کرم بتائیں کیا ایمرجنسی ہے؟"
Caller: "میری امی بے ہوش ہیں۔"
[ASR should transcribe → "میری امی بے ہوش ہیں"]
AI: "جی، براہِ کرم اپنی لوکیشن یا قریب ترین نشان بتائیں۔"
Caller: "ہم گلشن بلاک سات میں ہیں۔"
[ASR should transcribe → "ہم گلشن بلاک سات میں ہیں"]
AI: "آپ کی ایمرجنسی درخواست محفوظ ہو گئی ہے..."
```

**Actual flow (with qwen3-asr-flash):**
```
AI: "یہ خدمت کنیکٹ اے آئی ایمرجنسی اسسٹنٹ ہے۔ براہِ کرم بتائیں کیا ایمرجنسی ہے؟"
Caller: "میری امی بے ہوش ہیں۔"
[ASR transcribes → "Ja, så foræg, det er her Mary Wildeberg højt hi." (Danish)]
AI: [Confused, asks for location in Danish/Chinese/Arabic]
Caller: [Confused, hangs up]
```

**Conclusion:** The target Urdu phone experience is NOT achievable with qwen3-asr-flash.

---

## 9. Existing Safety Work

### ✅ PRESERVED

All Milestone 9 safety architecture intact:
- ✅ Case created before AI
- ✅ CallSid idempotency
- ✅ RecordingSid idempotency
- ✅ Transcript persisted before Qwen
- ✅ Call-drop resilience
- ✅ Masked phone numbers
- ✅ Twilio signature validation
- ✅ No recording URL persistence
- ✅ Operator voice visibility
- ✅ Demo/live separation
- ✅ TTS fallback
- ✅ No raw token leakage

**Tests:** 215 voice tests pass (81 offline + 89 mock + 45 DB)

---

## 10. Live Model Discovery

### ✅ COMPLETED

**Confirmed working models in Singapore workspace:**

| Model | Purpose | Call Success | Latency |
|-------|---------|--------------|---------|
| `qwen3-asr-flash` | ASR | ✅ | 500-1200ms |
| `qwen3-tts-flash` | TTS | ✅ | 1100-2100ms |
| `qwen-turbo` | Fast conversation | ✅ | 340-1124ms |
| `qwen-plus` | Better conversation | ✅ | 720-1686ms |
| `qwen3.7-plus` | Full analysis | ✅ | 9796ms+ |

**Unavailable models:**
- `qwen2-asr`, `qwen-asr-plus`, `paraformer-v2`, `sensevoice-v1` — 404 (don't exist)
- `fun-asr` — async-only (not suitable for phone)
- `qwen3-asr-flash-realtime` — returns empty transcripts

---

## 11. Final Model Decision Table

| Component | Model | Purpose | Urdu Quality | English Quality | Mixed Quality | Latency | Recommendation |
|-----------|-------|---------|--------------|-----------------|---------------|---------|----------------|
| **ASR** | `qwen3-asr-flash` | Speech→Text | ❌ FAILS (transcribes to Chinese/Arabic/Danish) | ✅ Perfect (100%) | ❌ FAILS | 500-1200ms | **REJECT for Urdu** — use only for English |
| **TTS** | `qwen3-tts-flash` | Text→Speech | ⚠️ Produces audio (needs listening eval) | ✅ Perfect | ⚠️ Unknown | 1100-2100ms | **KEEP** — evaluate Urdu quality |
| **Fast Voice** | `qwen-turbo` | Conversational turns | ✅ Good (Urdu script + Roman Urdu) | ✅ Perfect | ✅ Good | 340-1124ms | **KEEP** — best for fast turns |
| **Full Analysis** | `qwen3.7-plus` | Deep enrichment | ✅ Excellent | ✅ Excellent | ✅ Excellent | 9796ms+ | **KEEP** — async only |

---

## 12. Final Report

### ASR Models Tested
- `qwen3-asr-flash` — English ✅, Urdu ❌, Roman Urdu ⚠️
- `qwen3-asr-flash-2025-09-08` — Same as above
- `qwen3-asr-flash-realtime` — Empty transcripts
- `fun-asr` — Async-only (not suitable)
- 6 other candidates — 404 (don't exist)

### Best Urdu ASR Result
**NONE** — qwen3-asr-flash transcribes Urdu to Chinese/Arabic/Danish/Icelandic. Emergency meaning NOT preserved.

### Best Roman Urdu Result
**50% keyword preservation** — "ambulance" and "walida" survived, but transcribed as English with phonetic spelling.

### Best Mixed Result
**FAILED** — Mixed Urdu/English transcribed to Hindi Devanagari script.

### TTS Models Tested
- `qwen3-tts-flash` — Generates Urdu audio (8 samples saved for evaluation)

### Can Alibaba TTS Genuinely Speak Urdu?
**UNKNOWN** — Produces audio, but pronunciation quality requires human listening evaluation.  
**Audio samples:** `scripts/tts-samples/*.wav`

### Selected TTS Solution
**qwen3-tts-flash** (pending listening evaluation)  
**Fallback:** Google Cloud TTS (if Urdu quality is poor)

### Fast Qwen Model Tested
- `qwen-turbo` — 340-1124ms, good language matching
- `qwen-plus` — 720-1686ms, better quality

### Conversational Latency
- **Fast model (qwen-turbo):** 340-1124ms ✅
- **Full analysis (qwen3.7-plus):** 9796ms+ (async, doesn't block caller)

### Full Analysis Latency
- **qwen3.7-plus:** ~10 seconds (acceptable for async enrichment)

### Final Recommended Voice Stack

**IF URDU IS NOT A HARD REQUIREMENT:**
```
Phone transport: Twilio
ASR: qwen3-asr-flash (English only)
Fast voice: qwen-turbo
Full analysis: qwen3.7-plus (async)
TTS: qwen3-tts-flash
```

**IF URDU IS A HARD REQUIREMENT (current spec):**
```
Phone transport: Twilio
ASR: [REQUIRES DIFFERENT PROVIDER — Google/Azure/Whisper/Deepgram]
Fast voice: qwen-turbo
Full analysis: qwen3.7-plus (async)
TTS: qwen3-tts-flash (pending evaluation) or Google Cloud TTS
```

### Code Changes Required

**Implemented:**
- ✅ `alibabaAsr.ts` — Corrected API endpoint + response parsing
- ✅ `alibabaTts.ts` — Corrected API endpoint + Urdu support
- ✅ `fastVoiceConversation.ts` — New fast voice module (qwen-turbo)
- ✅ `voiceOrchestration.ts` — Two-model strategy (fast + async)
- ✅ `.env.example` — Added `ALIBABA_FAST_MODEL_NAME`
- ✅ All tests pass (215 voice tests + 109 AI tests + 38 verify tests)

**NOT YET IMPLEMENTED:**
- ⚠️ Alternative ASR provider integration (if Urdu required)
- ⚠️ TTS listening evaluation (human evaluation needed)
- ⚠️ TTS fallback to Google Cloud TTS (if Alibaba Urdu quality poor)

### Remaining Twilio/Public Webhook Blocker
- Twilio webhook URLs must be publicly accessible (ngrok or deployed)
- Signature validation implemented but not tested with live Twilio webhooks

### Tests/Build Status
- ✅ TypeScript compile: Clean (0 errors)
- ✅ Voice offline tests: 81/81 pass
- ✅ Voice mock tests: 89/89 pass
- ✅ Voice DB tests: 45/45 pass
- ✅ AI verify tests: 109/109 pass
- ✅ Core verify tests: 38/38 pass
- ✅ Total: **362 tests pass**

---

## Critical Question: Can a Pakistani Caller Speak Naturally in Urdu?

### ❌ NO — Not with current Alibaba ASR

**Answer:** A Pakistani caller speaking Urdu will have their speech transcribed to Chinese, Arabic, Danish, or other random languages. The emergency meaning is NOT preserved. The caller will be confused and the system will fail.

**Root cause:** `qwen3-asr-flash` does not support Urdu. Urdu is not in the official supported language list.

**Solution required:** Replace or supplement Alibaba ASR with a provider that supports Urdu:
- **Google Cloud Speech-to-Text** — Excellent Urdu support
- **Azure Cognitive Services Speech** — Excellent Urdu support
- **OpenAI Whisper** — Good Urdu support
- **Deepgram** — Limited Urdu support

**Recommendation:** Keep Alibaba as the AI brain (Qwen reasoning, case extraction, emergency analysis), but use a different ASR provider for Urdu phone intake.

---

## Next Steps (DO NOT COMMIT YET)

1. **DECISION REQUIRED:** Is Urdu ASR a hard blocker for the demo?
   - If YES → Integrate alternative ASR provider (Google/Azure/Whisper)
   - If NO → Proceed with English-only ASR

2. **TTS EVALUATION:** Listen to `scripts/tts-samples/*.wav` files
   - If Urdu quality acceptable → Keep Alibaba TTS
   - If Urdu quality poor → Integrate Google Cloud TTS fallback

3. **LIVE TWILIO TEST:** Once ASR decision made, test end-to-end with real Twilio call

4. **CODE REVIEW:** Review two-model strategy implementation

5. **COMMIT:** Only after Urdu ASR decision and TTS evaluation complete

---

**Report compiled:** August 31, 2026  
**Branch:** feature/twilio-voice-integration  
**Status:** Testing complete — awaiting Urdu ASR decision
