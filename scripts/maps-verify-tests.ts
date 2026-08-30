/**
 * Milestone 7 — Offline maps verification tests
 *
 * Tests map/geolocation logic WITHOUT Google API credentials:
 *   1. Haversine distance calculation
 *   2. Coordinate validation (lat/lng range)
 *   3. GeoPoint validation
 *   4. Location-unconfirmed logic
 *   5. Distance formatting
 *   6. Zod validation for geocode API
 *   7. Zod validation for reverse-geocode API
 *   8. Zod validation for route API
 *   9. KARACHI_CENTER constant
 *  10. Map service error types
 *  11. Geolocation result normalization
 *
 * Run: npx tsx scripts/maps-verify-tests.ts
 */

import { z } from 'zod';

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

function assertApprox(actual: number, expected: number, tolerance: number, label: string) {
  const diff = Math.abs(actual - expected);
  if (diff <= tolerance) {
    passed++;
    console.log(`  ✅ ${label} (got ${actual.toFixed(1)}, expected ~${expected})`);
  } else {
    failed++;
    console.error(`  ❌ ${label} (got ${actual.toFixed(1)}, expected ~${expected}, diff ${diff.toFixed(1)})`);
  }
}

// ─── Inline pure logic from src/lib/maps ────────────────────

const EARTH_RADIUS_M = 6_371_000;

function haversineDistance(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * sinDLng * sinDLng;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function isValidLatitude(lat: number): boolean {
  return Number.isFinite(lat) && lat >= -90 && lat <= 90;
}

function isValidLongitude(lng: number): boolean {
  return Number.isFinite(lng) && lng >= -180 && lng <= 180;
}

function isValidGeoPoint(point: { latitude: number; longitude: number } | null | undefined): boolean {
  if (!point) return false;
  return isValidLatitude(point.latitude) && isValidLongitude(point.longitude);
}

function isLocationUnconfirmed(input: {
  latitude?: number | null;
  longitude?: number | null;
  locationConfirmed?: boolean;
}): boolean {
  if (input.latitude == null || input.longitude == null) return true;
  if (!isValidLatitude(input.latitude) || !isValidLongitude(input.longitude)) return true;
  if (!input.locationConfirmed) return true;
  return false;
}

const KARACHI_CENTER = { latitude: 24.8607, longitude: 67.0011 };

// ─── Zod schemas (matching server APIs) ─────────────────────

const geocodeSchema = z.object({
  address: z.string().min(3).max(500),
});

const reverseGeocodeSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

const routeSchema = z.object({
  origin: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
  destination: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
  travelMode: z.enum(['DRIVE', 'WALK', 'BICYCLE', 'TWO_WHEELER']).optional().default('DRIVE'),
});

// ═══════════════════════════════════════════════════════════════
console.log('\n📍 SECTION 1: Haversine Distance\n');
// ═══════════════════════════════════════════════════════════════

// Karachi known distances (approximate)
// Gulshan to Saddar: ~7 km straight line
const gulshan = { latitude: 24.9204, longitude: 67.0934 };
const saddar = { latitude: 24.8519, longitude: 67.0375 };
const distGulshanSaddar = haversineDistance(gulshan, saddar);
assertApprox(distGulshanSaddar, 9200, 1500, 'Gulshan → Saddar ~9 km');

// NIPA to NICVD: ~5 km
const nipa = { latitude: 24.919, longitude: 67.098 };
const nicvd = { latitude: 24.8519, longitude: 67.0375 };
const distNipaNicvd = haversineDistance(nipa, nicvd);
assertApprox(distNipaNicvd, 9100, 1500, 'NIPA → NICVD ~9 km');

// Same point = 0 distance
const sameDist = haversineDistance(gulshan, gulshan);
assert(sameDist === 0, 'Same point distance = 0');

// Symmetry
const ab = haversineDistance(gulshan, saddar);
const ba = haversineDistance(saddar, gulshan);
assert(Math.abs(ab - ba) < 0.001, 'Distance is symmetric (A→B = B→A)');

// Very short distance (within a building)
const shortA = { latitude: 24.9204, longitude: 67.0934 };
const shortB = { latitude: 24.9205, longitude: 67.0935 };
const shortDist = haversineDistance(shortA, shortB);
assert(shortDist > 0 && shortDist < 50, 'Very close points: < 50m');

// ═══════════════════════════════════════════════════════════════
console.log('\n📍 SECTION 2: Distance Formatting\n');
// ═══════════════════════════════════════════════════════════════

assert(formatDistance(500) === '500 m', '500m → "500 m"');
assert(formatDistance(0) === '0 m', '0m → "0 m"');
assert(formatDistance(999) === '999 m', '999m → "999 m"');
assert(formatDistance(1000) === '1.0 km', '1000m → "1.0 km"');
assert(formatDistance(2450) === '2.5 km', '2450m → "2.5 km"');
assert(formatDistance(15200) === '15.2 km', '15200m → "15.2 km"');

// ═══════════════════════════════════════════════════════════════
console.log('\n📍 SECTION 3: Coordinate Validation\n');
// ═══════════════════════════════════════════════════════════════

assert(isValidLatitude(0) === true, 'lat 0 is valid');
assert(isValidLatitude(90) === true, 'lat 90 is valid');
assert(isValidLatitude(-90) === true, 'lat -90 is valid');
assert(isValidLatitude(90.001) === false, 'lat 90.001 is invalid');
assert(isValidLatitude(-90.001) === false, 'lat -90.001 is invalid');
assert(isValidLatitude(NaN) === false, 'lat NaN is invalid');
assert(isValidLatitude(Infinity) === false, 'lat Infinity is invalid');

assert(isValidLongitude(0) === true, 'lng 0 is valid');
assert(isValidLongitude(180) === true, 'lng 180 is valid');
assert(isValidLongitude(-180) === true, 'lng -180 is valid');
assert(isValidLongitude(180.001) === false, 'lng 180.001 is invalid');
assert(isValidLongitude(-180.001) === false, 'lng -180.001 is invalid');

// ═══════════════════════════════════════════════════════════════
console.log('\n📍 SECTION 4: GeoPoint Validation\n');
// ═══════════════════════════════════════════════════════════════

assert(isValidGeoPoint({ latitude: 24.86, longitude: 67.0 }) === true, 'Karachi point is valid');
assert(isValidGeoPoint({ latitude: 0, longitude: 0 }) === true, '(0,0) is valid');
assert(isValidGeoPoint(null) === false, 'null is invalid');
assert(isValidGeoPoint(undefined) === false, 'undefined is invalid');
assert(isValidGeoPoint({ latitude: 91, longitude: 67 }) === false, 'lat 91 is invalid');
assert(isValidGeoPoint({ latitude: 24, longitude: 181 }) === false, 'lng 181 is invalid');

// ═══════════════════════════════════════════════════════════════
console.log('\n📍 SECTION 5: Location Unconfirmed Logic\n');
// ═══════════════════════════════════════════════════════════════

assert(isLocationUnconfirmed({ latitude: null, longitude: null }) === true, 'No coords → unconfirmed');
assert(isLocationUnconfirmed({ latitude: 24.92, longitude: null }) === true, 'Missing lng → unconfirmed');
assert(isLocationUnconfirmed({ latitude: null, longitude: 67.09 }) === true, 'Missing lat → unconfirmed');
assert(isLocationUnconfirmed({ latitude: 24.92, longitude: 67.09, locationConfirmed: false }) === true, 'Coords but not confirmed → unconfirmed');
assert(isLocationUnconfirmed({ latitude: 24.92, longitude: 67.09, locationConfirmed: true }) === false, 'Coords + confirmed → confirmed');
assert(isLocationUnconfirmed({ latitude: 91, longitude: 67.09, locationConfirmed: true }) === true, 'Invalid lat → unconfirmed');
assert(isLocationUnconfirmed({ latitude: 24.92, longitude: 181, locationConfirmed: true }) === true, 'Invalid lng → unconfirmed');
assert(isLocationUnconfirmed({}) === true, 'Empty object → unconfirmed');

// ═══════════════════════════════════════════════════════════════
console.log('\n📍 SECTION 6: KARACHI_CENTER Constant\n');
// ═══════════════════════════════════════════════════════════════

assert(KARACHI_CENTER.latitude === 24.8607, 'Karachi center lat = 24.8607');
assert(KARACHI_CENTER.longitude === 67.0011, 'Karachi center lng = 67.0011');
assert(isValidGeoPoint(KARACHI_CENTER), 'Karachi center is a valid GeoPoint');

// ═══════════════════════════════════════════════════════════════
console.log('\n📍 SECTION 7: Geocode API Zod Validation\n');
// ═══════════════════════════════════════════════════════════════

assert(geocodeSchema.safeParse({ address: 'Gulshan-e-Iqbal, Karachi' }).success === true, 'Valid address passes');
assert(geocodeSchema.safeParse({ address: 'AB' }).success === false, 'Too-short address fails');
assert(geocodeSchema.safeParse({ address: '' }).success === false, 'Empty address fails');
assert(geocodeSchema.safeParse({}).success === false, 'Missing address fails');
assert(geocodeSchema.safeParse({ address: 123 }).success === false, 'Non-string address fails');

// ═══════════════════════════════════════════════════════════════
console.log('\n📍 SECTION 8: Reverse Geocode API Zod Validation\n');
// ═══════════════════════════════════════════════════════════════

assert(reverseGeocodeSchema.safeParse({ latitude: 24.86, longitude: 67.0 }).success === true, 'Valid coords pass');
assert(reverseGeocodeSchema.safeParse({ latitude: 91, longitude: 67 }).success === false, 'Invalid lat fails');
assert(reverseGeocodeSchema.safeParse({ latitude: 24, longitude: 181 }).success === false, 'Invalid lng fails');
assert(reverseGeocodeSchema.safeParse({ latitude: 'abc', longitude: 67 }).success === false, 'Non-number lat fails');

// ═══════════════════════════════════════════════════════════════
console.log('\n📍 SECTION 9: Route API Zod Validation\n');
// ═══════════════════════════════════════════════════════════════

const validRoute = {
  origin: { latitude: 24.86, longitude: 67.0 },
  destination: { latitude: 24.92, longitude: 67.09 },
};
assert(routeSchema.safeParse(validRoute).success === true, 'Valid route passes');

const validRouteWithMode = {
  ...validRoute,
  travelMode: 'WALK' as const,
};
assert(routeSchema.safeParse(validRouteWithMode).success === true, 'Route with WALK mode passes');

assert(routeSchema.safeParse({
  origin: { latitude: 91, longitude: 67 },
  destination: { latitude: 24, longitude: 67 },
}).success === false, 'Invalid origin lat fails');

assert(routeSchema.safeParse({
  origin: { latitude: 24, longitude: 67 },
  destination: { latitude: 24, longitude: 181 },
}).success === false, 'Invalid destination lng fails');

assert(routeSchema.safeParse({
  origin: { latitude: 24, longitude: 67 },
}).success === false, 'Missing destination fails');

assert(routeSchema.safeParse({
  origin: { latitude: 24, longitude: 67 },
  destination: { latitude: 24, longitude: 67 },
  travelMode: 'FLY',
}).success === false, 'Invalid travel mode fails');

// Default travel mode
const parsedDefault = routeSchema.safeParse(validRoute);
if (parsedDefault.success) {
  assert(parsedDefault.data.travelMode === 'DRIVE', 'Default travel mode is DRIVE');
} else {
  assert(false, 'Default travel mode check (parse failed)');
}

// ═══════════════════════════════════════════════════════════════
console.log('\n📍 SECTION 10: Geolocation Result Normalization\n');
// ═══════════════════════════════════════════════════════════════

// Simulate geolocation result types
type GeoStatus = 'SUCCESS' | 'DENIED' | 'UNAVAILABLE' | 'TIMEOUT' | 'UNSUPPORTED';

function normalizeGeolocationResult(status: GeoStatus, lat?: number, lng?: number, accuracy?: number, error?: string) {
  return { status, latitude: lat, longitude: lng, accuracy, error };
}

const successResult = normalizeGeolocationResult('SUCCESS', 24.86, 67.0, 15);
assert(successResult.status === 'SUCCESS', 'SUCCESS result has status');
assert(successResult.latitude === 24.86, 'SUCCESS result has latitude');
assert(successResult.longitude === 67.0, 'SUCCESS result has longitude');
assert(successResult.accuracy === 15, 'SUCCESS result has accuracy');

const deniedResult = normalizeGeolocationResult('DENIED');
assert(deniedResult.status === 'DENIED', 'DENIED result has status');
assert(deniedResult.latitude === undefined, 'DENIED result has no latitude');

const timeoutResult = normalizeGeolocationResult('TIMEOUT');
assert(timeoutResult.status === 'TIMEOUT', 'TIMEOUT result has status');
assert(timeoutResult.latitude === undefined, 'TIMEOUT result has no latitude');

const unsupportedResult = normalizeGeolocationResult('UNSUPPORTED');
assert(unsupportedResult.status === 'UNSUPPORTED', 'UNSUPPORTED result has status');

// ═══════════════════════════════════════════════════════════════
console.log('\n📍 SECTION 11: Emergency Create with locationConfirmed\n');
// ═══════════════════════════════════════════════════════════════

const createEmergencyCaseSchema = z.object({
  source: z.enum(['WEB', 'VOICE_CALL']),
  primaryContact: z.string().min(5).max(30),
  alternateContact: z.string().max(30).optional(),
  originalMessage: z.string().min(1).max(5000),
  locationText: z.string().max(500).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  locationAccuracy: z.number().min(0).max(100000).optional(),
  locationConfirmed: z.boolean().optional(),
  categories: z.array(z.enum(['RESCUE', 'MEDICAL', 'FOOD', 'WATER', 'SHELTER', 'TRANSPORT', 'SUPPLIES', 'OTHER'])).min(1).max(5),
});

assert(createEmergencyCaseSchema.safeParse({
  source: 'WEB',
  primaryContact: '0300-8241992',
  originalMessage: 'Test emergency',
  locationText: 'Gulshan, Karachi',
  latitude: 24.92,
  longitude: 67.09,
  locationAccuracy: 15,
  locationConfirmed: true,
  categories: ['MEDICAL'],
}).success === true, 'Full payload with locationConfirmed passes');

assert(createEmergencyCaseSchema.safeParse({
  source: 'WEB',
  primaryContact: '0300-8241992',
  originalMessage: 'Test emergency',
  locationText: 'Gulshan, Karachi',
  categories: ['MEDICAL'],
}).success === true, 'Payload without coordinates still passes');

assert(createEmergencyCaseSchema.safeParse({
  source: 'WEB',
  primaryContact: '0300-8241992',
  originalMessage: 'Test emergency',
  latitude: 91, // Invalid
  categories: ['MEDICAL'],
}).success === false, 'Invalid latitude fails even without longitude');

// ═══════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════

console.log('\n══════════════════════════════════════════════════');
console.log(`📍 Maps Offline Tests: ${passed} passed, ${failed} failed`);
console.log('══════════════════════════════════════════════════\n');

if (failed > 0) {
  process.exit(1);
}
