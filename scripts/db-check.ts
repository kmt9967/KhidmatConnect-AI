import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Test connection
  const version = await prisma.$queryRaw<{ version: string }[]>`SELECT version()`;
  console.log('Connection OK —', version[0].version.split('on')[0].trim());

  // Check if khidmatconnect database exists
  const dbs = await prisma.$queryRaw<{ datname: string }[]>`
    SELECT datname FROM pg_database WHERE datname = 'khidmatconnect'
  `;
  console.log('khidmatconnect database exists:', dbs.length > 0);

  // Check current database
  const current = await prisma.$queryRaw<{ current_database: string }[]>`
    SELECT current_database()
  `;
  console.log('Connected to database:', current[0].current_database);
}

main()
  .catch((e) => {
    console.error('FAILED:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
