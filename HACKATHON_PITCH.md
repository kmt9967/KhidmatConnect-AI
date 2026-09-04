# HACKATHON_PITCH.md — KhidmatConnect AI

Three lengths, same spine: **real problem -> real call -> real coordination -> human decides.**
Every claim below is backed by something that exists and runs; nothing here needs a "coming soon" footnote.

---

## 1. 30-second elevator pitch

> When your mother stops breathing in Gulshan-e-Iqbal at 2 a.m., you don't fill in an English web form and you don't know the latitude. You call someone. In Pakistan that call lands in a hotline queue, a WhatsApp group, or an NGO volunteer's memory - and the ambulance that already exists in the city gets dispatched by guesswork.
>
> **KhidmatConnect AI** is the missing coordination layer. A caller speaks **Urdu** to a phone line. An emergency case is created **before any AI touches it**. **Alibaba Qwen** triages it - urgency, category, what's missing. A **human coordinator** sees everything on one screen, assigns a real ambulance, and the family watches the unit move toward them on a live link.
>
> It's live, and a real Urdu phone call proved it end to end.

*(~85 words. Deliver in 30 s with the case code visible on screen.)*

---

## 2. 90-second pitch

**The problem (20 s).**
Pakistan handles floods, fires, road trauma and cardiac events with the same infrastructure: phone calls into overloaded hotlines, and NGOs coordinating on paper. Three things break simultaneously - **language**, because the person in distress speaks Urdu or Roman Urdu; **location**, because "Block 7, third gali, near the mosque" is not a coordinate; and **coordination**, because the ambulance, the shelter, the ration team and the family all have different versions of the truth. Help exists. Awareness of it doesn't.

**The insight (10 s).**
You don't need another AI that answers questions. You need **intake, triage and coordination infrastructure** that can take what a frightened person actually says - in Urdu, over the phone - and turn it into a structured, auditable case a human can act on in seconds.

**What we built (35 s).**
KhidmatConnect AI has two doors and one lifecycle. The web form takes a report with no login at all. The phone line takes a real call through Twilio into Retell, which handles the speech - listening, turn-taking, answering in Urdu. The moment the call connects, we **pre-create the case**; the voice agent calls our `update_case` tool, which returns in tens of milliseconds and stores only what the caller actually said, verbatim. Then **Alibaba Cloud Model Studio's Qwen** reads that raw text asynchronously and returns structured triage: urgency, categories, key needs, special needs, people affected, **what information is missing**, and one follow-up question the operator can ask word for word. A human operator reviews it and assigns a named responder and a specific ambulance. The responder accepts, goes en route, arrives, completes - streaming live GPS. The family follows the same status on a shareable link, no app, no account.

**The safety line (15 s).**
We hold two rules in code, not in intention: **capture first** - if Qwen is down, the emergency is still recorded and flagged for human review; and **no false dispatch** - the AI cannot promise an ambulance, and the voice agent is only allowed to say help is coming when a real assignment row exists in the database. AI advises. Humans commit resources.

**Proof and ask (10 s).**
It's deployed and it works: a real phone call, case **KC-2026-000018** - eight Urdu transcript turns persisted, CRITICAL / RESCUE triage from Qwen, operator assignment, completed. What we're asking for is the flood-affected districts and an NGO partner to run it with.

*(~430 words.)*

---

## 3. 3-minute full pitch

### Hook - the 2 a.m. call (20 s)

It's 2 a.m. in Gulshan-e-Iqbal, Karachi. An elderly woman collapses. Her son has one bar of signal, no idea what a latitude is, and the sentence he can say out loud is in Urdu: *"meri amma behosh ho gayi hain, please ambulance bhejein."*

He is not going to fill in an English form. He is going to call. And on the other side of that call is usually a person with a notebook, a queue of other calls, and no way to tell the family anything except "wait."

### Why this is still unsolved (25 s)

The responders in Pakistan are genuinely brave and genuinely under-instrumented. Government emergency services are saturated at national scale. NGOs like Alkhidmat run real ambulances, real shelters, real ration and water points - and coordinate them with phone trees and spreadsheets. The failure is not effort. It's the absence of a shared, structured picture of **who needs what, where, how urgently, and who is already moving**.

Three gaps, always at the same time:
- **Language gap** - the systems that exist speak English and expect typing.
- **Location gap** - half of every rescue's delay is spent resolving an address that a human already understands.
- **Coordination gap** - no requester, operator, and responder are looking at the same status.

### What we built (50 s)

**KhidmatConnect AI** is humanitarian intake, triage and coordination infrastructure. Two doors in, one auditable lifecycle out.

**Door one:** a no-login web form, bilingual and RTL-aware, with optional browser GPS - and a manual location fallback, because a landmark is enough to start.

**Door two, the harder one:** a real phone call. The caller's number arrives on a Twilio number, rides an Elastic SIP Trunk into **Retell**, which owns real-time speech - turn-taking, Urdu ASR, a voice that answers back in the caller's language.

Two design decisions make that trustworthy:

1. **Capture first.** The instant the call starts we pre-create a provisional emergency case. As the agent extracts facts it calls our `update_case` tool, which persists only what the caller said and returns in tens of milliseconds - the caller never waits on our analysis.
2. **The raw transcript is the authority.** Urdu stays Urdu, mixed Urdu-English stays exactly as spoken. Every utterance is stored with its speaker and order, and repeated or cumulative provider deliveries create zero duplicates.

Then **Alibaba Cloud Model Studio - Qwen** - does the thinking, asynchronously: structured triage JSON with urgency, categories, key needs, special needs, people affected, **missing information**, a confidence score, and one follow-up question the operator can ask verbatim. Fingerprint deduplication means the same unchanged facts never trigger a second analysis.

Downstream, a human operator sees all of it in the command center with Google Maps context, and assigns a **specific responder and a specific ambulance** - availability enforced so a unit can't be double-booked. The responder accepts, goes en route, arrives, completes, streaming live GPS. The family gets a link - `/case/KC-2026-000018?t=...` - that shows reviewed, assigned, en route with the ambulance moving on a map, arrived, completed. No app. No account. No rumor mill.

### The part we'd be judged on (35 s)

An AI in an emergency loop can do two kinds of damage: it can **delay help**, or it can **lie about help**.

So: **AI never blocks creation** - Qwen outage is a tested path; the case survives, the transcript survives, the case is flagged for a human. And **no false dispatch** - the voice agent is instructed never to claim an ambulance is coming, and the text it's allowed to speak is generated from an actual database check for a live Assignment. Tests assert the forbidden phrases. AI advises; a named human commits a resource, and that decision is written into an audit timeline with actor and timestamp.

We also refuse to overclaim on purpose: this does **not** replace 1122. It is the intake, triage and coordination layer that makes NGOs, relief teams and community responders faster and better informed - and that any agency can plug into.

### Proof, market, and what's next (35 s)

**Proof:** deployed and working. Real inbound phone call, case **KC-2026-000018** - caller number captured, **8 transcript turns persisted in Urdu**, Qwen triage **CRITICAL / RESCUE + MEDICAL** visible on the operator dashboard, no false dispatch, call completed. 114 passing assertions on the voice adapter alone, a clean TypeScript production build, and a webhook endpoint that returns 401 to unsigned requests - verified live.

**Scale:** the same case object serves a flood displacement report, a building fire, a road-accident trauma, a ration request, and a maternity transfer - all of which are already in our seeded demo set because they're what Pakistan actually files. During a flood, the intake channel is the one that survives: a phone call works when the network is congested and the form is unreachable.

**Next:** partner with an NGO field operation, formalize hotline routing, add outbound status notifications to families, and measure Urdu triage precision as real calls accumulate.

**Close:** We didn't build a chatbot and look for a use case. We built one dignified path from *"I need help"* to *"help has arrived"* - in the language people actually speak, with a human still holding the steering wheel.

*(~880 words / ~3 minutes at presentation pace.)*

---

## Speaker notes

- **Say the case code out loud.** KC-2026-000018 is the difference between "prototype" and "product." If you only get one memorable fact, that's it.
- **Never say "AI decides."** The line is "AI supports the coordinator, a human dispatches." It is both the safety story and the differentiator.
- **If a judge hears "Retell + Twilio + Qwen = lots of vendors,"** answer the architecture in one breath: Retell carries the voice, Qwen does the thinking, our database holds the truth, a human makes the decision.
- **Numbers that land:** 2 intake channels, 13 data models, 8 lifecycle stages, 114 voice-adapter assertions, tens of milliseconds tool response, 8 real transcript turns from a real phone call.
- **Do not** demo by waiting on a spinner. Have the operator queue already open.
- **Positioning sentence to reuse verbatim:** *"AI-enabled humanitarian intake, triage and coordination infrastructure for NGOs, relief organizations, communities and emergency-response partners - not a replacement for official emergency services."*
