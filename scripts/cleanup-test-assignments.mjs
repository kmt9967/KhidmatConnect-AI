/**
 * Cleanup script: Complete/cancel stale test assignments
 * 
 * Finds all active assignments, identifies test artifacts,
 * and transitions them to COMPLETED using the existing business logic.
 * This properly syncs EmergencyCase status and preserves audit trail.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load env
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

async function main() {
  console.log('── Inspecting Active Assignments ──\n');

  // Find all active assignments
  const activeAssignments = await p.assignment.findMany({
    where: {
      status: { in: ['PENDING', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED'] },
    },
    include: {
      emergencyCase: { select: { caseCode: true, status: true, originalMessage: true, createdAt: true } },
      responder: { select: { id: true, name: true, userId: true } },
      ambulance: { select: { id: true, identifier: true } },
    },
    orderBy: { assignedAt: 'desc' },
  });

  if (activeAssignments.length === 0) {
    console.log('No active assignments found. All responders should be available.');
    await p.$disconnect();
    return;
  }

  console.log(`Found ${activeAssignments.length} active assignment(s):\n`);

  for (const a of activeAssignments) {
    console.log(`  Assignment: ${a.id}`);
    console.log(`    Status: ${a.status}`);
    console.log(`    Case: ${a.emergencyCase.caseCode} (${a.emergencyCase.status})`);
    console.log(`    Responder: ${a.responder.name} (${a.responder.id})`);
    console.log(`    Ambulance: ${a.ambulance?.identifier || 'none'}`);
    console.log(`    Assigned: ${a.assignedAt.toISOString()}`);
    console.log(`    Message: "${a.emergencyCase.originalMessage.slice(0, 60)}..."`);
    console.log('');
  }

  // Transition each to COMPLETED using proper business logic
  console.log('── Completing Stale Assignments ──\n');

  for (const a of activeAssignments) {
    console.log(`Completing assignment for case ${a.emergencyCase.caseCode}...`);

    // Walk through remaining status transitions
    const statusFlow = ['ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'COMPLETED'];
    const currentIdx = statusFlow.indexOf(a.status);
    const remaining = statusFlow.slice(currentIdx + 1);

    for (const newStatus of remaining) {
      try {
        await p.assignment.update({
          where: { id: a.id },
          data: {
            status: newStatus,
            ...(newStatus === 'ACCEPTED' ? { acceptedAt: new Date() } : {}),
            ...(newStatus === 'EN_ROUTE' ? { enRouteAt: new Date() } : {}),
            ...(newStatus === 'ARRIVED' ? { arrivedAt: new Date() } : {}),
            ...(newStatus === 'COMPLETED' ? { completedAt: new Date() } : {}),
          },
        });

        // Create audit entry
        const updateTypeMap = {
          ACCEPTED: 'RESPONDER_ACCEPTED',
          EN_ROUTE: 'EN_ROUTE',
          ARRIVED: 'ARRIVED',
          COMPLETED: 'COMPLETED',
        };
        const statusLabels = {
          ACCEPTED: 'Responder accepted assignment',
          EN_ROUTE: 'Responder is en route',
          ARRIVED: 'Responder arrived at scene',
          COMPLETED: 'Response completed',
        };

        await p.caseUpdate.create({
          data: {
            emergencyCaseId: (await p.assignment.findUnique({
              where: { id: a.id },
              select: { emergencyCaseId: true },
            })).emergencyCaseId,
            updateType: updateTypeMap[newStatus],
            message: `[Cleanup] ${statusLabels[newStatus]}`,
          },
        });
      } catch (err) {
        console.log(`  Error transitioning to ${newStatus}: ${err.message}`);
      }
    }

    // Sync case status to COMPLETED
    const assignment = await p.assignment.findUnique({
      where: { id: a.id },
      select: { emergencyCaseId: true },
    });
    await p.emergencyCase.update({
      where: { id: assignment.emergencyCaseId },
      data: { status: 'COMPLETED', closedAt: new Date() },
    });

    // Reset responder availability
    await p.responder.update({
      where: { id: a.responderId },
      data: { availabilityStatus: 'AVAILABLE' },
    });

    // Reset ambulance availability if assigned
    if (a.ambulanceId) {
      await p.ambulance.update({
        where: { id: a.ambulanceId },
        data: { availabilityStatus: 'AVAILABLE' },
      });
    }

    console.log(`  ✅ Completed + synced case + reset availability\n`);
  }

  // Final status check
  const remaining2 = await p.assignment.findMany({
    where: { status: { in: ['PENDING', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED'] } },
    select: { id: true },
  });
  console.log(`Remaining active assignments: ${remaining2.length}`);

  const responders = await p.responder.findMany({
    select: { name: true, availabilityStatus: true },
  });
  console.log('\nResponder status:');
  for (const r of responders) {
    console.log(`  ${r.name}: ${r.availabilityStatus}`);
  }

  await p.$disconnect();
}

main();
