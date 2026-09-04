# JUDGE_QA.md — KhidmatConnect AI

Prepared answers. Every claim is verifiable in the repo or on the deployed site. Keep answers to 2-4 sentences unless pressed.

> **Standing positioning sentence (use it in almost every answer):**
> KhidmatConnect does **not** claim to replace Pakistan's official emergency services. It is **AI-enabled humanitarian intake, triage and coordination infrastructure** that supports NGOs, relief organizations, communities and emergency-response partners.

---

## 1. Why does this need AI at all?

Because the input is unstructured human panic in Urdu, and the output has to be a structured, prioritized, actionable case. A person has to read the whole story, decide urgency, notice that "8 log hain, 4 bachay, 2 buzurg" means dependents and a shelter rather than an ambulance, and spot that nobody said which street. Qwen does that reading in one pass and hands the coordinator a filled-in triage sheet plus an explicit list of what is still missing. Without it, that work happens manually at exactly the moment the queue is longest.

## 2. Why Alibaba Qwen specifically?

Three practical reasons. It's strong on multilingual and code-mixed text, which is what real Pakistani input looks like (Urdu script, Roman Urdu, English medical words in one sentence). It exposes an OpenAI-compatible endpoint, so we integrated it in an hour with strict Zod-validated JSON output rather than praying over prose. And in a hackathon whose theme is Alibaba Cloud, we wanted the decision-support engine of the product to be the platform's model, not a bolt-on demo - so Qwen is on the critical triage path, not decorative. Concretely: `qwen3.7-plus` for deep structured analysis, `qwen-turbo` for fast conversational turns, and `qwen3-asr-flash` / `qwen3-tts-flash` for Urdu speech on our earlier Twilio prototype path.

## 3. What happens if AI fails?

Nothing is lost, because the emergency was recorded before AI ran. On the web path, if Qwen errors or times out, we write `AI_ANALYSIS_FAILED`, flag the case for human review, and still return HTTP 201 with the case code. On the voice path, the tool call returns in tens of milliseconds regardless, and a Qwen outage was tested with a throwing mock - the caller still got a successful response and the case plus full transcript survived. The coordinator then sees the raw words, which is by design the authoritative record. So the failure mode of the AI is "a human reads it themselves," never "someone's emergency disappears."

## 4. Can AI dispatch an ambulance automatically?

No, and there's no code path for it. Dispatch requires an `Assignment` row created by an authenticated operator through `/api/operator/cases/[caseCode]/assign`. Qwen's output only writes advisory fields (`urgency`, `aiSummary`, `keyNeeds`, `missingInformation`...). We also close the inverse risk: the voice agent cannot *say* help is coming unless a real assignment exists - that text is generated from a live database check, and tests assert that phrases like "dispatched", "on the way", "has been assigned", "is coming" never appear in caller-facing speech without one.

## 5. What happens if the location is wrong?

Two protections. First, location **confidence is explicit state**: `locationConfirmed` and `locationAccuracy` are stored and surfaced, so an operator sees "approximate" rather than trusting a bad pin. Second, a missing or denied GPS never blocks the case - a landmark, block name, or "near the mosque" is enough to create it, and Google reverse-geocoding is used to resolve text addresses into coordinates when available. Wrong-location risk is a human-decision problem, so we hand the human the provenance: what the caller literally said, what the GPS said, and whether they agree.

## 6. How do you handle Urdu?

Four layers. The UI is bilingual with real RTL (`dir=rtl` per page) rather than a translation toggle bolted on. Voice intake answers in the caller's language through Retell. **Critically, we never normalize the transcript** - Urdu stays Urdu, and code-mixed "ambulance bhejein" stays exactly as spoken, byte-for-byte; we only store a language *tag* (`ur` / `en` / `ur-en`) alongside it. And Qwen reads the raw text and produces English triage for the coordinator, so the language barrier stops costing response time but the original words are preserved as the authoritative record.

## 7. Why Retell?

Because real-time speech is a solved, boring problem that we should not have solved ourselves. Turn-taking, barge-in, latency and Urdu voice are what make or break a caller's experience, and building that from raw audio would have eaten the hackathon. Retell gives us that layer plus SIP connectivity and calls **our** tool for **our** data. We kept the boundary strict: Retell carries the conversation, our database holds the truth, and Retell's own call summary is stored clearly labelled as reference-only, never as an authoritative fact.

## 8. Why Twilio?

Because the phone number and the Elastic SIP Trunk are what let a normal mobile phone in Karachi reach the agent. The caller isn't opening our website - they're dialing a number, which is what a distressed person actually does. Twilio terminates that call onto Retell over SIP. Our earlier Twilio-native prototype (record -> ASR -> TTS) is preserved untouched as a legacy fallback path, so if Retell were unavailable the telephony investment isn't thrown away.

## 9. How is this different from calling 1122?

1122 is the answer, not the competitor - we send people to it and we don't replace it. What 1122 doesn't have in the places we looked is a shared, structured, auditable picture across *all* the responders: NGO ambulances, shelter teams, ration and water points, and the family waiting at home. KhidmatConnect is that coordination layer. It also gives an entry point that works in Urdu without a call-center queue, keeps the caller's own words as the record, and gives the family a live status link instead of a repeated call back to a busy number.

## 10. Is this intended to replace 1122?

No. Explicitly not. Official emergency services remain the operational authority - this is intake, triage and coordination infrastructure that NGOs, community responders and relief organizations can run, and that an agency could plug into if they wanted to. If a call needs 1122, the coordinator routes it to 1122 faster and with better information. Our positioning sentence is deliberate: *support the responders, don't replace them.*

## 11. How does this help NGOs such as Alkhidmat?

Directly, because our data model *is* their operation. The seeded resource catalog mirrors what Alkhidmat-style field operations actually run: ambulances with identifiers like AKF-07, shelters with capacity, food distribution points, water points, rescue teams. An NGO gets Urdu-first intake, prioritized triage, unit assignment with availability enforcement so a vehicle can't be double-booked, a per-case audit timeline for accountability, and a live family-facing status page that removes the "kya help aa rahi hai?" call volume from their own staff. During floods that's the difference between 40 volunteers with notebooks and 40 volunteers with one queue.

## 12. What about floods and earthquakes?

The same case object already carries them - our demo set includes a family of eight stranded on a rooftop in Malir for two days without food or water, a flood-displaced family of eight at a bus stop needing shelter, a building fire with children trapped, and a road-accident trauma. Structurally, disasters stress exactly what we hardened: intake survives network congestion because a phone call still works; capture-first means a partially described emergency is still a case; the `NEEDS_INFORMATION` status is the designed home for the ambiguous location a flood creates; and multi-resource assignment (boat rescue + medical standby + shelter) is one operator action rather than three phone trees. What we'd add at scale is region-scoped queues and a mass-casualty triage mode - listed as future scope, not claimed as done.

## 13. How do you prevent hallucinations?

By shrinking the space where hallucination could matter. Qwen's output is a **strict, Zod-validated JSON contract** - fixed enums for urgency and category - not free prose, so it can't invent a lifecycle state. It writes only advisory fields and cannot write facts: `originalMessage`, the transcript, `locationText`, `peopleAffected` come from what the caller actually said. It must list `missingInformation` explicitly, which converts "confidently wrong" into "flagged as unknown." And a human operator sees the raw words next to the recommendation, with `confidence` attached. Finally, our transcript dedup parser never rewrites provider text - we only consume role prefixes, so what the caller said is exactly what's stored.

## 14. How do you protect caller information?

Practically. Secrets never reach the browser - we ran strict artifact scans over the deployed bundle three times; the only client-side key is the public `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, and the Maps server key is separate. Case tracking uses a random token stored **as a SHA-256 hash** with a 90-day expiry; the requester's public page returns deliberately requester-safe payloads with no internal AI reasoning or other cases. Sessions are `httpOnly`, `secure` in production, `sameSite=lax` JWTs signed with a mandatory `SESSION_SECRET`, and every mutating or detail API is role-guarded (`requireRole('OPERATOR'|'RESPONDER')` on case detail, assign, notes, responder status and location). Voice webhooks are HMAC-SHA256 verified with constant-time comparison and **fail closed** if the key is absent - an unsigned request gets 401, verified on production. We do not store call audio in our database on the Retell path, and demo data is clearly fictitious.

What I'd also tell you unprompted, because it's a real gap and not yet closed: three **read-only** surfaces are unauthenticated by design-for-demo - the operator case list, `/api/resources`, and the `/api/realtime/cases/[caseCode]` polling endpoint - and case codes are sequential. That means status and unit positions are readable by anyone who guesses a code. It writes nothing and exposes no AI reasoning or personal data beyond a first-name responder, and closing it (token-or-session checks on those reads, non-sequential codes) is the first item in our security todo.

## 15. How scalable is it?

The bottleneck is a normal web/DB one, not an exotic one. Stateless Next.js route handlers scale horizontally; PostgreSQL with Prisma holds the case, audit and assignment data; the AI step is already **asynchronous and deduplicated by an input fingerprint**, so a spike in traffic doesn't multiply model calls - repeated deliveries of unchanged facts trigger zero extra analyses. Voice concurrency is a provider capacity and cost question (Retell), which is why the caller-facing path never blocks on our own analysis. During a flood event you'd add queue partitioning by region and outbound notifications. Honest caveat: on the web path, analysis currently runs inside the request, so a submission can take ~15-45 s before it returns; the voice path already behaves the way we'd want at scale.

## 16. What did you actually build vs mock?

Built and live: the whole response loop. Two intake channels (no-login web form; real phone call through Twilio SIP into Retell), the case + audit + assignment + GPS data model (13 Prisma models, 4 migrations), Qwen structured triage, operator command center, assignment with availability enforcement, responder accept/en-route/arrived/complete, live GPS, Google Maps geocode/reverse-geocode/route, the 10-second-polled family tracking link, HMAC-verified webhooks, and 114 passing assertions on the voice adapter.

Not built / presentational: the secondary pages `/dashboard`, `/nearby` and `/voice-ai` still render curated demo content - they're outside the judge demo path and we call that out rather than hiding it. Resource catalogs are seeded demo data, and outbound SMS/WhatsApp notifications to families don't exist. The AI never invents facts and the product never fakes a dispatch - both are enforced by tests, not by convention.

## 17. What is live in production?

The product itself: https://khidmatconnect.teqprotech.com, running the final code commit `590be90`. Both Retell endpoints are live and protected - an unsigned webhook POST returns 401, verified. And a **real phone call** ran through the whole chain: mobile phone -> Twilio number -> Twilio Elastic SIP Trunk -> Retell -> KhidmatConnect -> async Qwen -> operator dashboard. That case is **KC-2026-000018**: caller number captured, 8 transcript turns persisted with Urdu caller and AI turns visible, Qwen triage CRITICAL with RESCUE and MEDICAL categories, no false dispatch, call completed successfully. An earlier call, KC-2026-000015, is what surfaced the transcript-field and repeat-analysis bugs we then fixed.

## 18. What would you build next with more time?

In order of impact: (1) **outbound status notifications** to the requester - SMS or WhatsApp on each transition, which is the single biggest relief on NGO call volume; (2) **real NGO pilot data** - one organization, one district, two weeks, and measured Urdu ASR + triage precision on genuine calls; (3) **region-scoped queues and mass-casualty mode** for flood and earthquake events; (4) move the web path's analysis off the request like the voice path already is; (5) production credential hardening and rate limiting on public intake. We'd also finish wiring `/dashboard` and `/nearby` to live data - polish, not function.

---

## Rapid-fire fallbacks

| If a judge asks... | One-line answer |
|---|---|
| "Isn't this just a form + GPT?" | The form is trivial; the hard part is a phone call that creates a durable case before analysis, survives provider outages, never duplicates, and never lies about dispatch. All 114 assertions are about that. |
| "Show me the code you're proudest of." | `syncTranscriptFromCall` - it parses five different provider transcript shapes, keeps Urdu byte-exact, and makes cumulative redelivery idempotent with content-hash dedup keys. |
| "What broke in production?" | Two things: a `speaker` vs `role` field mismatch that stored zero transcript turns, and repeated triage runs. Both root-caused against official docs, fixed, and covered by tests. |
| "How long did the tool call take?" | Tens of milliseconds against a deliberately slow 3-second mock analyzer, measured in CI. |
| "Who is your user?" | The coordinator at an NGO dispatch desk, and the family with one bar of signal. |
| "What's the risk of AI getting urgency wrong?" | It's advisory, ranked not authoritative; a low-confidence flag surfaces to the human, who can also read the raw words. Missing information is listed rather than guessed. |

## Things we will not say

- We will not say AI dispatches ambulances. It doesn't, and the code path doesn't exist.
- We will not say we replace 1122 or any government service.
- We will not claim Alibaba ECS hosting is live - Model Studio/Qwen is what we actually use from Alibaba Cloud.
- We will not present `/dashboard`, `/nearby` or `/voice-ai` as wired-up product surfaces. They render demo content and we say so.
