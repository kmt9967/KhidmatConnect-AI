/**
 * Milestone 7 — Live Google Maps tests
 *
 * Requires Google Maps API credentials in .env.local:
 *   GOOGLE_MAPS_SERVER_API_KEY=your_server_key
 *
 * Tests:
 *   1. Forward geocode: "Gulshan-e-Iqbal, Karachi"
 *   2. Reverse geocode: known Karachi coordinate
 *   3. Route: two synthetic Karachi coordinates
 *
 * Run: npx tsx scripts/google-live-tests.ts
 */

import { forwardGeocode, reverseGeocode } from '../src/lib/maps/geocoding';
import { computeRoute } from '../src/lib/maps/routing';

// Load .env.local
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) {
  const content = readFileSync(envPath, 'utf-8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      if (key && value) {
        process.env[key] = value;
      }
    }
  }
}

let passed = 0;
let failed = 0;
let skipped = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.error(`  ❌ ${label}`);
  }
}

function skip(label: string, reason: string) {
  skipped++;
  console.log(`  ⏭️  ${label} — ${reason}`);
}

async function main() {
  console.log('\n🗺️  Google Maps Live Tests\n');

  const serverKey = process.env.GOOGLE_MAPS_SERVER_API_KEY;

  if (!serverKey) {
    console.log('  ⚠️  GOOGLE_MAPS_SERVER_API_KEY is not configured in .env.local');
    console.log('  ⚠️  Live tests cannot run without credentials.\n');
    console.log('  Required configuration:');
    console.log('  1. Go to Google Cloud Console → APIs & Services → Credentials');
    console.log('  2. Create or use a server-side API key');
    console.log('  3. Restrict to: Geocoding API, Routes API');
    console.log('  4. Add to .env.local:');
    console.log('     GOOGLE_MAPS_SERVER_API_KEY=your_server_key_here');
    console.log('');
    console.log('  For browser maps, also add:');
    console.log('     NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_browser_key_here');
    console.log('  5. Restrict browser key to: HTTP referrers + Maps JavaScript API');
    console.log('');
    return;
  }

  console.log(`  Server key: ${serverKey.substring(0, 8)}...${serverKey.substring(serverKey.length - 4)}`);
  console.log('');

  // ═══════════════════════════════════════════════════════════════
  console.log('── 1. Forward Geocode: "Gulshan-e-Iqbal, Karachi" ──\n');
  // ═══════════════════════════════════════════════════════════════

  const geocodeResult = await forwardGeocode('Gulshan-e-Iqbal, Karachi, Pakistan');

  if ('error' in geocodeResult) {
    assert(false, `Forward geocode failed: ${geocodeResult.error} — ${geocodeResult.message}`);
  } else {
    assert(geocodeResult.latitude > 24 && geocodeResult.latitude < 25, `Latitude ${geocodeResult.latitude.toFixed(4)} is in Karachi range`);
    assert(geocodeResult.longitude > 66 && geocodeResult.longitude < 68, `Longitude ${geocodeResult.longitude.toFixed(4)} is in Karachi range`);
    assert(geocodeResult.formattedAddress.length > 0, `Address: "${geocodeResult.formattedAddress.substring(0, 60)}..."`);
    assert(geocodeResult.confidenceType === 'PRECISE' || geocodeResult.confidenceType === 'APPROXIMATE', `Confidence: ${geocodeResult.confidenceType}`);
  }

  // ═══════════════════════════════════════════════════════════════
  console.log('\n── 2. Reverse Geocode: Karachi demo coordinate ──\n');
  // ═══════════════════════════════════════════════════════════════

  const reverseResult = await reverseGeocode(24.9204, 67.0934);

  if ('error' in reverseResult) {
    assert(false, `Reverse geocode failed: ${reverseResult.error} — ${reverseResult.message}`);
  } else {
    assert(reverseResult.formattedAddress.length > 0, `Address: "${reverseResult.formattedAddress.substring(0, 60)}..."`);
    assert(reverseResult.latitude === 24.9204, 'Latitude preserved');
    assert(reverseResult.longitude === 67.0934, 'Longitude preserved');
  }

  // ═══════════════════════════════════════════════════════════════
  console.log('\n── 3. Route: NIPA → NICVD (Karachi) ──\n');
  // ═══════════════════════════════════════════════════════════════

  const routeResult = await computeRoute({
    originLatitude: 24.919,
    originLongitude: 67.098,
    destinationLatitude: 24.8519,
    destinationLongitude: 67.0375,
    travelMode: 'DRIVE',
  });

  if ('error' in routeResult) {
    assert(false, `Route failed: ${routeResult.error} — ${routeResult.message}`);
  } else {
    assert(routeResult.distanceMeters > 0, `Distance: ${(routeResult.distanceMeters / 1000).toFixed(1)} km`);
    assert(routeResult.durationSeconds > 0, `Duration: ${Math.round(routeResult.durationSeconds / 60)} min`);
    assert(routeResult.travelMode === 'DRIVE', `Travel mode: ${routeResult.travelMode}`);
  }

  // ═══════════════════════════════════════════════════════════════
  console.log('\n══════════════════════════════════════════════════');
  console.log(`🗺️  Live Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  console.log('══════════════════════════════════════════════════\n');

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
