import { prisma } from '@/lib/db/prisma';

/**
 * Fetch resources with optional filters.
 * Returns only safe/public information.
 */
export async function getResources(filters?: {
  type?: string;
  availability?: string;
}) {
  const where: Record<string, unknown> = {};

  if (filters?.type) {
    where.type = filters.type;
  }

  if (filters?.availability) {
    where.availabilityStatus = filters.availability;
  }

  const resources = await prisma.resource.findMany({
    where,
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      type: true,
      phone: true,
      address: true,
      latitude: true,
      longitude: true,
      availabilityStatus: true,
      capacity: true,
      currentCapacity: true,
      isDemo: true,
    },
  });

  return resources;
}
