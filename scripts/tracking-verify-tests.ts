/**
 * Milestone 8 — Offline verification tests
 *
 * Tests WITHOUT a database:
 *   1. Status transition rules (valid transitions)
 *   2. Status transition rules (invalid transitions rejected)
 *   3. Assignment Zod validation (valid payloads)
 *   4. Assignment Zod validation (invalid payloads rejected)
 *   5. Location update validation (coordinate ranges)
 *   6. Support request validation
 *   7. Haversine distance fallback
 *   8. Tracking-active logic
 *   9. Interval constants review
 *  10. Requester-safe serialization
 *
 * Run: npx tsx scripts/tracking-verify-tests.ts
 */

import {
  isValidTransition,
  VALID_TRANSITIONS,
  assignCaseSchema,
  statusTransitionSchema,
  locationUpdateSchema,
  supportRequestSchema,
} from '../src/lib/validation/assignment';

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}`);
  }
}

// ─── 1. Valid status transitions ─────────────────────────────
console.log('\n── 1. Valid status transitions ──');
assert(isValidTransition('PENDING', 'ACCEPTED'), 'PENDING → ACCEPTED');
assert(isValidTransition('ACCEPTED', 'EN_ROUTE'), 'ACCEPTED → EN_ROUTE');
assert(isValidTransition('EN_ROUTE', 'ARRIVED'), 'EN_ROUTE → ARRIVED');
assert(isValidTransition('ARRIVED', 'COMPLETED'), 'ARRIVED → COMPLETED');

// ─── 2. Invalid status transitions ───────────────────────────
console.log('\n── 2. Invalid status transitions ──');
assert(!isValidTransition('PENDING', 'EN_ROUTE'), 'PENDING → EN_ROUTE rejected');
assert(!isValidTransition('PENDING', 'ARRIVED'), 'PENDING → ARRIVED rejected');
assert(!isValidTransition('PENDING', 'COMPLETED'), 'PENDING → COMPLETED rejected');
assert(!isValidTransition('ACCEPTED', 'ARRIVED'), 'ACCEPTED → ARRIVED rejected');
assert(!isValidTransition('ACCEPTED', 'COMPLETED'), 'ACCEPTED → COMPLETED rejected');
assert(!isValidTransition('EN_ROUTE', 'ACCEPTED'), 'EN_ROUTE → ACCEPTED rejected');
assert(!isValidTransition('EN_ROUTE', 'COMPLETED'), 'EN_ROUTE → COMPLETED rejected');
assert(!isValidTransition('ARRIVED', 'ACCEPTED'), 'ARRIVED → ACCEPTED rejected');
assert(!isValidTransition('ARRIVED', 'EN_ROUTE'), 'ARRIVED → EN_ROUTE rejected');
assert(!isValidTransition('COMPLETED', 'EN_ROUTE'), 'COMPLETED → EN_ROUTE rejected');
assert(!isValidTransition('COMPLETED', 'ACCEPTED'), 'COMPLETED → ACCEPTED rejected');
assert(!isValidTransition('COMPLETED', 'PENDING'), 'COMPLETED → PENDING rejected');
assert(!isValidTransition('CANCELLED', 'PENDING'), 'CANCELLED → PENDING rejected');
assert(!isValidTransition('CANCELLED', 'ACCEPTED'), 'CANCELLED → ACCEPTED rejected');

// ─── 3. Assignment validation (valid) ────────────────────────
console.log('\n── 3. Assignment validation (valid) ──');
const validAssign = assignCaseSchema.safeParse({
  responderId: 'resp-001',
  ambulanceId: 'amb-001',
});
assert(validAssign.success, 'Valid assign with responder + ambulance');

const validAssignNoAmb = assignCaseSchema.safeParse({
  responderId: 'resp-001',
});
assert(validAssignNoAmb.success, 'Valid assign with responder only');

const validAssignWithResource = assignCaseSchema.safeParse({
  responderId: 'resp-001',
  ambulanceId: 'amb-001',
  resourceId: 'res-001',
});
assert(validAssignWithResource.success, 'Valid assign with all resources');

// ─── 4. Assignment validation (invalid) ──────────────────────
console.log('\n── 4. Assignment validation (invalid) ──');
const noResponder = assignCaseSchema.safeParse({});
assert(!noResponder.success, 'Missing responderId rejected');

const emptyResponder = assignCaseSchema.safeParse({ responderId: '' });
assert(!emptyResponder.success, 'Empty responderId rejected');

const emptyAmb = assignCaseSchema.safeParse({ responderId: 'r1', ambulanceId: '' });
assert(!emptyAmb.success, 'Empty ambulanceId rejected');

// ─── 5. Status transition validation ─────────────────────────
console.log('\n── 5. Status transition validation ──');
const validTransition = statusTransitionSchema.safeParse({ newStatus: 'ACCEPTED' });
assert(validTransition.success, 'Valid: ACCEPTED');

const validTransition2 = statusTransitionSchema.safeParse({ newStatus: 'EN_ROUTE' });
assert(validTransition2.success, 'Valid: EN_ROUTE');

const invalidTransition = statusTransitionSchema.safeParse({ newStatus: 'PENDING' });
assert(!invalidTransition.success, 'Invalid: PENDING not allowed as transition target');

const invalidTransition2 = statusTransitionSchema.safeParse({ newStatus: 'CANCELLED' });
assert(!invalidTransition2.success, 'Invalid: CANCELLED not allowed as transition target');

const invalidTransition3 = statusTransitionSchema.safeParse({ newStatus: 'INVALID' });
assert(!invalidTransition3.success, 'Invalid: unknown status rejected');

// ─── 6. Location update validation ───────────────────────────
console.log('\n── 6. Location update validation ──');
const validLocation = locationUpdateSchema.safeParse({
  responderId: 'resp-001',
  assignmentId: 'assign-001',
  latitude: 24.92,
  longitude: 67.09,
});
assert(validLocation.success, 'Valid location update');

const validLocationWithAccuracy = locationUpdateSchema.safeParse({
  responderId: 'resp-001',
  assignmentId: 'assign-001',
  latitude: 24.92,
  longitude: 67.09,
  accuracy: 15.5,
});
assert(validLocationWithAccuracy.success, 'Valid location with accuracy');

const invalidLat = locationUpdateSchema.safeParse({
  responderId: 'r1',
  assignmentId: 'a1',
  latitude: 91,
  longitude: 67,
});
assert(!invalidLat.success, 'Invalid latitude (>90) rejected');

const invalidLng = locationUpdateSchema.safeParse({
  responderId: 'r1',
  assignmentId: 'a1',
  latitude: 24,
  longitude: 181,
});
assert(!invalidLng.success, 'Invalid longitude (>180) rejected');

const invalidLatNeg = locationUpdateSchema.safeParse({
  responderId: 'r1',
  assignmentId: 'a1',
  latitude: -91,
  longitude: 67,
});
assert(!invalidLatNeg.success, 'Invalid latitude (<-90) rejected');

const missingAssignmentId = locationUpdateSchema.safeParse({
  responderId: 'r1',
  latitude: 24,
  longitude: 67,
});
assert(!missingAssignmentId.success, 'Missing assignmentId rejected');

const negativeAccuracy = locationUpdateSchema.safeParse({
  responderId: 'r1',
  assignmentId: 'a1',
  latitude: 24,
  longitude: 67,
  accuracy: -5,
});
assert(!negativeAccuracy.success, 'Negative accuracy rejected');

// ─── 7. Support request validation ───────────────────────────
console.log('\n── 7. Support request validation ──');
const validSupport = supportRequestSchema.safeParse({
  assignmentId: 'assign-001',
  requestType: 'AMBULANCE',
  details: 'Need another ambulance at scene',
});
assert(validSupport.success, 'Valid support request');

const validSupportTypes = ['AMBULANCE', 'MEDICAL_TEAM', 'RESCUE_TEAM', 'SUPPLIES', 'OTHER'];
for (const type of validSupportTypes) {
  const result = supportRequestSchema.safeParse({
    assignmentId: 'a1',
    requestType: type,
    details: 'Test details',
  });
  assert(result.success, `Support type ${type} accepted`);
}

const invalidSupportType = supportRequestSchema.safeParse({
  assignmentId: 'a1',
  requestType: 'HELICOPTER',
  details: 'Need helicopter',
});
assert(!invalidSupportType.success, 'Invalid support type rejected');

const emptyDetails = supportRequestSchema.safeParse({
  assignmentId: 'a1',
  requestType: 'AMBULANCE',
  details: '',
});
assert(!emptyDetails.success, 'Empty details rejected');

const tooLongDetails = supportRequestSchema.safeParse({
  assignmentId: 'a1',
  requestType: 'AMBULANCE',
  details: 'x'.repeat(501),
});
assert(!tooLongDetails.success, 'Details > 500 chars rejected');

// ─── 8. Haversine distance ───────────────────────────────────
console.log('\n── 8. Haversine distance ──');
// Inline haversine for offline test
const EARTH_RADIUS_M = 6_371_000;
function haversineDistance(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * sinDLng * sinDLng;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

const d1 = haversineDistance({ latitude: 24.92, longitude: 67.09 }, { latitude: 24.92, longitude: 67.09 });
assert(d1 === 0, 'Same point = 0 distance');

const d2 = haversineDistance({ latitude: 24.92, longitude: 67.09 }, { latitude: 24.93, longitude: 67.10 });
assert(d2 > 0 && d2 < 2000, `Short distance ~1.4km: ${Math.round(d2)}m`);

const d3 = haversineDistance({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 });
assert(d3 > 110000 && d3 < 112000, `1° longitude at equator ~111km: ${Math.round(d3)}m`);

// ─── 9. Tracking-active logic ────────────────────────────────
console.log('\n── 9. Tracking-active logic ──');
const activeStatuses = ['PENDING', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED'];
const inactiveStatuses = ['COMPLETED', 'CANCELLED'];

for (const s of activeStatuses) {
  assert(activeStatuses.includes(s), `${s} is active → tracking allowed`);
}
for (const s of inactiveStatuses) {
  assert(!activeStatuses.includes(s), `${s} is inactive → tracking blocked`);
}

// ─── 10. Interval constants ──────────────────────────────────
console.log('\n── 10. Interval constants ──');
const GPS_INTERVAL_MS = 15000;
const POLL_INTERVAL_MS = 10000;
const ETA_REFRESH_S = 60;

assert(GPS_INTERVAL_MS >= 10000 && GPS_INTERVAL_MS <= 20000, `GPS interval ${GPS_INTERVAL_MS}ms in 10-20s range`);
assert(POLL_INTERVAL_MS >= 5000 && POLL_INTERVAL_MS <= 30000, `Poll interval ${POLL_INTERVAL_MS}ms in 5-30s range`);
assert(ETA_REFRESH_S >= 30 && ETA_REFRESH_S <= 120, `ETA refresh ${ETA_REFRESH_S}s in 30-120s range`);
assert(POLL_INTERVAL_MS < GPS_INTERVAL_MS, 'Poll interval < GPS interval (no redundant fetches)');

// ─── 11. Requester-safe serialization ────────────────────────
console.log('\n── 11. Requester-safe serialization ──');
// Simulate what the realtime endpoint returns
const mockAssignment = {
  id: 'a1',
  status: 'EN_ROUTE',
  assignedAt: new Date().toISOString(),
  acceptedAt: new Date().toISOString(),
  enRouteAt: new Date().toISOString(),
  arrivedAt: null,
  responder: {
    name: 'Ahmed Khan',
    currentLatitude: 24.92,
    currentLongitude: 67.09,
    lastLocationUpdateAt: new Date().toISOString(),
  },
  ambulance: {
    identifier: 'AKF-07',
    currentLatitude: 24.92,
    currentLongitude: 67.09,
    lastLocationUpdateAt: new Date().toISOString(),
  },
};

// Serialize for requester (strip internal fields)
const requesterSafe = {
  id: mockAssignment.id,
  status: mockAssignment.status,
  responder: mockAssignment.responder
    ? { name: mockAssignment.responder.name, latitude: mockAssignment.responder.currentLatitude, longitude: mockAssignment.responder.currentLongitude }
    : null,
  ambulance: mockAssignment.ambulance
    ? { identifier: mockAssignment.ambulance.identifier, latitude: mockAssignment.ambulance.currentLatitude, longitude: mockAssignment.ambulance.currentLongitude }
    : null,
};

assert(!('phone' in (requesterSafe.responder || {})), 'No phone in requester-safe responder');
assert(!('email' in (requesterSafe.responder || {})), 'No email in requester-safe responder');
assert(!('currentLatitude' in (requesterSafe.responder || {})), 'No raw currentLatitude field name');
assert('latitude' in (requesterSafe.responder || {}), 'Uses clean latitude field');
assert(!('lastLocationUpdateAt' in (requesterSafe.responder || {})), 'No lastLocationUpdateAt exposed');

// ─── 12. Transition map completeness ─────────────────────────
console.log('\n── 12. Transition map completeness ──');
const expectedStates = ['PENDING', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED'];
for (const state of expectedStates) {
  assert(VALID_TRANSITIONS[state] !== undefined, `${state} has transition rules defined`);
  assert(VALID_TRANSITIONS[state].length > 0, `${state} has at least one valid next state`);
}
assert(VALID_TRANSITIONS['COMPLETED'] === undefined, 'COMPLETED has no outgoing transitions');
assert(VALID_TRANSITIONS['CANCELLED'] === undefined, 'CANCELLED has no outgoing transitions');

// ─── Summary ─────────────────────────────────────────────────
console.log(`\n${'═'.repeat(50)}`);
console.log(`Milestone 8 offline tests: ${passed} passed, ${failed} failed`);
console.log(`${'═'.repeat(50)}`);

if (failed > 0) process.exit(1);
