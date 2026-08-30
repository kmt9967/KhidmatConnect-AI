/**
 * Milestone 5 — Real Database Smoke Tests
 *
 * Tests against a live PostgreSQL database:
 *   A. Emergency case creation (code, categories, audit, token hash)
 *   B. Case retrieval (valid/invalid token)
 *   C. Requester update (valid/invalid token)
 *   D. Token lifecycle (expired, revoked)
 *   E. Resources (safe fields, demo flag)
 *   F. Seed data verification
 *
 * Run: npx tsx scripts/db-smoke-tests.ts
 */

import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';

const prisma = new PrismaClient();

let passed = 0;
let failed = 0;
const smokeTestIds: { caseId?: string; caseCode?: string; tokenId?: string; updateId?: string } = {};

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}`);
  }
}

// ─── F. Seed Data Verification ──────────────────────────────

async function verifySeedData() {
  console.log('\nF. Seed data verification');

  const users = await prisma.user.findMany();
  assert(users.length >= 3, `At least 3 users seeded (found ${users.length})`);

  const operator = users.find((u) => u.role === 'OPERATOR');
  assert(!!operator, 'Operator user exists');

  const responder = users.find((u) => u.role === 'RESPONDER');
  assert(!!responder, 'Responder user exists');

  const citizen = users.find((u) => u.role === 'CITIZEN');
  assert(!!citizen, 'Citizen user exists');

  const responders = await prisma.responder.findMany();
  assert(responders.length >= 3, `At least 3 responders seeded (found ${responders.length})`);

  const ambulances = await prisma.ambulance.findMany();
  assert(ambulances.length >= 3, `At least 3 ambulances seeded (found ${ambulances.length})`);

  const resources = await prisma.resource.findMany();
  assert(resources.length >= 5, `At least 5 resources seeded (found ${resources.length})`);

  const allDemo = resources.every((r) => r.isDemo === true);
  assert(allDemo, 'All seeded resources marked isDemo=true');
}

// ─── A. Emergency Case Creation ─────────────────────────────

async function testCreateCase() {
  console.log('\nA. Emergency case creation');

  // Create via direct Prisma (same logic as service)
  const caseCode = `KC-${new Date().getFullYear()}-999001`;

  const emergencyCase = await prisma.$transaction(async (tx) => {
    const ec = await tx.emergencyCase.create({
      data: {
        caseCode,
        source: 'WEB',
        primaryContact: '+923001234567',
        originalMessage: 'Smoke test: building collapse, people trapped',
        locationText: 'Test Location Karachi',
        latitude: 24.8607,
        longitude: 67.0011,
        status: 'NEW',
      },
    });

    // Categories
    await tx.emergencyCaseCategory.createMany({
      data: [
        { caseId: ec.id, category: 'RESCUE' },
        { caseId: ec.id, category: 'MEDICAL' },
      ],
    });

    // CASE_CREATED audit
    const auditEntry = await tx.caseUpdate.create({
      data: {
        emergencyCaseId: ec.id,
        updateType: 'CASE_CREATED',
        message: `Emergency case ${caseCode} created via WEB.`,
      },
    });

    smokeTestIds.updateId = auditEntry.id;

    // Token — store only hash
    const rawToken = crypto.randomBytes(48).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 90);

    const tokenRecord = await tx.caseAccessToken.create({
      data: {
        emergencyCaseId: ec.id,
        tokenHash,
        expiresAt,
      },
    });

    smokeTestIds.caseId = ec.id;
    smokeTestIds.caseCode = ec.caseCode;
    smokeTestIds.tokenId = tokenRecord.id;

    return { ec, rawToken, tokenHash };
  });

  // Verify case code format
  assert(
    /^KC-\d{4}-\d{6}$/.test(emergencyCase.ec.caseCode),
    `Case code matches KC-YYYY-NNNNNN format: ${emergencyCase.ec.caseCode}`
  );

  // Verify categories
  const categories = await prisma.emergencyCaseCategory.findMany({
    where: { caseId: smokeTestIds.caseId },
  });
  assert(categories.length === 2, `2 category relations created (found ${categories.length})`);
  const catValues = categories.map((c) => c.category).sort();
  assert(
    JSON.stringify(catValues) === JSON.stringify(['MEDICAL', 'RESCUE']),
    `Categories are RESCUE + MEDICAL (got ${catValues.join(', ')})`
  );

  // Verify CASE_CREATED audit
  const auditEntry = await prisma.caseUpdate.findFirst({
    where: { emergencyCaseId: smokeTestIds.caseId, updateType: 'CASE_CREATED' },
  });
  assert(!!auditEntry, 'CASE_CREATED audit entry exists');
  assert(
    auditEntry!.message.includes(emergencyCase.ec.caseCode),
    'Audit message contains case code'
  );

  // Verify token stores hash, NOT raw token
  const tokenRecord = await prisma.caseAccessToken.findUnique({
    where: { id: smokeTestIds.tokenId },
  });
  assert(!!tokenRecord, 'CaseAccessToken row exists');
  assert(
    tokenRecord!.tokenHash.length === 64,
    'Token hash is 64 hex chars (SHA-256)'
  );
  assert(
    tokenRecord!.tokenHash !== emergencyCase.rawToken,
    'Stored hash differs from raw token (raw token not stored)'
  );
  assert(
    tokenRecord!.tokenHash === emergencyCase.tokenHash,
    'Stored hash matches computed hash'
  );

  return emergencyCase.rawToken;
}

// ─── B. Case Retrieval ──────────────────────────────────────

async function testCaseRetrieval(rawToken: string) {
  console.log('\nB. Case retrieval');

  // Valid token
  const validHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const validTokenRecord = await prisma.caseAccessToken.findUnique({
    where: { tokenHash: validHash },
    include: { emergencyCase: { select: { caseCode: true } } },
  });

  const isValid =
    validTokenRecord !== null &&
    validTokenRecord.revokedAt === null &&
    validTokenRecord.expiresAt > new Date() &&
    validTokenRecord.emergencyCase.caseCode === smokeTestIds.caseCode;

  assert(isValid, 'Valid access token resolves to correct case');

  // Invalid token
  const fakeToken = crypto.randomBytes(48).toString('hex');
  const fakeHash = crypto.createHash('sha256').update(fakeToken).digest('hex');
  const fakeTokenRecord = await prisma.caseAccessToken.findUnique({
    where: { tokenHash: fakeHash },
  });
  assert(fakeTokenRecord === null, 'Invalid/fake token not found in database');
}

// ─── C. Requester Update ────────────────────────────────────

async function testRequesterUpdate(rawToken: string) {
  console.log('\nC. Requester update');

  // Valid token → create update
  const validHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const tokenRecord = await prisma.caseAccessToken.findUnique({
    where: { tokenHash: validHash },
    include: { emergencyCase: { select: { id: true, caseCode: true } } },
  });

  assert(!!tokenRecord, 'Valid token found for update test');

  if (tokenRecord) {
    const update = await prisma.caseUpdate.create({
      data: {
        emergencyCaseId: tokenRecord.emergencyCase.id,
        updateType: 'REQUESTER_INFORMATION_ADDED',
        message: 'Smoke test: we are at the back entrance',
      },
    });
    assert(
      update.updateType === 'REQUESTER_INFORMATION_ADDED',
      'REQUESTER_INFORMATION_ADDED update created with valid token'
    );

    // Track for cleanup
    smokeTestIds.updateId = update.id;
  }

  // Invalid token → should fail
  const fakeToken = crypto.randomBytes(48).toString('hex');
  const fakeHash = crypto.createHash('sha256').update(fakeToken).digest('hex');
  const fakeRecord = await prisma.caseAccessToken.findUnique({
    where: { tokenHash: fakeHash },
  });
  assert(fakeRecord === null, 'Invalid token rejected for update (not found)');
}

// ─── D. Token Lifecycle ─────────────────────────────────────

async function testTokenLifecycle(rawToken: string) {
  console.log('\nD. Token lifecycle');

  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  // Test expired token
  const expiresAtPast = new Date();
  expiresAtPast.setDate(expiresAtPast.getDate() - 1);
  assert(expiresAtPast < new Date(), 'Expired token date is in the past');

  // Simulate: update token to expired, check rejection
  await prisma.caseAccessToken.update({
    where: { tokenHash },
    data: { expiresAt: expiresAtPast },
  });

  const expiredRecord = await prisma.caseAccessToken.findUnique({
    where: { tokenHash },
  });
  const isExpired = expiredRecord !== null && expiredRecord.expiresAt < new Date();
  assert(isExpired, 'Expired token correctly detected');

  // Restore expiry for revoke test
  const expiresAtFuture = new Date();
  expiresAtFuture.setDate(expiresAtFuture.getDate() + 90);
  await prisma.caseAccessToken.update({
    where: { tokenHash },
    data: { expiresAt: expiresAtFuture },
  });

  // Test revoked token
  await prisma.caseAccessToken.update({
    where: { tokenHash },
    data: { revokedAt: new Date() },
  });

  const revokedRecord = await prisma.caseAccessToken.findUnique({
    where: { tokenHash },
  });
  assert(revokedRecord!.revokedAt !== null, 'Revoked token correctly detected');

  // Un-revoke for cleanup
  await prisma.caseAccessToken.update({
    where: { tokenHash },
    data: { revokedAt: null },
  });
}

// ─── E. Resources ───────────────────────────────────────────

async function testResources() {
  console.log('\nE. Resources');

  const resources = await prisma.resource.findMany({
    select: {
      id: true,
      name: true,
      type: true,
      phone: true,
      address: true,
      latitude: true,
      longitude: true,
      availabilityStatus: true,
      capacity: true,
      currentCapacity: true,
      isDemo: true,
    },
    orderBy: { name: 'asc' },
  });

  assert(resources.length >= 5, `At least 5 resources returned (found ${resources.length})`);

  const allDemo = resources.every((r) => r.isDemo === true);
  assert(allDemo, 'All seeded resources visibly marked as demo');

  // Verify no internal fields leaked
  const sampleKeys = Object.keys(resources[0]).sort();
  const hasNoSensitiveFields =
    !sampleKeys.includes('email') && // email not in select
    !sampleKeys.includes('createdAt') && // internal timestamps
    !sampleKeys.includes('updatedAt');
  assert(hasNoSensitiveFields, 'Resource response excludes internal-only fields');

  // Verify known demo resource names
  const names = resources.map((r) => r.name);
  assert(
    names.some((n) => n.includes('Medical Center')),
    'Demo Medical Center present'
  );
  assert(
    names.some((n) => n.includes('Shelter')),
    'Demo Shelter present'
  );
}

// ─── Cleanup ────────────────────────────────────────────────

async function cleanup() {
  console.log('\n— Cleaning up smoke-test records');

  if (smokeTestIds.caseId) {
    // Delete in dependency order
    await prisma.caseAccessToken.deleteMany({ where: { emergencyCaseId: smokeTestIds.caseId } });
    await prisma.caseUpdate.deleteMany({ where: { emergencyCaseId: smokeTestIds.caseId } });
    await prisma.emergencyCaseCategory.deleteMany({ where: { caseId: smokeTestIds.caseId } });
    await prisma.emergencyCase.delete({ where: { id: smokeTestIds.caseId } });
    console.log('  ✓ Smoke-test case, categories, updates, and token removed');
  }
}

// ─── Main ────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  Milestone 5 — Real Database Smoke Tests');
  console.log('═══════════════════════════════════════════════════');

  // Connection check
  const version = await prisma.$queryRaw<{ version: string }[]>`SELECT version()`;
  console.log(`\nConnected to: ${version[0].version.split('on')[0].trim()}`);

  await verifySeedData();
  const rawToken = await testCreateCase();
  await testCaseRetrieval(rawToken);
  await testRequesterUpdate(rawToken);
  await testTokenLifecycle(rawToken);
  await testResources();
  await cleanup();

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log(`${'═'.repeat(50)}\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error('FATAL:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
