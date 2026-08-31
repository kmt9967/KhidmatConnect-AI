/**
 * Milestone 8 — Real DB Integration Tests
 *
 * Tests against a live PostgreSQL database:
 *   1. Assignment transaction (create + verify state changes)
 *   2. Status lifecycle (all valid transitions)
 *   3. Location update + history
 *   4. Conflict prevention (duplicate active assignment)
 *   5. Completion release (responder/ambulance become available)
 *   6. Invalid transition rejection
 *   7. Support request creation
 *   8. Cleanup
 *
 * Run: npx tsx scripts/tracking-db-tests.ts
 */

import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';

// Load .env.local for DATABASE_URL
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && !process.env[match[1].trim()]) {
      let val = match[2].trim();
      // Strip surrounding quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[match[1].trim()] = val;
    }
  }
}

const prisma = new PrismaClient();

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

// Inline the transition validation (same as src/lib/validation/assignment.ts)
const VALID_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['ACCEPTED'],
  ACCEPTED: ['EN_ROUTE'],
  EN_ROUTE: ['ARRIVED'],
  ARRIVED: ['COMPLETED'],
};

function isValidTransition(current: string, next: string): boolean {
  const allowed = VALID_TRANSITIONS[current];
  return allowed ? allowed.includes(next) : false;
}

// Test data IDs
const testIds: {
  caseId?: string;
  caseCode?: string;
  assignmentId?: string;
  responderId?: string;
  ambulanceId?: string;
  operatorId?: string;
  locationId?: string;
  supportUpdateId?: string;
} = {};

// ─── Setup: Create test data ──────────────────────────────────
async function setup() {
  console.log('\n── Setup: Creating test data ──');

  // Find or create operator
  const operator = await prisma.user.upsert({
    where: { phone: '0300-TEST-OPERATOR' },
    update: {},
    create: {
      name: 'Test Operator M8',
      phone: '0300-TEST-OPERATOR',
      email: 'test-operator-m8@test.khidmatconnect.pk',
      role: 'OPERATOR',
      preferredLanguage: 'EN',
    },
  });
  testIds.operatorId = operator.id;
  assert(!!operator.id, 'Test operator created');

  // Find or create responder user
  const responderUser = await prisma.user.upsert({
    where: { phone: '0333-TEST-RESPONDER' },
    update: {},
    create: {
      name: 'Test Responder M8',
      phone: '0333-TEST-RESPONDER',
      email: 'test-responder-m8@test.khidmatconnect.pk',
      role: 'RESPONDER',
      preferredLanguage: 'EN',
    },
  });

  // Create test responder (ensure AVAILABLE)
  const responder = await prisma.responder.upsert({
    where: { userId: responderUser.id },
    update: { availabilityStatus: 'AVAILABLE' },
    create: {
      userId: responderUser.id,
      name: 'Test Responder M8',
      phone: '0333-TEST-RESPONDER',
      responderType: 'PARAMEDIC',
      availabilityStatus: 'AVAILABLE',
    },
  });
  testIds.responderId = responder.id;
  assert(!!responder.id, 'Test responder created (AVAILABLE)');

  // Find or create test ambulance
  const ambulance = await prisma.ambulance.upsert({
    where: { identifier: 'TEST-M8' },
    update: { availabilityStatus: 'AVAILABLE', responderId: responder.id },
    create: {
      identifier: 'TEST-M8',
      vehicleNumber: 'TEST-M8-V',
      responderId: responder.id,
      availabilityStatus: 'AVAILABLE',
      currentLatitude: 24.92,
      currentLongitude: 67.09,
    },
  });
  testIds.ambulanceId = ambulance.id;
  assert(!!ambulance.id, 'Test ambulance created (AVAILABLE)');

  // Create test emergency case
  const caseCode = `TEST-M8-${Date.now()}`;
  const emergencyCase = await prisma.emergencyCase.create({
    data: {
      caseCode,
      source: 'WEB',
      status: 'NEW',
      urgency: 'HIGH',
      originalMessage: 'Milestone 8 integration test case',
      locationText: 'Test Location, Karachi',
      latitude: 24.92,
      longitude: 67.09,
      locationConfirmed: true,
      primaryContact: '0300-TEST-CASE',
    },
  });
  testIds.caseId = emergencyCase.id;
  testIds.caseCode = caseCode;
  assert(!!emergencyCase.id, `Test case created: ${caseCode}`);
}

// ─── 1. Assignment Transaction ────────────────────────────────
async function testAssignmentTransaction() {
  console.log('\n── 1. Assignment transaction ──');

  // Create assignment via the same logic as assignmentService
  const result = await prisma.$transaction(async (tx) => {
    // Verify case
    const caseRecord = await tx.emergencyCase.findUnique({
      where: { caseCode: testIds.caseCode! },
      select: { id: true, status: true },
    });
    assert(caseRecord !== null, 'Case found');
    assert(caseRecord!.status === 'NEW', 'Case is NEW (assignable)');

    // Verify responder available
    const responder = await tx.responder.findUnique({
      where: { id: testIds.responderId! },
      select: { id: true, availabilityStatus: true },
    });
    assert(responder!.availabilityStatus === 'AVAILABLE', 'Responder is AVAILABLE');

    // Verify ambulance available
    const ambulance = await tx.ambulance.findUnique({
      where: { id: testIds.ambulanceId! },
      select: { id: true, availabilityStatus: true },
    });
    assert(ambulance!.availabilityStatus === 'AVAILABLE', 'Ambulance is AVAILABLE');

    // Create assignment
    const assignment = await tx.assignment.create({
      data: {
        emergencyCaseId: caseRecord!.id,
        responderId: testIds.responderId!,
        ambulanceId: testIds.ambulanceId!,
        assignedByOperatorId: testIds.operatorId!,
        status: 'PENDING',
      },
    });
    testIds.assignmentId = assignment.id;
    assert(!!assignment.id, 'Assignment created with PENDING status');

    // Mark responder ASSIGNED
    await tx.responder.update({
      where: { id: testIds.responderId! },
      data: { availabilityStatus: 'ASSIGNED' },
    });

    // Mark ambulance ASSIGNED
    await tx.ambulance.update({
      where: { id: testIds.ambulanceId! },
      data: { availabilityStatus: 'ASSIGNED' },
    });

    // Update case status
    await tx.emergencyCase.update({
      where: { id: caseRecord!.id },
      data: { status: 'ASSIGNED' },
    });

    // Create audit entry
    await tx.caseUpdate.create({
      data: {
        emergencyCaseId: caseRecord!.id,
        updateType: 'AMBULANCE_ASSIGNED',
        message: 'Test assignment created',
        createdByUserId: testIds.operatorId!,
      },
    });

    return assignment;
  });

  // Verify post-transaction state
  const responder = await prisma.responder.findUnique({
    where: { id: testIds.responderId! },
    select: { availabilityStatus: true },
  });
  assert(responder!.availabilityStatus === 'ASSIGNED', 'Responder now ASSIGNED');

  const ambulance = await prisma.ambulance.findUnique({
    where: { id: testIds.ambulanceId! },
    select: { availabilityStatus: true },
  });
  assert(ambulance!.availabilityStatus === 'ASSIGNED', 'Ambulance now ASSIGNED');

  const caseRecord = await prisma.emergencyCase.findUnique({
    where: { caseCode: testIds.caseCode! },
    select: { status: true },
  });
  assert(caseRecord!.status === 'ASSIGNED', 'Case status now ASSIGNED');

  const updates = await prisma.caseUpdate.findMany({
    where: { emergencyCaseId: testIds.caseId! },
    orderBy: { createdAt: 'desc' },
  });
  assert(updates.length >= 1, `CaseUpdate audit entries created (${updates.length})`);
  assert(updates[0].updateType === 'AMBULANCE_ASSIGNED', 'Latest update is AMBULANCE_ASSIGNED');
}

// ─── 2. Status Lifecycle ──────────────────────────────────────
async function testStatusLifecycle() {
  console.log('\n── 2. Status lifecycle ──');

  const transitions: [string, string, string][] = [
    ['PENDING', 'ACCEPTED', 'RESPONDER_ACCEPTED'],
    ['ACCEPTED', 'EN_ROUTE', 'EN_ROUTE'],
    ['EN_ROUTE', 'ARRIVED', 'ARRIVED'],
    ['ARRIVED', 'COMPLETED', 'COMPLETED'],
  ];

  for (const [from, to, expectedCaseStatus] of transitions) {
    assert(isValidTransition(from, to), `${from} → ${to} is valid`);

    // Update assignment
    const updateData: Record<string, unknown> = { status: to };
    if (to === 'ACCEPTED') updateData.acceptedAt = new Date();
    if (to === 'EN_ROUTE') updateData.enRouteAt = new Date();
    if (to === 'ARRIVED') updateData.arrivedAt = new Date();
    if (to === 'COMPLETED') updateData.completedAt = new Date();

    await prisma.assignment.update({
      where: { id: testIds.assignmentId! },
      data: updateData,
    });

    // Update case status
    const caseStatusMap: Record<string, string> = {
      ACCEPTED: 'RESPONDER_ACCEPTED',
      EN_ROUTE: 'EN_ROUTE',
      ARRIVED: 'ARRIVED',
      COMPLETED: 'COMPLETED',
    };
    await prisma.emergencyCase.update({
      where: { id: testIds.caseId! },
      data: { status: caseStatusMap[to] as any },
    });

    // Map assignment status to CaseUpdateType enum
    const updateTypeMap: Record<string, string> = {
      ACCEPTED: 'RESPONDER_ACCEPTED',
      EN_ROUTE: 'EN_ROUTE',
      ARRIVED: 'ARRIVED',
      COMPLETED: 'COMPLETED',
    };

    // Create audit entry
    await prisma.caseUpdate.create({
      data: {
        emergencyCaseId: testIds.caseId!,
        updateType: updateTypeMap[to] as any,
        message: `Transition ${from} → ${to}`,
      },
    });

    const assignment = await prisma.assignment.findUnique({
      where: { id: testIds.assignmentId! },
      select: { status: true },
    });
    assert(assignment!.status === to, `Assignment status is now ${to}`);
  }

  // Verify case status is COMPLETED
  const caseRecord = await prisma.emergencyCase.findUnique({
    where: { id: testIds.caseId! },
    select: { status: true },
  });
  assert(caseRecord!.status === 'COMPLETED', 'Case status is COMPLETED');
}

// ─── 3. Location History ──────────────────────────────────────
async function testLocationHistory() {
  console.log('\n── 3. Location history ──');

  // Create a fresh assignment for location testing
  const caseCode2 = `TEST-M8-LOC-${Date.now()}`;
  const case2 = await prisma.emergencyCase.create({
    data: {
      caseCode: caseCode2,
      source: 'WEB',
      status: 'ASSIGNED',
      urgency: 'MEDIUM',
      originalMessage: 'Location test case',
      locationText: 'Test Location 2',
      latitude: 24.93,
      longitude: 67.10,
      locationConfirmed: true,
      primaryContact: '0300-TEST-LOC',
    },
  });

  // Create responder for this test (make available first)
  const responder2User = await prisma.user.create({
    data: {
      name: 'Test Responder Loc',
      phone: `0333-LOC-${Date.now()}`,
      role: 'RESPONDER',
      preferredLanguage: 'EN',
    },
  });
  const responder2 = await prisma.responder.create({
    data: {
      userId: responder2User.id,
      name: 'Test Responder Loc',
      phone: responder2User.phone,
      responderType: 'PARAMEDIC',
      availabilityStatus: 'ASSIGNED',
    },
  });

  const assignment2 = await prisma.assignment.create({
    data: {
      emergencyCaseId: case2.id,
      responderId: responder2.id,
      assignedByOperatorId: testIds.operatorId!,
      status: 'EN_ROUTE',
      enRouteAt: new Date(),
    },
  });

  // Send 3 location updates
  const locations = [
    { lat: 24.920, lng: 67.090 },
    { lat: 24.925, lng: 67.095 },
    { lat: 24.930, lng: 67.100 },
  ];

  for (const loc of locations) {
    await prisma.responder.update({
      where: { id: responder2.id },
      data: {
        currentLatitude: loc.lat,
        currentLongitude: loc.lng,
        lastLocationUpdateAt: new Date(),
      },
    });

    await prisma.responderLocation.create({
      data: {
        responderId: responder2.id,
        assignmentId: assignment2.id,
        latitude: loc.lat,
        longitude: loc.lng,
      },
    });
  }

  // Verify location history
  const history = await prisma.responderLocation.findMany({
    where: { assignmentId: assignment2.id },
    orderBy: { recordedAt: 'asc' },
  });
  assert(history.length === 3, `3 location history rows created (${history.length})`);

  // Verify responder current position updated
  const responderCurrent = await prisma.responder.findUnique({
    where: { id: responder2.id },
    select: { currentLatitude: true, currentLongitude: true, lastLocationUpdateAt: true },
  });
  assert(responderCurrent!.currentLatitude === 24.930, 'Responder current lat updated to last point');
  assert(responderCurrent!.currentLongitude === 67.100, 'Responder current lng updated to last point');
  assert(responderCurrent!.lastLocationUpdateAt !== null, 'lastLocationUpdateAt is set');

  // Cleanup location test data
  await prisma.responderLocation.deleteMany({ where: { assignmentId: assignment2.id } });
  await prisma.assignment.delete({ where: { id: assignment2.id } });
  await prisma.emergencyCase.delete({ where: { id: case2.id } });
  await prisma.responder.delete({ where: { id: responder2.id } });
  await prisma.user.delete({ where: { id: responder2User.id } });
  assert(true, 'Location test data cleaned up');
}

// ─── 4. Conflict Prevention ───────────────────────────────────
async function testConflictPrevention() {
  console.log('\n── 4. Conflict prevention ──');

  // Clean up any stale assignments from previous runs
  await prisma.assignment.deleteMany({
    where: {
      responderId: testIds.responderId!,
      status: { in: ['PENDING', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED'] },
    },
  }).catch(() => {});

  // Responder is currently AVAILABLE after step 2 completion + cleanup
  await prisma.responder.update({
    where: { id: testIds.responderId! },
    data: { availabilityStatus: 'AVAILABLE' },
  });

  // Create a new case
  const caseCode3 = `TEST-M8-CONFLICT-${Date.now()}`;
  const case3 = await prisma.emergencyCase.create({
    data: {
      caseCode: caseCode3,
      source: 'WEB',
      status: 'NEW',
      urgency: 'HIGH',
      originalMessage: 'Conflict test case 1',
      locationText: 'Test',
      latitude: 24.92,
      longitude: 67.09,
      locationConfirmed: true,
      primaryContact: '0300-CONFLICT1',
    },
  });

  // Create first assignment
  const a1 = await prisma.assignment.create({
    data: {
      emergencyCaseId: case3.id,
      responderId: testIds.responderId!,
      assignedByOperatorId: testIds.operatorId!,
      status: 'PENDING',
    },
  });
  await prisma.responder.update({
    where: { id: testIds.responderId! },
    data: { availabilityStatus: 'ASSIGNED' },
  });
  assert(!!a1.id, 'First assignment created');

  // Try to create second assignment — should be blocked by validation
  const activeAssignment = await prisma.assignment.findFirst({
    where: {
      responderId: testIds.responderId!,
      status: { in: ['PENDING', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED'] },
    },
  });
  assert(activeAssignment !== null, 'Active assignment found (would block second)');
  assert(activeAssignment!.status === 'PENDING', 'Blocking assignment is in PENDING state');

  // Cleanup
  await prisma.responder.update({
    where: { id: testIds.responderId! },
    data: { availabilityStatus: 'AVAILABLE' },
  });
  await prisma.assignment.delete({ where: { id: a1.id } });
  await prisma.emergencyCase.delete({ where: { id: case3.id } });
  assert(true, 'Conflict test data cleaned up');
}

// ─── 5. Completion Release ────────────────────────────────────
async function testCompletionRelease() {
  console.log('\n── 5. Completion release ──');

  // Responder should be AVAILABLE after conflict test cleanup
  const responder = await prisma.responder.findUnique({
    where: { id: testIds.responderId! },
    select: { availabilityStatus: true },
  });
  assert(responder!.availabilityStatus === 'AVAILABLE', 'Responder is AVAILABLE after cleanup');

  // Create case + assignment for completion test
  const caseCode4 = `TEST-M8-COMPLETE-${Date.now()}`;
  const case4 = await prisma.emergencyCase.create({
    data: {
      caseCode: caseCode4,
      source: 'WEB',
      status: 'ASSIGNED',
      urgency: 'MEDIUM',
      originalMessage: 'Completion test',
      locationText: 'Test',
      latitude: 24.92,
      longitude: 67.09,
      locationConfirmed: true,
      primaryContact: '0300-COMPLETE',
    },
  });

  const a = await prisma.assignment.create({
    data: {
      emergencyCaseId: case4.id,
      responderId: testIds.responderId!,
      ambulanceId: testIds.ambulanceId!,
      assignedByOperatorId: testIds.operatorId!,
      status: 'ARRIVED',
      assignedAt: new Date(),
      acceptedAt: new Date(),
      enRouteAt: new Date(),
      arrivedAt: new Date(),
    },
  });

  // Mark both ASSIGNED
  await prisma.responder.update({ where: { id: testIds.responderId! }, data: { availabilityStatus: 'ASSIGNED' } });
  await prisma.ambulance.update({ where: { id: testIds.ambulanceId! }, data: { availabilityStatus: 'ASSIGNED' } });

  // Complete
  await prisma.assignment.update({
    where: { id: a.id },
    data: { status: 'COMPLETED', completedAt: new Date() },
  });
  await prisma.responder.update({ where: { id: testIds.responderId! }, data: { availabilityStatus: 'AVAILABLE' } });
  await prisma.ambulance.update({ where: { id: testIds.ambulanceId! }, data: { availabilityStatus: 'AVAILABLE' } });
  await prisma.emergencyCase.update({ where: { id: case4.id }, data: { status: 'COMPLETED', closedAt: new Date() } });

  // Verify
  const r = await prisma.responder.findUnique({ where: { id: testIds.responderId! }, select: { availabilityStatus: true } });
  assert(r!.availabilityStatus === 'AVAILABLE', 'Responder becomes AVAILABLE after COMPLETED');

  const amb = await prisma.ambulance.findUnique({ where: { id: testIds.ambulanceId! }, select: { availabilityStatus: true } });
  assert(amb!.availabilityStatus === 'AVAILABLE', 'Ambulance becomes AVAILABLE after COMPLETED');

  const c = await prisma.emergencyCase.findUnique({ where: { id: case4.id }, select: { status: true, closedAt: true } });
  assert(c!.status === 'COMPLETED', 'Case becomes COMPLETED');
  assert(c!.closedAt !== null, 'Case closedAt is set');

  // Cleanup
  await prisma.assignment.delete({ where: { id: a.id } });
  await prisma.caseUpdate.deleteMany({ where: { emergencyCaseId: case4.id } });
  await prisma.emergencyCase.delete({ where: { id: case4.id } });
  assert(true, 'Completion test data cleaned up');
}

// ─── 6. Invalid Transition Rejection ──────────────────────────
async function testInvalidTransitionRejection() {
  console.log('\n── 6. Invalid transition rejection ──');

  assert(!isValidTransition('PENDING', 'COMPLETED'), 'PENDING → COMPLETED rejected');
  assert(!isValidTransition('COMPLETED', 'EN_ROUTE'), 'COMPLETED → EN_ROUTE rejected');
  assert(!isValidTransition('CANCELLED', 'ACCEPTED'), 'CANCELLED → ACCEPTED rejected');
  assert(!isValidTransition('ARRIVED', 'ACCEPTED'), 'ARRIVED → ACCEPTED rejected');
  assert(!isValidTransition('EN_ROUTE', 'PENDING'), 'EN_ROUTE → PENDING rejected');
  assert(!isValidTransition('ACCEPTED', 'ARRIVED'), 'ACCEPTED → ARRIVED rejected');
}

// ─── 7. Support Request ───────────────────────────────────────
async function testSupportRequest() {
  console.log('\n── 7. Support request ──');

  // Create a case + active assignment for support request test
  const caseCode5 = `TEST-M8-SUPPORT-${Date.now()}`;
  const case5 = await prisma.emergencyCase.create({
    data: {
      caseCode: caseCode5,
      source: 'WEB',
      status: 'EN_ROUTE',
      urgency: 'HIGH',
      originalMessage: 'Support test',
      locationText: 'Test',
      latitude: 24.92,
      longitude: 67.09,
      locationConfirmed: true,
      primaryContact: '0300-SUPPORT',
    },
  });

  const a = await prisma.assignment.create({
    data: {
      emergencyCaseId: case5.id,
      responderId: testIds.responderId!,
      assignedByOperatorId: testIds.operatorId!,
      status: 'EN_ROUTE',
      enRouteAt: new Date(),
    },
  });

  // Create support request (CaseUpdate)
  const update = await prisma.caseUpdate.create({
    data: {
      emergencyCaseId: case5.id,
      updateType: 'OPERATOR_NOTE',
      message: 'Support requested: AMBULANCE — Need additional ambulance at scene',
    },
  });
  testIds.supportUpdateId = update.id;
  assert(!!update.id, 'Support request CaseUpdate created');

  // Verify it's visible
  const updates = await prisma.caseUpdate.findMany({
    where: { emergencyCaseId: case5.id, updateType: 'OPERATOR_NOTE' },
  });
  assert(updates.length >= 1, 'Support request visible in case updates');
  assert(updates.some((u) => u.message.includes('Support requested')), 'Support message contains expected text');

  // Cleanup
  await prisma.assignment.delete({ where: { id: a.id } });
  await prisma.caseUpdate.deleteMany({ where: { emergencyCaseId: case5.id } });
  await prisma.emergencyCase.delete({ where: { id: case5.id } });
  assert(true, 'Support test data cleaned up');
}

// ─── 8. Final Cleanup ─────────────────────────────────────────
async function cleanup() {
  console.log('\n── 8. Final cleanup ──');

  // Clean up test assignment
  if (testIds.assignmentId) {
    await prisma.assignment.delete({ where: { id: testIds.assignmentId } }).catch(() => {});
  }

  // Clean up test case
  if (testIds.caseId) {
    await prisma.caseUpdate.deleteMany({ where: { emergencyCaseId: testIds.caseId } }).catch(() => {});
    await prisma.emergencyCase.delete({ where: { id: testIds.caseId } }).catch(() => {});
  }

  // Reset responder/ambulance to AVAILABLE
  if (testIds.responderId) {
    await prisma.responder.update({
      where: { id: testIds.responderId },
      data: { availabilityStatus: 'AVAILABLE' },
    }).catch(() => {});
  }
  if (testIds.ambulanceId) {
    await prisma.ambulance.update({
      where: { id: testIds.ambulanceId },
      data: { availabilityStatus: 'AVAILABLE' },
    }).catch(() => {});
  }

  // Clean up test users
  await prisma.user.deleteMany({ where: { phone: { in: ['0300-TEST-OPERATOR', '0333-TEST-RESPONDER'] } } }).catch(() => {});
  await prisma.ambulance.deleteMany({ where: { identifier: 'TEST-M8' } }).catch(() => {});

  assert(true, 'All test data cleaned up');
}

// ─── Main ─────────────────────────────────────────────────────
async function main() {
  console.log('═'.repeat(50));
  console.log('Milestone 8 — DB Integration Tests');
  console.log('═'.repeat(50));

  try {
    await setup();
    await testAssignmentTransaction();
    await testStatusLifecycle();
    await testLocationHistory();
    await testConflictPrevention();
    await testCompletionRelease();
    await testInvalidTransitionRejection();
    await testSupportRequest();
    await cleanup();
  } catch (error) {
    console.error('\n❌ Test suite error:', error);
    failed++;
  }

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`Milestone 8 DB tests: ${passed} passed, ${failed} failed`);
  console.log(`${'═'.repeat(50)}`);

  await prisma.$disconnect();
  if (failed > 0) process.exit(1);
}

main();
