/**
 * M15 — Demo reset (development only).
 *
 * Restores a predictable demo state WITHOUT wiping the database:
 *   1. Releases stale ACTIVE assignments left behind by automated tests
 *      (walks them to COMPLETED through real business logic so the case
 *       status + audit trail stay consistent).
 *   2. Removes ONLY explicitly-known automated-test cases (message-prefix
 *      allow-list) and the demo cases the seed will rebuild.
 *   3. Resets responder / ambulance availability for any resource that now
 *      has no active assignment.
 *   4. Leaves genuine citizen submissions and seeded base resources intact.
 *
 * The seed itself (seed-demo-data.ts) is re-run afterwards by `npm run demo:reset`
 * to rebuild the demo scenario.
 *
 * SAFETY: refuses to run unless DATABASE_URL points at localhost AND
 *          NODE_ENV !== 'production'. Also requires an explicit --yes flag.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), '.env.local');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadEnvLocal();

const dbUrl = process.env.DATABASE_URL || '';
const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl);
const confirmed = process.argv.includes('--yes');

if (process.env.NODE_ENV === 'production') {
  console.error('❌ REFUSING: NODE_ENV=production. demo:reset is a development-only tool.');
  process.exit(1);
}
if (!isLocal) {
  console.error('❌ REFUSING: DATABASE_URL does not point at localhost. This tool never touches a remote/production DB.');
  process.exit(1);
}
if (!confirmed) {
  console.error('❌ Refusing to run without explicit confirmation. Add --yes (used by npm run demo:reset).');
  process.exit(1);
}

const prisma = new PrismaClient();

// Message prefixes that identify known automated-test cases (never genuine/seeded).
const AUTOMATED_TEST_PREFIXES = [
  'M11 test',
  'M12 test:',
  'M12 invalid transition test:',
  'E2E test',
  'smoke test',
  'AI verify test',
  'tracking test case',
  'Milestone 8 integration test',
];
// Deterministic artifacts of automated intake iteration (voice webhook bursts,
// TEST-M* harness case codes). Matched exactly — never on free-text citizen reports.
const AUTOMATED_TEST_EXACT_MESSAGES = ['Phone emergency call in progress'];
const AUTOMATED_TEST_CASE_CODE_PREFIXES = ['TEST-M'];

async function main() {
  console.log('🧹 Demo reset — releasing stale test assignments...\n');

  // 1. Release any active assignments (walk to COMPLETED through business logic)
  const active = await prisma.assignment.findMany({
    where: { status: { in: ['PENDING', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED'] } },
    include: { emergencyCase: { select: { id: true, caseCode: true, demoKey: true } } },
  });
  for (const a of active) {
    // Demo assignments belong to demo cases which are about to be deleted anyway.
    // Non-demo active assignments (automated test leftovers) are completed properly.
    await prisma.assignment.update({
      where: { id: a.id },
      data: {
        status: 'COMPLETED',
        acceptedAt: a.acceptedAt ?? new Date(),
        enRouteAt: a.enRouteAt ?? new Date(),
        arrivedAt: a.arrivedAt ?? new Date(),
        completedAt: new Date(),
      },
    });
    await prisma.caseUpdate.create({
      data: {
        emergencyCaseId: a.emergencyCaseId,
        updateType: 'COMPLETED',
        message: '[demo-reset] Stale assignment released to restore a clean demo state.',
      },
    });
    console.log(`   released assignment on ${a.emergencyCase.caseCode}`);
  }

  // 2. Delete known automated-test cases (demo cases are rebuilt by the seed regardless)
  const testCases = await prisma.emergencyCase.findMany({
    where: {
      demoKey: null,
      OR: [
        ...AUTOMATED_TEST_PREFIXES.map((p) => ({ originalMessage: { startsWith: p } })),
        ...AUTOMATED_TEST_EXACT_MESSAGES.map((m) => ({ originalMessage: m })),
        ...AUTOMATED_TEST_CASE_CODE_PREFIXES.map((p) => ({ caseCode: { startsWith: p } })),
      ],
    },
    select: { id: true, caseCode: true, originalMessage: true },
  });
  for (const tc of testCases) {
    await prisma.emergencyCase.delete({ where: { id: tc.id } }); // cascade handles children
    console.log(`   deleted test case ${tc.caseCode}`);
  }

  // 3. Remove demo cases (seed rebuilds them) — belt & braces; seed also purges these.
  const demoCases = await prisma.emergencyCase.findMany({ where: { demoKey: { not: null } }, select: { id: true } });
  if (demoCases.length > 0) {
    await prisma.emergencyCase.deleteMany({ where: { id: { in: demoCases.map((c) => c.id) } } });
    console.log(`   cleared ${demoCases.length} demo case(s) for rebuild`);
  }

  // 4. Reset availability for every resource with no active assignment.
  const remainingActiveByResp = await prisma.assignment.groupBy({ by: ['responderId'], where: { status: { in: ['PENDING', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED'] }, responderId: { not: null } } });
  const busyResponders = new Set(remainingActiveByResp.map((g) => g.responderId));
  const responders = await prisma.responder.findMany({ select: { id: true, name: true, availabilityStatus: true } });
  for (const r of responders) {
    if (!busyResponders.has(r.id) && r.availabilityStatus !== 'AVAILABLE' && r.availabilityStatus !== 'OFFLINE') {
      await prisma.responder.update({ where: { id: r.id }, data: { availabilityStatus: 'AVAILABLE' } });
      console.log(`   reset responder ${r.name} → AVAILABLE`);
    }
  }
  const remainingActiveByAmb = await prisma.assignment.groupBy({ by: ['ambulanceId'], where: { status: { in: ['PENDING', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED'] }, ambulanceId: { not: null } } });
  const busyAms = new Set(remainingActiveByAmb.map((g) => g.ambulanceId));
  const ambulances = await prisma.ambulance.findMany({ select: { id: true, identifier: true, availabilityStatus: true } });
  for (const amb of ambulances) {
    if (!busyAms.has(amb.id) && amb.availabilityStatus !== 'AVAILABLE' && amb.availabilityStatus !== 'MAINTENANCE' && amb.availabilityStatus !== 'OFFLINE') {
      await prisma.ambulance.update({ where: { id: amb.id }, data: { availabilityStatus: 'AVAILABLE' } });
      console.log(`   reset ambulance ${amb.identifier} → AVAILABLE`);
    }
  }

  const finalCounts = await Promise.all([
    prisma.emergencyCase.count(),
    prisma.assignment.count({ where: { status: { in: ['PENDING', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED'] } } }),
  ]);
  console.log(`\n✅ Cleanup done. Cases: ${finalCounts[0]} | Active assignments: ${finalCounts[1]}`);
  console.log('   Rebuilding demo scenario...\n');
}

main()
  .catch((e) => {
    console.error('❌ Demo reset failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
