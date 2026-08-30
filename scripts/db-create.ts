import { PrismaClient } from '@prisma/client';

// Connect to the default 'postgres' database to create our app database
const postgresUrl = process.env.DATABASE_URL!.replace(/\/[^/]+\?/, '/postgres?');
const prisma = new PrismaClient({ datasources: { db: { url: postgresUrl } } });

async function main() {
  const check = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = 'khidmatconnect') as exists
  `;

  if (check[0].exists) {
    console.log('Database khidmatconnect already exists');
  } else {
    // CREATE DATABASE cannot run inside a transaction
    await prisma.$executeRawUnsafe('CREATE DATABASE khidmatconnect');
    console.log('Database khidmatconnect created successfully');
  }

  // Verify
  const dbs = await prisma.$queryRaw<{ datname: string }[]>`
    SELECT datname FROM pg_database WHERE datname = 'khidmatconnect'
  `;
  console.log('Verification — khidmatconnect exists:', dbs.length > 0);
}

main()
  .catch((e) => {
    console.error('FAILED:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
