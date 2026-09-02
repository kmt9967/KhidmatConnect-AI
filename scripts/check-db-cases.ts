import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function main() {
  const cases = await p.emergencyCase.findMany({
    take: 10,
    select: { caseCode: true, status: true, urgency: true, source: true },
    orderBy: { createdAt: 'desc' },
  });
  console.log('Cases in DB:', cases.length);
  console.log(JSON.stringify(cases, null, 2));

  const users = await p.user.findMany({
    select: { id: true, name: true, role: true },
  });
  console.log('\nUsers:', JSON.stringify(users, null, 2));
}

main().finally(() => p.$disconnect());
