/**
 * OPERATOR MAP USABILITY — verification suite (Task C, Part 16: tests A–O).
 *
 * Two kinds of checks, no browser required:
 *   1. PURE LOGIC  — imports the real map modules and exercises them
 *      (marker building, reconciliation, severity colours, pulse gating,
 *      Google Maps URL builders, coordinate formatting, drift detection).
 *   2. STATIC WIRING — reads the component / page / CSS / i18n source and
 *      asserts the interaction contract is present (info-card on click,
 *      recenter, fullscreen, text-only safety, two-way selection, RTL…).
 *
 * Run: npx tsx scripts/operator-map-verify.ts
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  queueMarkersFromCases,
  planMarkerUpdate,
  shouldPulseMarker,
  markerSymbolFor,
  pulseHaloSpec,
  hasDriftedFromFocus,
  URGENCY_MARKER_COLORS,
  EMERGENCY_PIN_PATH,
  type QueueCaseForMap,
} from '../src/lib/maps/operatorMap';
import {
  googleMapsViewUrl,
  googleMapsDirectionsUrl,
  googleMapsTextSearchUrl,
  formatCoordinates,
  copyTextToClipboard,
} from '../src/lib/maps/externalLinks';
import { translations } from '../src/i18n/translations';

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.error(`  ❌ ${label}`);
  }
}

function section(title: string) {
  console.log(`\n${title}`);
}

const src = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8');

const googleMapSrc = src('src/components/maps/GoogleMap.tsx');
const operatorPageSrc = src('src/app/operator/page.tsx');
const caseDetailSrc = src('src/app/operator/cases/[caseId]/page.tsx');
const globalsSrc = src('src/app/globals.css');

// ─── Fixtures ───────────────────────────────────────────────
const critCase: QueueCaseForMap = {
  caseCode: 'EMG-1001',
  status: 'NEW',
  urgency: 'CRITICAL',
  locationText: 'Street 8, Gulshan, Karachi',
  latitude: 24.8607,
  longitude: 67.0011,
  categories: ['MEDICAL'],
  assignments: [],
};
const assignedCase: QueueCaseForMap = {
  caseCode: 'EMG-1002',
  status: 'ASSIGNED',
  urgency: 'HIGH',
  locationText: 'Clifton, Karachi',
  latitude: 24.8138,
  longitude: 67.0304,
  categories: ['RESCUE'],
  assignments: [
    {
      status: 'EN_ROUTE',
      responder: { id: 'r1', name: 'Ahmed Khan', latitude: 24.82, longitude: 67.03, availabilityStatus: 'BUSY' },
      ambulance: { id: 'a1', identifier: 'AKF-07', latitude: 24.821, longitude: 67.031, availabilityStatus: 'BUSY' },
    },
  ],
};
const noGpsCase: QueueCaseForMap = {
  caseCode: 'EMG-1003',
  status: 'NEW',
  urgency: 'MEDIUM',
  locationText: 'Somewhere near the market',
  latitude: null,
  longitude: null,
  categories: ['FIRE'],
  assignments: [],
};

// ═══ A. Marker click opens the info card ═══════════════════
section('A. Marker click → info card');
assert(/marker\.addListener\('click'/.test(googleMapSrc), 'GoogleMap binds a click listener per marker');
assert(/if \(infoCardRef\.current\) openInfoWindow\(id\)/.test(googleMapSrc), 'Marker click opens the InfoWindow when a card renderer exists');
assert(/createRoot/.test(googleMapSrc), 'InfoWindow content is a React root (createRoot)');
assert(/closeclick/.test(googleMapSrc), 'InfoWindow closeclick is wired to onInfoClose');

// ═══ B. Info card shows correct case data ══════════════════
section('B. Card data comes from the real case payload');
const markers = queueMarkersFromCases([critCase, assignedCase, noGpsCase]);
const critMarker = markers.find((m) => m.id === 'EMG-1001');
assert(!!critMarker, 'Critical case produces an EMERGENCY marker');
assert(critMarker?.position.latitude === 24.8607 && critMarker?.position.longitude === 67.0011, 'Marker carries the exact stored coordinates');
assert(critMarker?.urgency === 'CRITICAL' && critMarker?.caseStatus === 'NEW' && critMarker?.category === 'MEDICAL', 'Marker carries urgency, status and category for the card');
assert(critMarker?.assigned === false, 'Unassigned case flagged assigned=false');
assert(markers.find((m) => m.id === 'EMG-1002')?.assigned === true, 'Case with an active assignment flagged assigned=true');
assert(operatorPageSrc.includes('const apiCase = isEmergency ? casesRef.current.find((c) => c.caseCode === marker.id)'), 'Queue card looks up the live case for reported time / status');

// ═══ C. View Case routes to the case detail page ═══════════
section('C. View Case routing');
assert(operatorPageSrc.includes('href={`/operator/cases/${marker.id}`}'), 'Queue info card links View Case → /operator/cases/<caseCode>');
assert(operatorPageSrc.includes('{t.mapViewCase}'), 'View Case uses the translated label');

// ═══ D. Open in Maps URL uses exact coordinates ════════════
section('D. Open in Maps URL');
const viewUrl = googleMapsViewUrl({ latitude: 24.8607, longitude: 67.0011 });
assert(viewUrl === 'https://www.google.com/maps/search/?api=1&query=24.8607,67.0011&zoom=17', `View URL exact: ${viewUrl}`);
assert(viewUrl.startsWith('https://'), 'View URL is HTTPS (works desktop/Android/iOS)');
assert(operatorPageSrc.includes('googleMapsViewUrl(point)') && caseDetailSrc.includes('googleMapsViewUrl(point)'), 'Both surfaces build the view URL from the marker point');
assert(/target="_blank"/.test(operatorPageSrc) && /rel="noopener noreferrer"/.test(operatorPageSrc), 'Open in Maps opens a new tab safely');

// ═══ E. Navigate URL: destination only, no forced origin ═══
section('E. Navigate URL');
const dirUrl = googleMapsDirectionsUrl({ latitude: 24.8607, longitude: 67.0011 });
assert(dirUrl === 'https://www.google.com/maps/dir/?api=1&destination=24.8607,67.0011', `Directions URL exact: ${dirUrl}`);
assert(!dirUrl.includes('origin='), 'Navigate never forces an origin (Google uses device location)');
assert(!operatorPageSrc.includes('getCurrentPosition') && !caseDetailSrc.includes('getCurrentPosition'), 'Neither operator surface requests geolocation to build a Navigate link');

// ═══ F. Copy Coordinates format + clipboard helper ═════════
section('F. Copy Coordinates');
assert(formatCoordinates({ latitude: 24.8607, longitude: 67.0011 }) === '24.8607, 67.0011', 'formatCoordinates → "24.8607, 67.0011"');
assert(typeof copyTextToClipboard === 'function', 'copyTextToClipboard is exported');
assert(caseDetailSrc.includes('handleCopyCoords') && caseDetailSrc.includes('t.mapCoordinatesCopied'), 'Case detail shows temporary "Coordinates copied" feedback');
assert(/coords && \(/.test(caseDetailSrc), 'Copy Coordinates button only renders when coordinates exist');

// ═══ G. Back to Case restores center + zoom ════════════════
section('G. Back to Case / recenter');
assert(/const handleRecenter = \(\) =>/.test(googleMapSrc), 'handleRecenter exists');
assert(/map\.panTo\(\{ lat: focus\.latitude, lng: focus\.longitude \}\)/.test(googleMapSrc) && /map\.setZoom\(focusZoomRef\.current \?\? zoom\)/.test(googleMapSrc), 'Recenter pans to the incident AND restores focus zoom');
assert(/map\.addListener\('dragend', \(\) => setMoved\(true\)\)/.test(googleMapSrc), 'Manual drag flags userMoved');
assert(/\{userMoved && centerRef\.current && \(/.test(googleMapSrc), 'Recenter control only appears after meaningful manual movement');
assert(hasDriftedFromFocus({ latitude: 24.8607, longitude: 67.0011 }, { latitude: 24.8607, longitude: 67.0011 }) === false, 'No drift when centred on focus');
assert(hasDriftedFromFocus({ latitude: 24.9, longitude: 67.05 }, { latitude: 24.8607, longitude: 67.0011 }) === true, 'Drift detected beyond the threshold');

// ═══ H. Polling must not reset map state ═══════════════════
section('H. Polling safety');
const again = queueMarkersFromCases([critCase, assignedCase, noGpsCase]);
const plan = planMarkerUpdate(markers, again);
assert(plan.add.length === 0 && plan.update.length === 0 && plan.remove.length === 0, 'Identical refresh → no marker churn (keeps Google objects + open card)');
const moved = queueMarkersFromCases([{ ...critCase, latitude: 24.9, longitude: 67.1 }, assignedCase, noGpsCase]);
const plan2 = planMarkerUpdate(markers, moved);
assert(plan2.update.some((m) => m.id === 'EMG-1001') && plan2.add.length === 0, 'Coordinate change → in-place update, not recreate');
const removed = queueMarkersFromCases([assignedCase, noGpsCase]);
const plan3 = planMarkerUpdate(markers, removed);
assert(plan3.remove.includes('EMG-1001') && plan3.remove.includes('resp-r1') === false, 'Disappeared case is removed; unrelated markers untouched');
assert(/last\.latitude === centerLat && last\.longitude === centerLng/.test(googleMapSrc), 'Center effect is value-compared (polling re-render never re-pans)');
assert(/moveProgrammatically/.test(googleMapSrc) && /programmaticMoveRef\.current = true/.test(googleMapSrc), 'Programmatic pans are masked so they never count as user movement');

// ═══ I. No-GPS cases never get fabricated controls ═════════
section('I. No-GPS safety');
assert(queueMarkersFromCases([noGpsCase]).length === 0, 'Case without coordinates produces NO marker (never a fabricated pin)');
assert(caseDetailSrc.includes('t.mapNoGpsTextOnly'), 'Case detail shows the text-only notice');
assert(!/hasGps && isGoogleMapsConfigured\(\)[\s\S]{0,400}handleCopyCoords/.test(caseDetailSrc), 'Copy/Open/Navigate exact-coord actions live only in the GPS branch');

// ═══ J. Text-only locations get a clearly-labelled search ══
section('J. Text-only labelled search');
const searchUrl = googleMapsTextSearchUrl('Gulshan-e-Iqbal Block 4, Karachi');
assert(searchUrl === 'https://www.google.com/maps/search/?api=1&query=Gulshan-e-Iqbal%20Block%204%2C%20Karachi', `Text search URL encodes the landmark: ${searchUrl}`);
assert(!searchUrl.includes('dir/'), 'Text-only action is a SEARCH, never a directions/navigation link');
assert(caseDetailSrc.includes('googleMapsTextSearchUrl(caseData.locationText)') && caseDetailSrc.includes('{t.mapSearchInMaps}'), 'Case detail offers a distinctly-labelled "Search Location in Maps"');

// ═══ K. Fullscreen (native + mobile CSS fallback + ESC) ════
section('K. Fullscreen');
assert(/fullscreenControl: false/.test(googleMapSrc), 'Native Google fullscreen control hidden (app provides one consistent control)');
assert(/el\.requestFullscreen\(\)/.test(googleMapSrc), 'Uses the native Fullscreen API when available');
assert(/setCssFullscreen\(true\)/.test(googleMapSrc) && /fixed inset-0 z-\[90\]/.test(googleMapSrc), 'CSS fallback for browsers without element fullscreen (iOS Safari)');
assert(/e\.key === 'Escape'/.test(googleMapSrc), 'Escape exits the CSS fullscreen mode');
assert(/google\.maps\.event\.trigger\(map, 'resize'\)/.test(googleMapSrc), 'Map is nudged to resize after the fullscreen toggle');

// ═══ L. Queue ↔ map two-way selection ══════════════════════
section('L. Two-way selection sync');
assert(/cardRefs\.current\[marker\.id\]\?\.scrollIntoView/.test(operatorPageSrc), 'Marker click scrolls the matching queue card into view');
assert(/setSelectedCaseId\(marker\.id\)/.test(operatorPageSrc), 'Marker click highlights (selects) the queue card');
assert(/onClick=\{\(\) => \{ handleSelectCase\(item\.caseCode\); \}\}/.test(operatorPageSrc), 'Queue card click selects + centres the marker');
assert(/selectedMarkerId=\{selectedCaseId\}/.test(operatorPageSrc), 'Selected marker rendered in the selected style');
assert(/onClick=\{\(e\) => e\.stopPropagation\(\)\}/.test(operatorPageSrc), 'Details link still stops propagation (not hijacked)');

// ═══ M. Urdu strings exist for every new control ═══════════
section('M. Urdu / RTL i18n');
const mapKeys = [
  'mapViewCase', 'mapOpenInMaps', 'mapNavigate', 'mapBackToCase', 'mapCopyCoordinates',
  'mapCoordinatesCopied', 'mapSearchInMaps', 'mapNoGpsTextOnly', 'mapFullscreen',
  'mapExitFullscreen', 'mapReportedAt', 'mapStatus', 'mapPriority', 'mapGpsCoordinates',
] as const;
const en = translations.en as unknown as Record<string, string>;
const ur = translations.ur as unknown as Record<string, string>;
// Language-neutral acronyms (e.g. "GPS") are legitimately identical in EN/UR.
const NEUTRAL = new Set(['mapGpsCoordinates']);
for (const key of mapKeys) {
  const okEn = typeof en[key] === 'string' && en[key].length > 0;
  const okUr = typeof ur[key] === 'string' && ur[key].length > 0;
  const differs = NEUTRAL.has(key) || en[key] !== ur[key];
  assert(okEn && okUr && differs, `${key}: EN "${en[key]}" / UR "${ur[key]}"`);
}
assert(/dir=\{isUrdu \? 'rtl' : 'ltr'\}/.test(operatorPageSrc), 'Info card sets RTL direction for Urdu');

// ═══ N. No overflow on small screens ═══════════════════════
section('N. Contained card / no overflow');
assert(/maxWidth: 330/.test(googleMapSrc), 'InfoWindow maxWidth capped at 330px');
assert(/max-w-\[300px\]/.test(operatorPageSrc) && /max-w-\[300px\]/.test(caseDetailSrc), 'Card body capped so it never overflows the bubble');
assert(/\.gm-style \.gm-style-iw-d \{[\s\S]*?overflow: hidden auto/.test(globalsSrc), 'InfoWindow content scrolls instead of overflowing');
assert(/min-h-\[40px\] min-w-\[40px\]/.test(googleMapSrc), 'Overlay controls are ≥40px tap targets');
assert(/bottom-7 right-3/.test(googleMapSrc), 'Controls sit above the mobile bottom nav (bottom-7)');

// ═══ O. Reduced-motion + severity visuals ══════════════════
section('O. Reduced-motion, severity colours, pulse gating');
assert(URGENCY_MARKER_COLORS.CRITICAL === '#F85149' && URGENCY_MARKER_COLORS.HIGH === '#F0883E' && URGENCY_MARKER_COLORS.MEDIUM === '#D29922' && URGENCY_MARKER_COLORS.LOW === '#3FB950', 'Severity colours reuse the existing design tokens');
const critSym = markerSymbolFor({ type: 'EMERGENCY', urgency: 'CRITICAL' }, false);
const critSel = markerSymbolFor({ type: 'EMERGENCY', urgency: 'CRITICAL' }, true);
assert(critSym.path === EMERGENCY_PIN_PATH && critSym.fillColor === '#F85149', 'CRITICAL emergency uses the red pin');
assert(critSel.scale > critSym.scale && critSel.strokeColor === '#FFFFFF', 'Selected pin is larger with a white outline');
assert(shouldPulseMarker({ ...critMarker! }) === true, 'Open CRITICAL unassigned case pulses');
assert(shouldPulseMarker({ ...critMarker!, assigned: true }) === false, 'Assigned critical case does NOT pulse');
assert(shouldPulseMarker({ ...critMarker!, caseStatus: 'COMPLETED' }) === false, 'Completed case never animates');
assert(shouldPulseMarker({ ...markers.find((m) => m.id === 'EMG-1002')! }) === false, 'Non-critical case does not pulse');
assert(pulseHaloSpec(0).scale !== pulseHaloSpec(1).scale, 'Pulse halo alternates between two phases');
assert(/prefers-reduced-motion: reduce/.test(googleMapSrc), 'Pulse is suppressed when the user prefers reduced motion');
assert(reducedMotionGate(), 'Reduced-motion preference disables the halo timer');

function reducedMotionGate(): boolean {
  // The halo sync must short-circuit to an empty list when reduced motion is on.
  return /reducedMotionRef\.current\s*\?\s*\[\s*\]/.test(googleMapSrc);
}

// ═══ Summary (async tail: exercise the clipboard helper) ═══
void (async () => {
  const copyResult = await copyTextToClipboard('24.8607, 67.0011');
  assert(typeof copyResult === 'boolean', 'copyTextToClipboard resolves a boolean and never throws (headless → false)');

  console.log(`\n${'─'.repeat(52)}`);
  console.log(`Operator map verify: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
})();
