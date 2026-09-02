// One-off controlled cleanup: remove known automated-test/scratch cases that
// predate the curated M15 demo set. Matches ONLY the explicit message-prefix
// allow-list below; demo cases (demoKey != null) and anything unmatched are kept.
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
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '')) {
  console.error('REFUSING: DATABASE_URL is not localhost.');
  process.exit(1);
}

const { PrismaClient } = await import('@prisma/client');
const p = new PrismaClient();

const PREFIXES = [
  'M8 test', 'M8 smoke', 'TEST-M8', 'test case', 'Test case', 'test:',
  'M11 test', 'M12 test:', 'M12 invalid transition test:',
  'E2E test', 'smoke test', 'AI verify test', 'tracking test case',
  'Milestone 8 integration test',
];
// M9 voice webhook iteration artifacts — deterministic bulk-created rows.
const VOICE_ARTIFACT_MSG = 'Phone emergency call in progress';

const doomed = await p.emergencyCase.findMany({
  where: {
    demoKey: null,
    status: { notIn: ['COMPLETED', 'CLOSED'] },
    OR: [
      ...PREFIXES.map((prefix) => ({ originalMessage: { startsWith: prefix } })),
      { caseCode: { startsWith: 'TEST-M' } },
      { originalMessage: VOICE_ARTIFACT_MSG },
    ],
  },
  select: { id: true, caseCode: true, status: true, originalMessage: true },
});

for (const c of doomed) {
  console.log(`delete ${c.caseCode} [${c.status}] "${(c.originalMessage || '').slice(0, 60)}"`);
  await p.emergencyCase.delete({ where: { id: c.id } }); // cascades to assignments/updates/tokens
}
console.log(`Removed ${doomed.length} automated-test case(s).`);

const kept = await p.emergencyCase.findMany({
  where: { status: { notIn: ['COMPLETED', 'CLOSED'] } },
  select: { caseCode: true, demoKey: true },
  orderBy: { caseCode: 'asc' },
});
console.log('Remaining active queue:', kept.map((k) => k.caseCode + (k.demoKey ? '(demo)' : '(kept)')).join(', '));

await p.$disconnect();
