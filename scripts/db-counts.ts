import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
  console.log('Users:', await p.user.count());
  console.log('Responders:', await p.responder.count());
  console.log('Ambulances:', await p.ambulance.count());
  console.log('Resources:', await p.resource.count());
}
main().then(() => p.$disconnect());
