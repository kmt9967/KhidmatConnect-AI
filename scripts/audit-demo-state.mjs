// Read-only audit of demo DB state for M15 verification.
import { readFileSync } from 'fs';
import { resolve } from 'path';

const env = readFileSync(resolve('.env.local'), 'utf8');
for (const line of env.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eq = trimmed.indexOf('=');
  if (eq > 0) {
    let val = trimmed.slice(eq + 1);
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    process.env[trimmed.slice(0, eq)] = val;
  }
}

const { PrismaClient } = await import('@prisma/client');
const p = new PrismaClient();

const demoCases = await p.emergencyCase.findMany({
  where: { demoKey: { not: null } },
  orderBy: { createdAt: 'asc' },
  include: {
    categories: { select: { category: true } },
    assignments: {
      where: { status: { in: ['PENDING', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED'] } },
      include: { responder: { select: { name: true } }, ambulance: { select: { identifier: true } } },
    },
  },
});
console.log('--- DEMO CASES ---');
for (const c of demoCases) {
  const acts = c.assignments.map((a) => `${a.responder?.name}/${a.ambulance?.identifier}:${a.status}`).join(', ') || '-';
  console.log(`${c.caseCode} | ${c.demoKey} | ${c.status} | ${c.urgency} | ${c.categories.map((x) => x.category).join('+')} | active: ${acts}`);
}

console.log('--- RESPONDERS ---');
for (const r of await p.responder.findMany({ orderBy: { name: 'asc' } })) {
  console.log(`${r.name} | ${r.availabilityStatus} | lat=${r.currentLatitude ?? '-'} lng=${r.currentLongitude ?? '-'}`);
}
console.log('--- AMBULANCES ---');
for (const a of await p.ambulance.findMany({ orderBy: { identifier: 'asc' } })) {
  console.log(`${a.identifier} | ${a.availabilityStatus}`);
}

const activeByResponder = await p.assignment.groupBy({
  by: ['responderId'],
  where: { status: { in: ['PENDING', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED'] } },
  _count: true,
});
let violations = 0;
for (const g of activeByResponder) {
  if (g._count > 1) { violations++; console.log(`VIOLATION: responder ${g.responderId} has ${g._count} active assignments`); }
}
const responders = await p.responder.findMany();
for (const r of responders) {
  const hasActive = activeByResponder.some((g) => g.responderId === r.id && g._count > 0);
  if (hasActive && r.availabilityStatus === 'AVAILABLE') { violations++; console.log(`VIOLATION: ${r.name} active assignment but AVAILABLE`); }
  if (!hasActive && r.availabilityStatus === 'EN_ROUTE') { violations++; console.log(`VIOLATION: ${r.name} EN_ROUTE but no active assignment`); }
}
console.log(violations === 0 ? 'INVARIANTS: OK' : `INVARIANTS: ${violations} VIOLATIONS`);

await p.$disconnect();
