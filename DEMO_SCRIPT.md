# DEMO_SCRIPT.md — KhidmatConnect AI Judge Demo (4–6 minutes)

Audience: hackathon judges · Runs on **deployed production**: `https://khidmatconnect.teqprotech.com`

> **Which environment, exactly (read this before rehearsing).** The **live phone call and the voice case must be demonstrated on production** - the Retell endpoints fail closed locally (`RETELL_API_KEY` is a server-side secret, and the `demo:seed` tooling refuses any non-localhost database by design). The **pre-seeded multi-stage fallback cases** described below exist only in the **local seeded DB** (`npm run demo:seed` + `npm run dev`). Recommended stage setup: production open for the live call and the real queue, a second browser profile on local dev holding the seeded lifecycle screens as instant fallback. Decide this before you walk in - see `FINAL_DEMO_CHECKLIST.md` §Environment decision.

Presenter: one driver + one narrator (or one person). Two browser windows pre-opened and logged-in:
- **Window A** = Operator (`/login` → *Operator Demo* → `/operator`)
- **Window B** = Responder, mobile-emulated (`/login` → *Responder Demo* → `/responder`)
- **Window C** (optional) = Requester tracking link, incognito, no login

> Golden rule: **never let the live demo depend on one fragile external call succeeding.** The scripted flow below has a pre-seeded fallback at every external hop. See §Fallbacks.

Demo anchors from `npm run demo:seed` (local seeded DB; see [POST_M9_FINAL_ROADMAP.md](./POST_M9_FINAL_ROADMAP.md) §C):
- **Responder "Ahmed Khan" (Ambulance AKF-07)** is deliberately left AVAILABLE to receive the live assignment.
- Operator queue already contains realistic cases across every lifecycle stage (including one VOICE case with an Urdu transcript) so the story never stalls.

---

## Timing at a glance

| # | Beat | Target | Channel |
|---|------|--------|---------|
| 1 | Landing + problem framing | 0:00–0:35 | Web |
| 2 | Reporting options explained | 0:35–1:00 | Web |
| 3 | **Live Urdu voice emergency** | 1:00–2:10 | Phone → Retell |
| 4 | Auto case + raw transcript | 2:10–2:45 | Operator |
| 5 | Alibaba Qwen triage | 2:45–3:15 | Operator |
| 6 | Operator assigns responder/ambulance | 3:15–3:45 | Operator |
| 7 | Responder accept → en route → arrived → complete | 3:45–4:30 | Responder |
| 8 | Requester live status updates | 4:30–4:55 | Web (no login) |
| 9 | Google Maps + location support | woven into 6–8 | Both |
| 10 | Human-in-the-loop safety close | 4:55–5:30 | Any |

---

## Step-by-step

### 1) Landing page — set the problem (0:00–0:35)
- **Open:** `https://khidmatconnect.teqprotech.com/`
- **Say:** "In Pakistan, emergencies — floods, fires, cardiac events — are reported across fragmented hotlines, WhatsApp groups and word of mouth, in Urdu, Roman Urdu and English. Help is real, but coordination is slow. KhidmatConnect AI is humanitarian **intake, triage and coordination infrastructure** for NGOs, relief teams and communities. It does **not** replace 1122 — it makes responders faster and better informed."
- **Show:** English ↔ Urdu toggle (top-right). Switch to Urdu to demonstrate RTL for one line, switch back.
- **Expected:** hero, "How it works", capabilities render; language toggle flips layout to RTL cleanly.

### 2) Reporting options (0:35–1:00)
- **Point at:** the red **"Request Help"** CTA (`/emergency`) and the hotline concept.
- **Say:** "There are two front doors to the same system: a **no-login web form** for anyone with a phone and data, and a **voice hotline** for callers who can't or don't want to type — especially Urdu speakers. Both create the exact same authoritative emergency case."
- **Note honestly:** web intake works without login; no sensitive data is stored in the browser — only a 90-day case tracking token.

### 3) Live Urdu voice emergency (1:00–2:10) — the hero moment
- **Action:** from a mobile phone, dial the **KhidmatConnect hotline** (the Twilio provisioned inbound number — insert the team's number on the demo card). Speakerphone on, judge-facing.
- **Caller says (Urdu / Roman Urdu), e.g.:** *"Assalam o Alaikum… meri amma behosh ho gayi hain, Gulshan Block 7 gali 3 mein, please ambulance chahiye."*
- **Retell agent** (voice) asks for the location and confirms; caller answers; agent acknowledges capture.
- **What's happening behind it (narrate briefly):** Retell owns real-time speech (listen/turn-taking/ASR/TTS). The instant the call starts, KhidmatConnect **pre-creates a provisional case (capture-first)**. As the agent extracts facts, it calls our `update_case` tool, which returns in well under a second and persists only what the caller actually said.
- **Expected (open Window A `/operator` and watch live):** a new case appears; within the call the **Voice Call Transcript** panel shows turns accumulating (proof: production case **KC-2026-000018** = 8 persisted turns, Urdu caller + AI). If `transcript_updated` streaming lags, the **`call_ended` backfill** guarantees the full transcript lands when the call drops.
- **Do NOT** let the agent claim dispatch — it is explicitly instructed to acknowledge capture and hand to a human coordinator (see step 10).

### 4) Automatic case + raw transcript (2:10–2:45)
- **Open (Window A):** the new case in the operator queue → case detail.
- **Say:** "Everything the caller said is stored **verbatim** — Urdu stays Urdu, mixed stays mixed. This raw transcript is the authoritative record; AI reads it but never rewrites it."
- **Show:** `originalMessage`, caller number, location text, and the **Voice Call Transcript** with correct turn count + detected-language tags.

### 5) Alibaba Qwen triage (2:45–3:15)
- **Show:** AI panel — **urgency**, **categories**, **summary**, **key needs**, **special needs**, **missing information**, **follow-up question**, **confidence**.
- **Say:** "Alibaba Cloud Model Studio's Qwen reads the raw text and produces **structured, decision-support JSON** — urgency and category recommendations, what's missing, one useful follow-up. Crucially: **the AI supports the human coordinator; it never dispatches.** A case is created whether or not AI succeeds — if Qwen is down, the coordinator still sees the full raw emergency."
- **If AI is still 'pending'** (voice path is asynchronous by design): say "the analysis runs detached so the call is never slowed — it'll refresh in a moment" and move on; **it will be there by the time you return** (fingerprint dedup ensures it completes **once**, not three times).

### 6) Operator assigns a real resource (3:15–3:45)
- **Action (Window A):** click **Assign** → pick **Ahmed Khan** + **Ambulance AKF-07** → confirm.
- **Say:** "This is a human decision. The operator, not the AI, commits a **real Assignment** to a specific responder and vehicle. Availability is enforced so you can't double-book a unit."
- **Expected:** case status → **ASSIGNED**; audit timeline records the assignment with operator name.

### 7) Responder workflow (3:45–4:30) — Window B
- **Action:** Responder Dashboard shows the new assignment → **Accept** → **En Route** → **Arrived** → **Complete**.
- **Say, per click:** "Accepted… now **En Route** — live GPS begins streaming and the ambulance position updates on the map… **Arrived at scene**… and **Complete**, which releases the unit back to AVAILABLE."
- **Expected:** each click transitions status **RESPONDER_ACCEPTED → EN_ROUTE → ARRIVED → COMPLETED**; the map shows the unit moving toward the scene (GPS breadcrumbs).

### 8) Requester live status — no login (4:30–4:55)
- **Open (Window C):** the shareable tracking link `/case/<CODE>?t=<token>` (for the *pre-seeded* walkthrough this printable link comes straight from `demo:seed`; for a fresh WEB case the browser stored it automatically).
- **Say:** "The family gets a link — no app, no account. It polls every 10 seconds. They can see: reviewed → assigned → **ambulance en route, here's where it is** → arrived → completed."
- **Expected:** status + responder/ambulance position update without a manual refresh.

### 9) Google Maps & location support (woven through 6–8)
- **Point out:** geocoding / reverse-geocoding of the address, the route line to the scene, responder live position, and — if GPS was denied — the manually-typed location still working.
- **Say:** "Google Maps gives operators and responders a shared picture of the scene. And a missing or denied GPS **never blocks** the case — a landmark or block name is enough to start."

### 10) Human-in-the-loop safety close (4:55–5:30)
- **Summarize the principles, each tied to something the judges just saw:**
  - **Capture first** — the case existed before any AI ran.
  - **AI supports, humans decide** — Qwen recommended; the operator assigned.
  - **No false dispatch** — the voice agent could not say "help is on the way" until a *real* assignment existed.
  - **Raw transcript authoritative**, **Urdu-first**, **GPS optional**, **AI failure never loses an emergency**.
- **Close:** "KhidmatConnect is coordination infrastructure — one dignified, Urdu-first path from 'I need help' to 'help has arrived', built for the disasters Pakistan actually faces."

---

## Fallbacks (the demo must never hang)

**Live voice call fails / poor network / Retell or Twilio unavailable:**
- Fall back to the **pre-seeded VOICE case** already in the operator queue (`demo-shelter-displaced-family`, a 4-turn Urdu voice intake) — same narration, just already captured.
- And/or play the **≤30-second pre-recorded clip** of a real call (see [SUBMISSION_ASSETS_CHECKLIST.md](./SUBMISSION_ASSETS_CHECKLIST.md)) + Retell dashboard call-history screenshot for **KC-2026-000018**.
- Then continue the rest of the demo on the **WEB path** (below) which shares the same downstream flow.

**If you prefer web-only intake as the primary (lowest risk):** at step 3 instead submit the form at `/emergency`:
`message` = *"Meri amma behosh ho gayi hain, Gulshan Block 7 gali 3 mein, please ambulance fori bhejein"* · `location` = *Gulshan-e-Iqbal Block 7, Karachi* · `phone` = any. Click the GPS button if it helps, otherwise type the address. Continue from step 4 with the freshly created case.

**GPS denied / unavailable:** click "Enter location manually", type "Gulshan Block 7, Karachi". Narrate: *"No GPS? A landmark is enough — a missing location never blocks an emergency."*

**Qwen slow / unreachable:** if the AI panel shows *pending/failed*, say: *"The case is already captured — that's the safety design. Analysis is async; here's the same case fully triaged"* and point to a **pre-seeded case** that already shows the structured Qwen output. Never wait on a spinner on stage.

**Anything else breaks:** pre-seeded cases in Window A already demonstrate every screen (voice, web, assigned, en-route, arrived, completed). Switch to them and keep narrating.

---

## Recovery after the demo
- Demo DB drift is expected. Re-run `npm run demo:reset` (dev) to rebuild the seeded queue; **never run seed/reset against production** (the tooling refuses remote DATABASE_URL by design).
- Keep the two logged-in windows and the tracking link open — relogging on stage wastes seconds.
