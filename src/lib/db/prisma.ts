import { PrismaClient } from '@prisma/client';

/**
 * Prisma client singleton for Next.js.
 * Uses globalThis to avoid creating new instances on every hot reload in dev.
 * Server-side only — never import from client components.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
