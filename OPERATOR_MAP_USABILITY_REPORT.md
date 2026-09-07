# OPERATOR MAP USABILITY IMPLEMENTATION REPORT

**Task C — KhidmatConnect AI: turn the operator map from a passive visual into an actionable tool.**
Branch `feature/twilio-voice-intake` · base commit `3eb92a6` · changes uncommitted (no deploy / no merge / no tag).

---

## 1. Existing map architecture (before this task)

- **Component**: `src/components/maps/GoogleMap.tsx` — Google Maps JS API via `@googlemaps/js-api-loader` (`v: 'weekly'`, libraries `maps,geocoding`), rendered with **legacy `google.maps.Marker`** + `Symbol` icons. AdvancedMarkerElement was deliberately not used (it requires a Cloud Map ID this project does not configure).
- **Marker behaviour (defects found)**: markers were destroyed and recreated on every render (`useEffect([markers, onMarkerClick])` fed by an inline IIFE + inline arrow in `/operator`); the center effect compared the `center` **object by identity**, so every 10s poll re-panned the map; emergency pins were plain `CIRCLE` dots with an infinite `Animation.BOUNCE`.
- **Missing**: no `InfoWindow`, no fullscreen, no recenter control, no exposed refs/state, no selected-marker styling, no severity colours.
- **Data**: `/operator` polls `/api/operator/cases` + `/api/operator/voice-calls` every **10s**; `/operator/cases/[caseId]` polls `/api/operator/cases/[caseCode]` every **15s** while the case is active. Cases arrive as `ApiActiveCase` (caseCode, status, urgency, locationText, lat/lng, locationConfirmed, categories, createdAt, assignments[] with live responder/ambulance telemetry).
- **Queue sync (partial)**: marker click set `selectedCaseId`; card click selected + ringed; the Details `Link` already used `stopPropagation`. No scroll-into-view, no info card.
- **`InteractiveMap.tsx`** is a mock/fallback surface (unchanged — used only when Google Maps is not configured).

## 2. Files changed

**New**
- `src/lib/maps/externalLinks.ts` — pure Google Maps Universal-URL builders + clipboard helper.
- `src/lib/maps/operatorMap.ts` — pure marker logic (severity colours, pin path, symbol specs, pulse gating, `queueMarkersFromCases`, `planMarkerUpdate`, `hasDriftedFromFocus`).
- `scripts/operator-map-verify.ts` — the A–O verification suite (81 assertions).

**Modified**
- `src/components/maps/GoogleMap.tsx` — full rewrite (~542 lines): reconciliation, InfoWindow+React root, recenter/fullscreen overlay controls, pulse halos, debug seam.
- `src/lib/maps/types.ts` — `MapMarkerData` += `caseStatus?: string; assigned?: boolean`.
- `src/app/operator/page.tsx` — wired markers/selection/info card; two-way sync.
- `src/app/operator/cases/[caseId]/page.tsx` — case-detail info card, Copy Coordinates, open-by-default, text-only safety.
- `src/app/globals.css` — InfoWindow dark chrome.
- `src/i18n/translations.ts` — 14 new map keys, EN + UR.

## 3. Marker interaction model

Markers are now **click-driven** (never hover-dependent, no expensive API on hover). Each legacy `Marker` gets **one stable click listener** created at add-time; the listener reads the latest data from `entriesRef` and calls `onMarkerClick(data)`, then opens the InfoWindow when an `infoCard` renderer exists. Callbacks are held in a `callbacksRef` refreshed each render, so inline parent arrows never retrigger effects or rebind listeners.

## 4. Info card — fields & actions

Rendered into a `google.maps.InfoWindow` (`maxWidth: 330`) whose content is a persistent `<div class="kc-map-info">` hosted by a dedicated `createRoot`. The parent supplies an `infoCard(marker) => ReactNode` closure (closures carry `router`/`t`/`isUrdu` because the separate root has no React context).

- **Queue card (`/operator`)**: case code, urgency badge (severity-coloured), primary category, location text, reported time, status; actions **View Case** (internal link), **Open in Maps**, **Navigate**.
- **Case-detail card (`/operator/cases/[caseId]`)**: Case, Priority, Emergency category, Location, **GPS** coordinates, Status; actions **Open in Maps**, **Navigate**, **Copy Coordinates**. Opens **by default** (`openInfoId` initialised to `'emergency'`).
- Coordinates are never fabricated: cards/actions only render when real lat/lng exist.

## 5. Recenter ("Back to Case") implementation

A floating `Crosshair` control appears **only after meaningful manual movement**. `dragend` and unmasked `zoom_changed` set `userMoved`; programmatic pans/zooms are masked via `programmaticMoveRef` (900 ms window) so polling- and selection-driven moves never count. Clicking it `panTo(focus)` + `setZoom(focusZoom ?? zoom)`, clears `userMoved`, and re-anchors any open card. There is **no auto-snap** and **no recenter on polling** — the center effect is value-compared (`lastAppliedCenterRef`), so an unchanged focus point never re-pans. `hasDriftedFromFocus` (haversine, 150 m threshold) backs the drift decision in pure logic.

## 6. Google Maps URL strategy

Documented **Maps Universal URLs** (work on desktop, Android, iOS; hand off to the installed app):
- Open in Maps: `https://www.google.com/maps/search/?api=1&query=<lat>,<lng>&zoom=17`
- Navigate: `https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>` — **no `origin`**, so Google obtains/asks for the device location itself. The app issues **no geolocation request** to build a Navigate link.
- Text-only search: `https://www.google.com/maps/search/?api=1&query=<encoded landmark>` — always a *search*, never directions.

All open in a new tab with `rel="noopener noreferrer"`.

## 7. Fullscreen behaviour

`fullscreenControl: false` hides Google's native control so the app provides **one consistent** control. The toggle calls `requestFullscreen()` on the wrapper; if unavailable/rejected (iOS Safari) it falls back to an app-level CSS mode (`fixed inset-0 z-[90]`). `Escape` exits the CSS mode; `fullscreenchange` tracks the native mode; `google.maps.event.trigger(map,'resize')` runs on every toggle so tiles re-fit. Button is `aria-pressed` and swaps `Maximize2`/`Minimize2`.

## 8. Marker visual upgrade

- **Severity colours reuse existing tokens**: CRITICAL `#F85149`, HIGH `#F0883E`, MEDIUM `#D29922`, LOW `#3FB950` (no new palette).
- Emergencies are now a Material **pin** (`EMERGENCY_PIN_PATH`, anchored at its tip `12,22`) instead of a flat dot; responders/ambulances stay circular dots (blue/green).
- **Selected state**: larger scale (1.55 → 1.9) + white outline + `zIndex 999`.
- **Pulse**: a subtle two-phase halo (700 ms) only for `EMERGENCY + CRITICAL + !assigned + not-closed`. Completed/assigned cases never animate. Fully suppressed under `prefers-reduced-motion`. `Animation.BOUNCE` removed.

## 9. Queue ↔ map two-way selection

- **Marker → list**: emergency marker click sets `selectedCaseId` (highlights + rings the card) and `scrollIntoView({behavior:'smooth', block:'nearest'})` via per-card `cardRefs`. Minimum requirement (highlight) is met and exceeded.
- **List → map**: card click calls `handleSelectCase` → selects + centers the marker (value-memoized `mapCenter`) and opens its card.
- The **Details** link keeps `stopPropagation` — it is **not** hijacked.

## 10. Polling protections

`planMarkerUpdate(previous, next)` diffs by id: identical markers keep their Google object (and any open InfoWindow, focus, animation); changed markers update in place (`setPosition`/`setTitle`); disappeared ones are removed. The center effect is value-compared; callbacks live in refs; programmatic moves are masked. Net effect: a 10s/15s poll **never** resets zoom/center, closes the card, recreates the map, or destroys marker state. Only the initial load auto-fits.

## 11. Copy Coordinates

`formatCoordinates` produces exactly `24.8607, 67.0011` (stored precision, no padding). `copyTextToClipboard` uses `navigator.clipboard.writeText` with a `textarea`/`execCommand` fallback and **never throws**. On success the button shows a temporary green **"Coordinates copied"** (2 s). The control is hidden entirely when no coordinates exist.

## 12. Text-only location safety

Cases without GPS produce **no marker** and **no coordinate actions**. The case-detail map panel instead shows `t.mapNoGpsTextOnly` ("No GPS coordinates — text location only") and, when a landmark string exists, a distinctly-labelled **"Search Location in Maps"** (`googleMapsTextSearchUrl`) — clearly a search, never fake navigation. Missing coordinates never lower priority.

## 13. Mobile verification (390×844 / 412×915)

Card body capped at `max-w-[300px]` inside a `maxWidth: 330` bubble; `.gm-style-iw-d` scrolls (`overflow: hidden auto`, `max-height: 260px`) so it never overflows. Overlay controls are `min-h/w-[40px]` tap targets positioned `bottom-7 right-3` — **above** the mobile bottom nav. Fullscreen CSS fallback covers iOS. Urdu strings wrap in an RTL-safe flex layout. (Verified structurally via the A–O suite; live device pass is a follow-up since no browser run was performed in this task.)

## 14. Desktop verification (1440×900 / 768+)

Full map + queue split layout unchanged; the info card, recenter, and fullscreen controls render in the map's bottom-right. Native Fullscreen API path is used on desktop; `Escape` exits. Keyboard focus rings (`focus-visible:ring-2`) are visible on all card actions and controls.

## 15. Urdu / RTL verification

14 new keys added to **both** `en` and `ur` (mapViewCase, mapOpenInMaps, mapNavigate, mapBackToCase, mapCopyCoordinates, mapCoordinatesCopied, mapSearchInMaps, mapNoGpsTextOnly, mapFullscreen, mapExitFullscreen, mapReportedAt, mapStatus, mapPriority, mapGpsCoordinates). The suite asserts every key is non-empty in both languages and that EN≠UR except the language-neutral acronym **GPS**. No half-translated controls. Info card sets `dir={isUrdu ? 'rtl' : 'ltr'}`; `.kc-map-info` uses the Arabic font under `[dir="rtl"]`.

## 16. Accessibility verification

Every overlay control has `aria-label` + `title`; fullscreen has `aria-pressed`; all actions are real `<a>`/`<button>` elements that receive keyboard focus with a visible `focus-visible` ring (plus the global `*:focus-visible` outline). No information is hover-only — everything appears on click/tap. Tap targets ≥40 px.

## 17. Tests

- `scripts/operator-map-verify.ts` — **81 passed, 0 failed** (A–O: marker click opens info; correct card data; View Case routing; exact Open-in-Maps URL; Navigate destination with no origin; copy format + clipboard helper; Back-to-Case restores center+zoom; polling reconciliation is a no-op on identical data; no-GPS produces no marker/controls; text-only labelled search; fullscreen native+fallback+ESC+resize; two-way selection; Urdu strings; no overflow; reduced-motion + severity/pulse gating).
- `scripts/maps-verify-tests.ts` — **68 passed, 0 failed** (no regression).
- `npx tsc --noEmit` — **exit 0**.
- `npm run build` — **✓ Compiled successfully in 23.0s**; BUILD_ID `2M9fNIH8A1kFU9twoAoFh`. Routes: `○ /operator 9.06 kB / 136 kB`, `ƒ /operator/cases/[caseId] 9.5 kB / 133 kB`, operator APIs 205 B / 103 kB.

## 18. Remaining limitations

- Verification was **logic + static-wiring + build** based; no live CDP/browser run was executed this task, so real-device fullscreen, InfoWindow pixel layout, and clipboard-on-HTTPS were asserted structurally rather than observed. A `__kcMapDebug` seam (`{ map, markers(), markerIds(), state() }`) is exposed for a future browser pass.
- Legacy `google.maps.Marker` is used intentionally (no Cloud Map ID); Google logs a deprecation notice for it — migrating to AdvancedMarkerElement would require provisioning a Map ID.
- InfoWindow uses a **separate React root**, so card content cannot consume app context (router/theme); it relies on captured closures and plain anchors. This is by design but means card links do full navigations rather than client-side route transitions.
- Pulse halos are driven by a **single shared 700 ms `setInterval`** that re-icons every active halo; on an extremely large simultaneous critical queue that is O(n) icon updates per tick — negligible today, but worth watching at scale.
- Changes are **uncommitted**; per instructions there was no commit, merge, tag, or deploy.

**Do NOT deploy. Do NOT merge. Do NOT tag. STOP.**
