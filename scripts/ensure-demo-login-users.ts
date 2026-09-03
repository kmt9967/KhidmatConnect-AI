/**
 * Ensure the three canonical demo LOGIN identities exist and are linked.
 *
 * Background: /api/auth/login resolves demo users strictly by phone
 * (src/lib/auth/session.ts → DEMO_ACCOUNTS):
 *   CITIZEN    Ahmed Tariq   0300-8241001
 *   OPERATOR   Fatima        0300-1122001
 *   RESPONDER  Ahmed Khan    0333-5121001  (+ a Responder record linked via userId)
 *
 * This script ONLY upserts/fixes those identities and the responder linkage.
 * It never deletes or resets anything, never touches cases/assignments, and
 * never flips availability while an active assignment exists.
 *
 * Safe on production and idempotent — run it as often as you like:
 *   npx tsx scripts/ensure-demo-login-users.ts
 *
 * Env: loads KC_ENV_FILE → .env.local → .env.production (first found), then
 * connects with DATABASE_URL. Values already in the process environment
 * (e.g. injected by systemd/Passenger) win.
 */
import { PrismaClient, type AvailabilityStatus } from '@prisma/client';
import { loadEnvLocal } from './lib/env';

loadEnvLocal();

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('❌ DATABASE_URL not set. Aborting — refusing to run without a target database.');
  process.exit(1);
}
// Show only host/db (never the password).
let host = '(unknown)';
try {
  const u = new URL(dbUrl);
  host = `${u.hostname}${u.port ? ':' + u.port : ''}/${u.pathname.slice(1)}`;
} catch {
  /* unparseable — keep placeholder */
}
console.log(`🔐 ensure-demo-login-users — target DB: ${host}`);

const prisma = new PrismaClient();

/** True if this resource has an active assignment (must then NOT be made AVAILABLE). */
async function responderHasActive(responderId: string): Promise<boolean> {
  const a = await prisma.assignment.findFirst({
    where: { responderId, status: { in: ['PENDING', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED'] } },
  });
  return !!a;
}
async function ambulanceHasActive(ambulanceId: string): Promise<boolean> {
  const a = await prisma.assignment.findFirst({
    where: { ambulanceId, status: { in: ['PENDING', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED'] } },
  });
  return !!a;
}

async function upsertUserByPhone(phone: string, name: string, role: 'CITIZEN' | 'OPERATOR' | 'RESPONDER', language: 'EN' | 'UR') {
  const existing = await prisma.user.findFirst({ where: { phone } });
  if (existing) {
    // Preserve the existing identity (name etc); guarantee the ROLE matches
    // what the login flow needs. Never rename users that already exist.
    if (existing.role !== role) {
      return await prisma.user.update({ where: { id: existing.id }, data: { role } });
    }
    return existing;
  }
  return await prisma.user.create({
    data: {
      name,
      phone,
      role,
      preferredLanguage: language,
      email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@demo.khidmatconnect.pk`,
    },
  });
}

async function main() {
  // ─── 1. The three canonical login users ───────────────────
  const citizen = await upsertUserByPhone('0300-8241001', 'Ahmed Tariq', 'CITIZEN', 'EN');
  console.log(`✅ CITIZEN   ${citizen.name}  (${citizen.phone})  id=${citizen.id}`);

  const operator = await upsertUserByPhone('0300-1122001', 'Operator Fatima', 'OPERATOR', 'EN');
  console.log(`✅ OPERATOR  ${operator.name}  (${operator.phone})  id=${operator.id}`);

  const ahmedUser = await upsertUserByPhone('0333-5121001', 'Ahmed Khan', 'RESPONDER', 'UR');
  console.log(`✅ RESPONDER user ${ahmedUser.name}  (${ahmedUser.phone})  id=${ahmedUser.id}`);

  // ─── 2. Ahmed Khan's Responder record, linked via userId ──
  // Schema note: Responder.userId is REQUIRED (String @unique) — a "userId:
  // null" filter is a Prisma validation error, and no responder row can ever
  // be unlinked. Match order:
  //   a. responder already linked to the canonical login User
  //   b. responder carrying the seed's stable demo phone (linked to a legacy
  //      duplicate User row) → re-point its userId to the canonical User
  //   c. responder named 'Ahmed Khan' → re-point likewise
  //   d. none exists → create exactly one, linked to the canonical User
  // Re-pointing never touches assignments (they reference responder.id) and
  // never renames/deletes any row.
  let responder = await prisma.responder.findUnique({ where: { userId: ahmedUser.id } });
  if (!responder) {
    const byPhone = await prisma.responder.findFirst({ where: { phone: '0333-5121001' } });
    const legacy = byPhone ?? (await prisma.responder.findFirst({ where: { name: 'Ahmed Khan' } }));
    if (legacy) {
      // userId is @unique: only safe while the canonical user has no responder
      // (guaranteed — we are inside the !responder branch).
      responder = await prisma.responder.update({ where: { id: legacy.id }, data: { userId: ahmedUser.id } });
      console.log(`🔗 Re-pointed existing Ahmed Khan responder (${legacy.name}/${legacy.phone}) from user ${legacy.userId} → ${ahmedUser.id}`);
    } else {
      responder = await prisma.responder.create({
        data: {
          userId: ahmedUser.id,
          name: 'Ahmed Khan',
          phone: '0333-5121001',
          responderType: 'PARAMEDIC',
          availabilityStatus: 'AVAILABLE',
          currentLatitude: 24.92,
          currentLongitude: 67.09,
        },
      });
      console.log(`🆕 Created Ahmed Khan responder record id=${responder.id}`);
    }
  } else {
    console.log(`✅ Ahmed Khan responder record already linked id=${responder.id} (${responder.availabilityStatus})`);
  }

  // ─── 3. Walkthrough readiness — ONLY when nothing active holds them ─
  if (!(await responderHasActive(responder.id))) {
    const desired: Partial<Record<AvailabilityStatus, boolean>> = { ASSIGNED: true, EN_ROUTE: true };
    if (desired[responder.availabilityStatus]) {
      await prisma.responder.update({ where: { id: responder.id }, data: { availabilityStatus: 'AVAILABLE' } });
      console.log(`🔄 Ahmed Khan responder ${responder.availabilityStatus} → AVAILABLE (no active assignment)`);
    }
  } else {
    console.log('ℹ️  Ahmed Khan has an ACTIVE assignment — availability left untouched (invariant preserved).');
  }

  // Ambulance AKF-07 for the live walkthrough (create only if absent — never
  // modify existing ambulances beyond restoring availability when idle).
  let akf07 = await prisma.ambulance.findUnique({ where: { identifier: 'AKF-07' } });
  if (!akf07) {
    akf07 = await prisma.ambulance.create({
      data: {
        identifier: 'AKF-07',
        vehicleNumber: 'KHI-GL-8910',
        availabilityStatus: 'AVAILABLE',
        currentLatitude: 24.919,
        currentLongitude: 67.098,
      },
    });
    console.log(`🆕 Created ambulance AKF-07 id=${akf07.id}`);
  } else if (!(await ambulanceHasActive(akf07.id))) {
    if (akf07.availabilityStatus === 'ASSIGNED' || akf07.availabilityStatus === 'EN_ROUTE') {
      await prisma.ambulance.update({ where: { id: akf07.id }, data: { availabilityStatus: 'AVAILABLE' } });
      console.log(`🔄 AKF-07 ${akf07.availabilityStatus} → AVAILABLE (no active assignment)`);
    } else {
      console.log(`✅ AKF-07 exists (${akf07.availabilityStatus}) — left as-is.`);
    }
  } else {
    console.log('ℹ️  AKF-07 has an ACTIVE assignment — availability left untouched.');
  }

  // ─── 4. Final login-resolution preview (what /api/auth/login will find) ─
  console.log('\nLogin resolution preview:');
  for (const [role, phone] of [
    ['CITIZEN', '0300-8241001'],
    ['OPERATOR', '0300-1122001'],
    ['RESPONDER', '0333-5121001'],
  ] as const) {
    const u = await prisma.user.findFirst({ where: { phone } });
    console.log(`  ${role.padEnd(10)} → ${u ? `${u.name} (id=${u.id})` : 'STILL MISSING — investigate'}`);
  }
  console.log('\n✅ Demo login identities ensured. Nothing else was modified.');
}

main()
  .catch((e) => {
    console.error('❌ ensure-demo-login-users failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
