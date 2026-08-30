import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding KhidmatConnect AI database...\n');

  // ─── Users ──────────────────────────────────────────────
  const operatorUser = await prisma.user.upsert({
    where: { phone: '0300-1122001' },
    update: {},
    create: {
      name: 'Operator Fatima',
      phone: '0300-1122001',
      email: 'operator.fatima@demo.khidmatconnect.pk',
      role: 'OPERATOR',
      preferredLanguage: 'EN',
    },
  });

  const responderUser = await prisma.user.upsert({
    where: { phone: '0333-5121001' },
    update: {},
    create: {
      name: 'Ahmed Khan',
      phone: '0333-5121001',
      email: 'ahmed.khan@demo.khidmatconnect.pk',
      role: 'RESPONDER',
      preferredLanguage: 'UR',
    },
  });

  const citizenUser = await prisma.user.upsert({
    where: { phone: '0300-8241001' },
    update: {},
    create: {
      name: 'Ahmed Tariq',
      phone: '0300-8241001',
      email: 'ahmed.tariq@demo.khidmatconnect.pk',
      role: 'CITIZEN',
      preferredLanguage: 'EN',
    },
  });

  console.log('✅ Users created:', operatorUser.name, responderUser.name, citizenUser.name);

  // ─── Responders ─────────────────────────────────────────
  const responder1 = await prisma.responder.upsert({
    where: { userId: responderUser.id },
    update: {},
    create: {
      userId: responderUser.id,
      name: 'Ahmed Khan',
      phone: '0333-5121001',
      responderType: 'PARAMEDIC',
      availabilityStatus: 'AVAILABLE',
      currentLatitude: 24.92,
      currentLongitude: 67.09,
    },
  });

  const responder2 = await prisma.responder.create({
    data: {
      userId: (await prisma.user.create({
        data: { name: 'Sara Ali', phone: '0333-5121002', role: 'RESPONDER', preferredLanguage: 'UR' },
      })).id,
      name: 'Sara Ali',
      phone: '0333-5121002',
      responderType: 'FIELD_RESCUER',
      availabilityStatus: 'AVAILABLE',
    },
  });

  const responder3 = await prisma.responder.create({
    data: {
      userId: (await prisma.user.create({
        data: { name: 'Usman Raza', phone: '0333-5121003', role: 'RESPONDER', preferredLanguage: 'EN' },
      })).id,
      name: 'Usman Raza',
      phone: '0333-5121003',
      responderType: 'DRIVER',
      availabilityStatus: 'OFFLINE',
    },
  });

  console.log('✅ Responders created:', responder1.name, responder2.name, responder3.name);

  // ─── Ambulances ─────────────────────────────────────────
  const amb1 = await prisma.ambulance.upsert({
    where: { identifier: 'AKF-07' },
    update: {},
    create: {
      identifier: 'AKF-07',
      vehicleNumber: 'KHI-GL-8910',
      responderId: responder1.id,
      availabilityStatus: 'AVAILABLE',
      currentLatitude: 24.919,
      currentLongitude: 67.098,
    },
  });

  const amb2 = await prisma.ambulance.upsert({
    where: { identifier: 'AKF-12' },
    update: {},
    create: {
      identifier: 'AKF-12',
      vehicleNumber: 'KHI-KR-4455',
      responderId: responder2.id,
      availabilityStatus: 'AVAILABLE',
      currentLatitude: 24.835,
      currentLongitude: 67.125,
    },
  });

  const amb3 = await prisma.ambulance.upsert({
    where: { identifier: 'AKF-18' },
    update: {},
    create: {
      identifier: 'AKF-18',
      vehicleNumber: 'KHI-UP-7788',
      availabilityStatus: 'MAINTENANCE',
    },
  });

  console.log('✅ Ambulances created:', amb1.identifier, amb2.identifier, amb3.identifier);

  // ─── Resources ──────────────────────────────────────────
  const resources = [
    { name: 'Demo Medical Center East', type: 'MEDICAL_CENTER' as const, phone: '021-99201001', address: 'Gulshan-e-Iqbal Block 4, Karachi', latitude: 24.92, longitude: 67.098, capacity: '50 beds', availabilityStatus: 'AVAILABLE' as const },
    { name: 'Demo Shelter Gulshan', type: 'SHELTER' as const, phone: '0300-8877001', address: 'Gulshan Complex Community Center, Block 7', latitude: 24.9288, longitude: 67.1012, capacity: '85 persons', availabilityStatus: 'LIMITED' as const },
    { name: 'Demo Food Distribution Korangi', type: 'FOOD_CENTER' as const, phone: '021-38402001', address: 'Korangi Sector 5, Near Market', latitude: 24.855, longitude: 67.145, capacity: '500 ration packs', availabilityStatus: 'AVAILABLE' as const },
    { name: 'Demo Water Point Malir', type: 'WATER_POINT' as const, phone: '0313-9090001', address: 'Malir River Bridge, Karachi', latitude: 24.89, longitude: 67.16, capacity: '10,000 gallons', availabilityStatus: 'AVAILABLE' as const },
    { name: 'Demo Rescue Team East', type: 'RESCUE_TEAM' as const, phone: '1122', address: 'University Road Station, Karachi', latitude: 24.8963, longitude: 67.0722, capacity: 'Heavy Rescue + Boat', availabilityStatus: 'AVAILABLE' as const },
  ];

  for (const r of resources) {
    await prisma.resource.upsert({
      where: { id: `seed-${r.type.toLowerCase()}-${r.name.split(' ').pop()}` },
      update: {},
      create: { id: `seed-${r.type.toLowerCase()}-${r.name.split(' ').pop()}`, ...r, isDemo: true },
    });
  }

  console.log('✅ Resources created:', resources.length, 'demo resources');

  // ─── Summary ────────────────────────────────────────────
  console.log('\n🌿 Seed complete!');
  console.log('   Users: 5 (1 operator, 3 responders, 1 citizen)');
  console.log('   Responders: 3 (Ahmed Khan, Sara Ali, Usman Raza)');
  console.log('   Ambulances: 3 (AKF-07, AKF-12, AKF-18)');
  console.log('   Resources: 5 demo resources');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
