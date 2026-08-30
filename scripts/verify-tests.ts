/**
 * Milestone 5 — Focused verification tests
 *
 * Tests security-critical logic WITHOUT a database:
 *   1. Token generation uniqueness
 *   2. Token hashing / validation round-trip
 *   3. Expired token rejection (simulated)
 *   4. Revoked token rejection (simulated)
 *   5. Zod validation — valid payloads
 *   6. Zod validation — invalid latitude/longitude
 *   7. Zod validation — missing required fields
 *   8. Zod validation — oversized inputs
 *   9. Zod validation — invalid categories
 *
 * Run: npx tsx scripts/verify-tests.ts
 */

import crypto from 'node:crypto';
import { z } from 'zod';

// ─── Inline the pure logic (no DB dependency) ──────────────

const TOKEN_LENGTH = 48;
const TOKEN_EXPIRY_DAYS = 90;

function generateRawToken(): string {
  return crypto.randomBytes(TOKEN_LENGTH).toString('hex');
}

function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

// ─── Inline Zod schemas (same as src/lib/validation) ───────

const createEmergencyCaseSchema = z.object({
  source: z.enum(['WEB', 'VOICE_CALL']),
  primaryContact: z.string().min(5).max(30),
  alternateContact: z.string().max(30).optional(),
  originalMessage: z.string().min(1).max(5000),
  transcript: z.string().max(20000).optional(),
  locationText: z.string().max(500).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  locationAccuracy: z.number().min(0).max(100000).optional(),
  categories: z
    .array(z.enum(['RESCUE', 'MEDICAL', 'FOOD', 'WATER', 'SHELTER', 'TRANSPORT', 'SUPPLIES', 'OTHER']))
    .min(1)
    .max(5),
  detectedLanguage: z.string().max(50).optional(),
  aiSummary: z.string().max(2000).optional(),
  aiReasoning: z.string().max(5000).optional(),
  urgency: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional(),
  aiConfidence: z.number().min(0).max(1).optional(),
});

const addCaseUpdateSchema = z.object({
  message: z.string().min(1).max(5000),
});

// ─── Test runner ────────────────────────────────────────────

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

function assertThrows(fn: () => void, label: string) {
  try {
    fn();
    failed++;
    console.error(`  ✗ ${label} (did not throw)`);
  } catch {
    passed++;
    console.log(`  ✓ ${label}`);
  }
}

// ─── 1. Token generation uniqueness ─────────────────────────

console.log('\n1. Token generation uniqueness');
const tokens = new Set<string>();
for (let i = 0; i < 100; i++) {
  tokens.add(generateRawToken());
}
assert(tokens.size === 100, '100 generated tokens are all unique');

const sampleToken = generateRawToken();
assert(sampleToken.length === 96, `Raw token is 96 hex chars (got ${sampleToken.length})`);
assert(/^[0-9a-f]{96}$/.test(sampleToken), 'Raw token is valid hex');

// ─── 2. Token hashing round-trip ────────────────────────────

console.log('\n2. Token hashing / validation round-trip');
const raw = generateRawToken();
const hash1 = hashToken(raw);
const hash2 = hashToken(raw);
assert(hash1 === hash2, 'Same token produces same hash (deterministic)');
assert(hash1.length === 64, `SHA-256 hash is 64 hex chars (got ${hash1.length})`);

const differentRaw = generateRawToken();
const hash3 = hashToken(differentRaw);
assert(hash1 !== hash3, 'Different tokens produce different hashes');
assert(raw !== differentRaw, 'Generated tokens are different');

// ─── 3. Expired token rejection (simulated) ─────────────────

console.log('\n3. Expired token rejection');
const expiresAtPast = new Date();
expiresAtPast.setDate(expiresAtPast.getDate() - 1);
const expiresAtFuture = new Date();
expiresAtFuture.setDate(expiresAtFuture.getDate() + TOKEN_EXPIRY_DAYS);

assert(expiresAtPast < new Date(), 'Past expiry date is correctly in the past');
assert(expiresAtFuture > new Date(), 'Future expiry date is correctly in the future');

// Simulate validation logic
function simulateExpiryCheck(expiresAt: Date): boolean {
  return expiresAt < new Date(); // true = expired
}
assert(simulateExpiryCheck(expiresAtPast) === true, 'Expired token detected');
assert(simulateExpiryCheck(expiresAtFuture) === false, 'Valid token not flagged as expired');

// ─── 4. Revoked token rejection (simulated) ─────────────────

console.log('\n4. Revoked token rejection');
function simulateRevocationCheck(revokedAt: Date | null): boolean {
  return revokedAt !== null; // true = revoked
}
assert(simulateRevocationCheck(null) === false, 'Non-revoked token passes check');
assert(simulateRevocationCheck(new Date()) === true, 'Revoked token detected');

// ─── 5. Zod — valid payloads ────────────────────────────────

console.log('\n5. Zod validation — valid payloads');

const validMinimal = {
  source: 'WEB' as const,
  primaryContact: '+923001234567',
  originalMessage: 'Building collapsed, people trapped',
  categories: ['RESCUE' as const, 'MEDICAL' as const],
};
const result1 = createEmergencyCaseSchema.safeParse(validMinimal);
assert(result1.success === true, 'Minimal valid payload passes validation');

const validFull = {
  ...validMinimal,
  alternateContact: '+923009876543',
  transcript: 'Full conversation transcript...',
  locationText: 'Near Shahrah-e-Faisal, Karachi',
  latitude: 24.8607,
  longitude: 67.0011,
  locationAccuracy: 15,
  detectedLanguage: 'ur',
  aiSummary: 'Building collapse with multiple casualties',
  aiReasoning: 'Structural failure reported...',
  urgency: 'CRITICAL' as const,
  aiConfidence: 0.92,
};
const result2 = createEmergencyCaseSchema.safeParse(validFull);
assert(result2.success === true, 'Full valid payload passes validation');

const validVoiceCase = {
  source: 'VOICE_CALL' as const,
  primaryContact: '+923001234567',
  originalMessage: 'Flood water rising, family stuck on roof',
  categories: ['RESCUE' as const],
  locationText: 'Gulshan-e-Iqbal Block 7',
  latitude: 24.9167,
  longitude: 67.0833,
};
const result3 = createEmergencyCaseSchema.safeParse(validVoiceCase);
assert(result3.success === true, 'Voice call source case passes validation');

// ─── 6. Zod — invalid latitude/longitude ────────────────────

console.log('\n6. Zod validation — invalid latitude/longitude');

const invalidLat = { ...validMinimal, latitude: 91 };
const result4 = createEmergencyCaseSchema.safeParse(invalidLat);
assert(result4.success === false, 'Latitude > 90 rejected');

const invalidLat2 = { ...validMinimal, latitude: -91 };
const result5 = createEmergencyCaseSchema.safeParse(invalidLat2);
assert(result5.success === false, 'Latitude < -90 rejected');

const invalidLng = { ...validMinimal, longitude: 181 };
const result6 = createEmergencyCaseSchema.safeParse(invalidLng);
assert(result6.success === false, 'Longitude > 180 rejected');

const invalidLng2 = { ...validMinimal, longitude: -181 };
const result7 = createEmergencyCaseSchema.safeParse(invalidLng2);
assert(result7.success === false, 'Longitude < -180 rejected');

// ─── 7. Zod — missing required fields ───────────────────────

console.log('\n7. Zod validation — missing required fields');

const noContact = { source: 'WEB', originalMessage: 'Help needed', categories: ['RESCUE'] };
const result8 = createEmergencyCaseSchema.safeParse(noContact);
assert(result8.success === false, 'Missing primaryContact rejected');

const noMessage = { source: 'WEB', primaryContact: '+923001234567', categories: ['RESCUE'] };
const result9 = createEmergencyCaseSchema.safeParse(noMessage);
assert(result9.success === false, 'Missing originalMessage rejected');

const noCategories = { source: 'WEB', primaryContact: '+923001234567', originalMessage: 'Help' };
const result10 = createEmergencyCaseSchema.safeParse(noCategories);
assert(result10.success === false, 'Missing categories rejected');

const emptyCategories = { ...validMinimal, categories: [] };
const result11 = createEmergencyCaseSchema.safeParse(emptyCategories);
assert(result11.success === false, 'Empty categories array rejected');

const noSource = { primaryContact: '+923001234567', originalMessage: 'Help', categories: ['RESCUE'] };
const result12 = createEmergencyCaseSchema.safeParse(noSource);
assert(result12.success === false, 'Missing source rejected');

// ─── 8. Zod — oversized inputs ──────────────────────────────

console.log('\n8. Zod validation — oversized inputs');

const longMessage = { ...validMinimal, originalMessage: 'x'.repeat(5001) };
const result13 = createEmergencyCaseSchema.safeParse(longMessage);
assert(result13.success === false, 'Message > 5000 chars rejected');

const longContact = { ...validMinimal, primaryContact: 'x'.repeat(31) };
const result14 = createEmergencyCaseSchema.safeParse(longContact);
assert(result14.success === false, 'Contact > 30 chars rejected');

const tooManyCategories = { ...validMinimal, categories: ['RESCUE', 'MEDICAL', 'FOOD', 'WATER', 'SHELTER', 'TRANSPORT'] as const };
const result15 = createEmergencyCaseSchema.safeParse(tooManyCategories);
assert(result15.success === false, 'More than 5 categories rejected');

const shortContact = { ...validMinimal, primaryContact: '1234' };
const result16 = createEmergencyCaseSchema.safeParse(shortContact);
assert(result16.success === false, 'Contact < 5 chars rejected');

// ─── 9. Zod — invalid enum values ───────────────────────────

console.log('\n9. Zod validation — invalid enum/category values');

const invalidSource = { ...validMinimal, source: 'PHONE' };
const result17 = createEmergencyCaseSchema.safeParse(invalidSource);
assert(result17.success === false, 'Invalid source value rejected');

const invalidCategory = { ...validMinimal, categories: ['FIREFIGHTING'] };
const result18 = createEmergencyCaseSchema.safeParse(invalidCategory);
assert(result18.success === false, 'Invalid category value rejected');

const invalidUrgency = { ...validMinimal, urgency: 'EXTREME' };
const result19 = createEmergencyCaseSchema.safeParse(invalidUrgency);
assert(result19.success === false, 'Invalid urgency value rejected');

const confidenceTooHigh = { ...validMinimal, aiConfidence: 1.1 };
const result20 = createEmergencyCaseSchema.safeParse(confidenceTooHigh);
assert(result20.success === false, 'aiConfidence > 1 rejected');

const confidenceNegative = { ...validMinimal, aiConfidence: -0.1 };
const result21 = createEmergencyCaseSchema.safeParse(confidenceNegative);
assert(result21.success === false, 'aiConfidence < 0 rejected');

// ─── 10. Case update validation ─────────────────────────────

console.log('\n10. Case update validation');

const validUpdate = { message: 'We are now at the back entrance' };
const result22 = addCaseUpdateSchema.safeParse(validUpdate);
assert(result22.success === true, 'Valid update message passes');

const emptyUpdate = { message: '' };
const result23 = addCaseUpdateSchema.safeParse(emptyUpdate);
assert(result23.success === false, 'Empty update message rejected');

const longUpdate = { message: 'x'.repeat(5001) };
const result24 = addCaseUpdateSchema.safeParse(longUpdate);
assert(result24.success === false, 'Update message > 5000 chars rejected');

const noMessageUpdate = {};
const result25 = addCaseUpdateSchema.safeParse(noMessageUpdate);
assert(result25.success === false, 'Missing message in update rejected');

// ─── Summary ────────────────────────────────────────────────

console.log(`\n${'═'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'═'.repeat(50)}\n`);

if (failed > 0) {
  process.exit(1);
}
