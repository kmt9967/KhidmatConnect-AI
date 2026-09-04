# FINAL_DEMO_CHECKLIST.md — KhidmatConnect AI

Day-of smoke test. Work top to bottom. **Do not run the rehearsal-only items against production on demo day** - they create real records.

> **Environment decision (make this choice explicitly, 24 h before):**
> - **Tier A - full live demo on production** (https://khidmatconnect.teqprotech.com): real phone call, real case, real audit trail. Voice + web + operator + responder + tracking all live. No seeded multi-stage fallback cases exist here.
> - **Tier B - local demo** (`npm run dev` + `npm run demo:seed`): every lifecycle stage pre-staged, printable tracking links, Ahmed Khan + AKF-07 guaranteed AVAILABLE. `demo:seed` **refuses to run against a remote `DATABASE_URL` by design**, so this content only exists locally. Voice is **not** exercisable locally unless `RETELL_API_KEY` is configured on this machine (the endpoints fail closed without it).
> - **Recommended:** Tier A for the live call segment + Tier B browser content open in a second window as instant fallback. Decide before you walk in; don't improvise an environment switch on stage.

---

## 1. T-24 h (or earlier) - rehearsal pass, once

Full dry run of `DEMO_SCRIPT.md`, start to finish, timed. Then:

- [ ] **Production home loads** - `https://khidmatconnect.teqprotech.com/` renders hero + "How it works" in <3 s; EN/UR toggle flips layout to RTL and back cleanly.
- [ ] **Login works** - `/login` -> *Operator Demo* lands on `/operator`; log out; *Responder Demo* lands on `/responder`; *Citizen Demo* lands on `/dashboard`. (One-click role login, no password.)
- [ ] **Operator works** - `/operator` queue loads real cases; opening a case shows AI panel, audit timeline, and (for a voice case) the transcript panel.
- [ ] **Responder works** - `/responder` loads the assignment list for the logged-in responder without an empty-state error.
- [ ] **Google Maps loads** - tiles render on operator case detail and responder detail (no grey box, no `InvalidKeyError` in the console). A grey map = key/referrer restriction problem, fix before demo day.
- [ ] **Emergency creation works** *(creates a real case on production - rehearsal only)* - submit `/emergency` with Urdu/Roman-Urdu text, a typed location and a phone number; expect a `KC-` case code confirmation and a working tracking link.
- [ ] **Qwen triage works** - on that new case, the AI panel fills with urgency + categories + summary + missing-information. **Expect ~15-45 s: the web path awaits analysis inside the request.** If it comes back `needs_human_review`/failed, Qwen config or reachability is the first suspect - investigate before the demo, not during.
- [ ] **Retell agent works** *(rehearsal call)* - the agent answers, greets in the caller's language, asks for location, and acknowledges capture without claiming dispatch.
- [ ] **Twilio number reaches Retell** *(rehearsal call)* - the same call rings the agent: the number -> Elastic SIP Trunk -> Retell routing is intact.
- [ ] **Voice case reaches operator** - the call's case appears in `/operator` with source VOICE and the caller number.
- [ ] **Transcript turns > 0** - the Voice Call Transcript panel shows the real turn count, `CALLER` and `AI` rows, in order, with Urdu preserved. A `0 turns` on a completed call means regression or `transcript_updated` was disabled - stop and investigate.
- [ ] **No false dispatch** - before any assignment, the agent never says dispatched/on the way/assigned; after a real assignment, the confirmation language matches the actual assigned unit.
- [ ] **Responder assignment works** - operator assigns a responder + ambulance; case status -> ASSIGNED; the chosen unit shows busy/unavailable afterwards.
- [ ] **Responder accepts** - Accept on `/responder` -> case moves to RESPONDER_ACCEPTED and appears in the operator timeline.
- [ ] **En route** - En Route -> status change + live position appears on the map (GPS permission granted on the responder window).
- [ ] **Arrived** - Arrived -> status + timeline entry.
- [ ] **Completed** - Complete -> case COMPLETED and the responder + ambulance return to AVAILABLE.
- [ ] **Requester sees updates** - the tracking link `/case/<CODE>?t=<token>` reflects each transition within ~10 s without a manual refresh.
- [ ] **Demo reset/recovery strategy rehearsed** - locally: `npm run demo:reset` then `npm run demo:logins` completes without invariant warnings and prints fresh tracking links (paste them into the demo card now).
- [ ] **Backup screenshots/video ready** - every must-have item in `SUBMISSION_ASSETS_CHECKLIST.md` section 1 exists as a file, and the primary video plays start-to-finish on the presenting laptop with audio.

Rehearsal residue: if you created a case on production during rehearsal, note its code so it doesn't confuse you in the live queue (or complete/close it so the queue stays tidy).

## 2. T-2 h - non-destructive verification only

Nothing here writes data.

- [ ] Production home, `/operator`, `/responder`, `/emergency`, `/login` all load (hard refresh).
- [ ] Retell dashboard shows the last real call (KC-2026-000018 or newer) with its transcript - the fallback proof exists on screen if the live call dies.
- [ ] Operator queue contains at least one case per story beat you plan to reference (voice case, CRITICAL case, an assigned/en-route case). On Tier B, `demo:seed` guarantees this; on Tier A, if the queue is thin, plan the narrative around what's really there.
- [ ] Maps tiles load on a case with coordinates.
- [ ] Phone: hotline answered once by the team's own test line OR confidence from the T-24 h rehearsal; caller ID shows the number judges will see.
- [ ] Two browser windows logged in and left open: **A = Operator**, **B = Responder (mobile-emulated 390x844)**; **C = requester tracking link** in an incognito window (no login).
- [ ] Demo card in hand: production URL, hotline number, the three demo roles, one tracking link, and the KC-2026-000018 fact sheet (8 turns, CRITICAL/RESCUE+MEDICAL).
- [ ] Laptop on mains, Do Not Disturb on, OS updates deferred, screen resolution matches what you rehearsed at.
- [ ] Backup video opens from the desktop in <10 s (not from a cloud drive).

## 3. T-5 min

- [ ] Airplane-mode decision made explicitly: **live call planned** = phone on cellular, laptop on venue Wi-Fi (separate paths, so one failure doesn't kill both). **Recording planned** = phone on silent, video pre-opened.
- [ ] Presenter view set: demo tab first, backup video second, `DEMO_SCRIPT.md` third. Zoom 110-125 % so the room can read Urdu text.
- [ ] Verify the operator window shows a live-looking queue (not a stale page from two hours ago) - refresh once.
- [ ] Water handy; the 30-second line ("case KC-2026-000018 - a real phone call, in Urdu, that became a real case") ready to say if anything stalls.

## 4. Recovery playbook (memorize the first line of each)

| Symptom | First action (say this while doing it) |
|---|---|
| Live call doesn't connect | *"The call path is proven in production - here's the real one, case KC-2026-000018"* -> open B1 clip / Retell history screenshot, continue on the web path. |
| Web submit spins > ~45 s | *"Analysis is running against the raw case that's already saved - that's the safety design"* -> switch to an already-triaged case, come back at the end. |
| Qwen panel shows failed / needs review | *"AI is advisory; the case and raw words are intact and a human reads them"* -> point to a fully triaged seeded case. |
| Maps tiles grey | *"Map key restriction hiccup on this network - the coordinates and route data are here in the panel"* -> keep talking, don't fiddle with the console. |
| Responder session lost | Re-open `/login` -> Responder Demo (pre-typed); worst case use the seeded accepted/en-route case (Tier B) or clip B3. |
| Tracking link shows no token error state | Open it with `?t=<token>` from the demo card (Tier B tokens are printed by `demo:seed`); a bare `/case/CODE` legitimately shows the "no access token" screen. |
| Production unreachable | Tier B local dev walk of the same screens + primary video. State clearly which environment you're in - honesty costs less than a stall. |

## 5. Post-demo

- [ ] Close/re-complete any live case created on stage so the queue reads cleanly for the next presenter.
- [ ] Screenshot the fresh case + transcript as the day's proof while the data is still there.
- [ ] `npm run demo:reset` locally to restore the seeded state.
- [ ] Note anything that felt fragile for the write-up's "known limitations" section.
