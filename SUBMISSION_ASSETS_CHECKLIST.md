# SUBMISSION_ASSETS_CHECKLIST.md — KhidmatConnect AI

Everything a judge should receive besides the code. Work top-down; the **must-have** items are what the submission is graded on, the rest is polish.

Capture conventions:
- Browser at 1280px+ wide, OS light-blocked dark theme, no bookmarks bar visible, no personal icons.
- Mask nothing except genuine third-party data - our own demo data is fictitious and safe to show.
- Export screenshots as PNG into `docs/assets/` (create it) named exactly as below, so the README and any slide deck can reference stable paths.
- Record video at 1920x1080 / 30fps; keep system audio + presenter mic. Mouse movements slow; judges replay at 1x.

---

## 1. Screenshots (must-have)

| # | File | Page / source | What must be visible | Why it wins points |
|---|---|---|---|---|
| S1 | `01-landing.png` | `https://khidmatconnect.teqprotech.com/` | Hero, "Request Help" CTA, EN/UR language toggle | Establishes a real, deployed product |
| S2 | `02-landing-urdu-rtl.png` | Same page, language switched to Urdu | Full RTL flip of the layout | Urdu-first is claimed *and* shown |
| S3 | `03-emergency-form.png` | `/emergency` | Message + location fields, GPS button, phone field, critical toggle | No-login citizen intake |
| S4 | `04-emergency-confirmed.png` | Post-submit state | Generated `KC-YYYY-######` case code + "track your case" link | Instant case identity |
| S5 | `05-retell-call-history.png` | **Retell dashboard** (screenshot only - do not demo-edit anything) | Real inbound call for the KC-2026-000018 window: call id, duration, status, transcript preview | Third-party proof the call really happened |
| S6 | `06-operator-queue.png` | `/operator` | Multiple cases at different urgencies/stages, CRITICAL highlighted | Command center reality check |
| S7 | `07-operator-case-voice-transcript.png` | Operator case detail (the voice case) | **Voice Call Transcript** panel: correct non-zero turn count, `CALLER` + `AI` rows in Urdu, timestamps | The transcript bug fix, visibly working |
| S8 | `08-operator-qwen-triage.png` | Same detail page, AI panel | Urgency, categories, summary, reasoning, key needs, special needs, **missing information**, follow-up question, confidence | The Alibaba Cloud money shot |
| S9 | `09-operator-map.png` | Same detail page | Scene marker + address, responder/ambulance positions | Location handling, Google Maps |
| S10 | `10-assign-dialog.png` | Operator assign UI | Responder + ambulance pickers with availability | Human-in-the-loop decision |
| S11 | `11-audit-timeline.png` | Operator case detail timeline | Created -> AI triage -> assigned -> accepted -> en route -> arrived -> completed, with actors | Accountability/audit story |
| S12 | `12-responder-app.png` | `/responder` (mobile viewport 390x844) | Incoming assignment, Accept / En Route / Arrived / Complete actions | Field-side completeness |
| S13 | `13-responder-enroute-map.png` | Responder case detail | Route to scene + live unit position | Live tracking is real |
| S14 | `14-requester-tracking.png` | `/case/<CODE>?t=<token>` in a phone frame | Status stepper + ambulance position, **no login** | The family's view - the emotional close |
| S15 | `15-completed-case.png` | Operator view of a completed case | COMPLETED status + released resources in the audit log | Full lifecycle closure |
| S16 | `16-architecture.png` | Render of the mermaid diagram in `README.md` | Twilio -> Retell -> API -> Qwen -> Operator -> Responder -> Requester, with Google Maps | Technical credibility on one slide |

## 2. Screenshots (nice-to-have)

| # | File | Source | Note |
|---|---|---|---|
| S17 | `17-resources.png` | `/api/resources` rendered list or operator resource panel | Shows fleet/shelter/ration catalog |
| S18 | `18-test-run.png` | Terminal: `npx tsx scripts/retell-verify-tests.ts` ending `114 passed / 0 failed` | Engineering evidence |
| S19 | `19-login-roles.png` | `/login` | Three one-click demo roles - also proves "no password friction" |
| S20 | `20-mixed-language-turn.png` | Operator transcript zoomed on one code-mixed Urdu-English turn | Language fidelity detail judges notice |

## 3. Video clips (record once, reuse everywhere)

### 3.1 Primary submission video - **2:30-3:00**, this exact order

| Clip | Length | Content | Source |
|---|---|---|---|
| V1 Hook | 15 s | Black screen, one line: *"2 a.m., Gulshan-e-Iqbal. An elderly woman stops responding."* then the phone dialling a number | Screen + stock-free phone UI |
| V2 Real call | 30-40 s | **The real Urdu voice call** - audio in, Retell agent answering in Urdu, caller describing the emergency | Record a genuine call OR use the existing KC-2026-000018 recording/preview from Retell |
| V3 Case appears | 15 s | Cut to `/operator`: the new case at the top of the queue; open it | Live production or local seeded DB |
| V4 Transcript | 15 s | Scroll the Voice Call Transcript - Urdu caller + AI turns, real turn count | Same page |
| V5 Qwen triage | 20 s | AI panel: urgency CRITICAL, categories, missing information, follow-up question; cursor over "human review required" labelling | Same page |
| V6 Human assigns | 20 s | Operator picks Ahmed Khan + AKF-07 and confirms; status -> ASSIGNED | Same page |
| V7 Responder loop | 25 s | Mobile viewport: Accept -> En Route (map shows unit moving) -> Arrived -> Complete | `/responder` |
| V8 Family view | 15 s | Phone-frame tracking link updating without refresh; end card: *"AI triaged. A human dispatched. The family knew."* | `/case/...?t=...` |
| V9 Close | 10 s | Logo, URL, one-line positioning statement, Alibaba Cloud + stack credits | Slide |

### 3.2 Backup/fallback clips (protect the live demo)

| Clip | Length | Content | When used |
|---|---|---|---|
| B1 | <=30 s | Real Retell call audio + operator screen capture from a **previously completed** call | Live voice call fails on stage |
| B2 | <=20 s | Web form submit -> case code -> operator queue entry (already-captured recording) | Network/API is down |
| B3 | <=15 s | Responder accept -> en route -> complete with map movement | Responder session breaks |
| B4 | <=10 s | Qwen panel appearing on a case | AI is slow/unreachable live |
| B5 | 3 s | Terminal run showing `114 passed / 0 failed` | Asked for test evidence in Q&A |

**Storage rule:** keep the video + clips local (Drive/Dropbox link for the submission form) and **also on the presenting laptop**. Do not depend on venue Wi-Fi to stream your own backup.

## 4. One-pager / slide deck (if the submission form accepts a PDF)

- Slide 1: name, one-line description, live URL, hotline number, team.
- Slide 2: problem with three concrete numbers (flood-affected districts, 1122 saturation, NGO fleets coordinating on paper) - sourced or honestly labelled approximate.
- Slide 3: architecture render (S16).
- Slide 4: "what AI does / what a human does" - the boundary diagram, with the no-false-dispatch rule.
- Slide 5: proof - KC-2026-000018 case code, 8 turns, CRITICAL/RESCUE+MEDICAL, screenshots S5/S7/S8.
- Slide 6: Alibaba Cloud usage table (Qwen roles).
- Slide 7: humanitarian impact + NGO deployment story.
- Slide 8: test/quality evidence + honest limitations.

## 5. Written assets already in the repo (link, don't re-write)

| Asset | File |
|---|---|
| Hackathon README (problem, architecture, safety, stack, testing) | `README.md` |
| 30 s / 90 s / 3 min pitches + speaker notes | `HACKATHON_PITCH.md` |
| Judge Q&A (18 answers + rapid-fire + red lines) | `JUDGE_QA.md` |
| 4-6 minute judge demo script + fallbacks | `DEMO_SCRIPT.md` |
| Day-of smoke-test checklist | `FINAL_DEMO_CHECKLIST.md` |
| Milestone/roadmap audit | `POST_M9_FINAL_ROADMAP.md` |
| Voice architecture + failure-mode table | `M9_RETELL_ARCHITECTURE.md` |

## 6. Backup prerecorded demo flow (if internet / telephony / production is unreachable at judging)

Run order, all from local files on the laptop - **zero network dependency**:

1. Play **V1 -> V9** primary video full-screen (this is a complete substitute for the live demo).
2. If a partial live demo is possible on **local dev** (`npm run dev` + `npm run demo:seed`, which needs only localhost + PostgreSQL, no external APIs for the browser loop): walk operator -> assign -> responder -> tracking, and narrate the voice segment from B1/S5-S7 screenshots instead of dialling.
3. If even local Postgres is unavailable: open the exported screenshot folder in full-screen viewer order S1 -> S16 and narrate the same script beats from `DEMO_SCRIPT.md`.
4. Answer Q&A from `JUDGE_QA.md` regardless of which tier you presented at.

**Decision point (before you walk in):** if the venue has shown flaky Wi-Fi, choose tier 2 or tier 1 on purpose. A calm recording beats a stalled live call every time.

## 7. Recording logistics checklist

- [ ] Phone charged to 100%; hotline number saved as a contact named "KhidmatConnect" so the caller-ID screen looks intentional.
- [ ] Second phone on standby as a dial-in alternate.
- [ ] HDMI/USB-C adapter + display verified 10 minutes before the slot.
- [ ] Screen-recording started **before** the demo begins (a clip that starts at minute two is unusable).
- [ ] Presenter mic tested; audience speakers muted during recording so the audio isn't ruined.
- [ ] Do Not Disturb on laptop and both phones; notifications ending the take.
- [ ] Two logged-in browser windows pre-opened (operator + responder) - see `FINAL_DEMO_CHECKLIST.md`.
- [ ] Video + screenshots copied to the submission folder **and** a USB stick.
