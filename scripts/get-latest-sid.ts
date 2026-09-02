import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
  const session = await p.voiceCallSession.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { id: true, providerCallSid: true, status: true, createdAt: true },
  });
  console.log(JSON.stringify(session, null, 2));
  await p.$disconnect();
}
main();
