import { readFileSync } from 'fs';
import { resolve } from 'path';

const envPath = resolve('.env.local');
const env = readFileSync(envPath, 'utf8');
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
const r = await p.responder.updateMany({ data: { availabilityStatus: 'AVAILABLE' } });
console.log('Updated', r.count, 'responders');
const a = await p.ambulance.updateMany({ data: { availabilityStatus: 'AVAILABLE' } });
console.log('Updated', a.count, 'ambulances');
await p.$disconnect();
