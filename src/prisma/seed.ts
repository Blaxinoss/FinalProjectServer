// prisma/seed.ts
import { randomUUID } from 'crypto'; // ⬅️ لاستخدام UUIDs حقيقية

import { prisma } from '../routes/routes.js';
import { ReservationsStatus } from '../src/generated/prisma/index.js';
async function main() {
  console.log('🌱 Starting Prisma seeding...');

  // --- 1. Clean up existing data ---
  console.log('🧹 Clearing old Prisma data...');
  await prisma.paymentTransaction.deleteMany();
  await prisma.parkingSession.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.vehicle.deleteMany();
  await prisma.user.deleteMany();
  await prisma.parkingSlot.deleteMany();

  // --- 2. Create Parking Slots (الهيكل) ---
  console.log('🅿️ Creating parking slots...');
  await prisma.parkingSlot.createMany({
    data: [
      { id: 'A-01' }, { id: 'A-02' }, { id: 'B-01' }, { id: 'B-02' }, { id: 'C-01' },
    ],
  });

  // --- 3. Create Users and Vehicles ---
  console.log('👤 Creating users and vehicles...');
  const amr = await prisma.user.create({
    data: {
      uuid: randomUUID(), // ⬅️ تم إضافة UUID
      name: 'Amr Ahmed (Reservation)',
      phone: '01000000001',
      email: 'amr@test.com',
      // ❌ تم حذف Password
      // ❌ تم حذف pushToken
      NationalID: '29500000000001',
      address: '123 Giza St, Giza',
      licenseNumber: 'LIC-001',
      licenseExpiry: new Date('2026-10-10'),
      Vehicles: { create: { plate: 'أ ب ج 123', color: 'Black' } },
    },
    include: { Vehicles: true },
  });

  const karim = await prisma.user.create({
    data: {
      uuid: randomUUID(), // ⬅️ تم إضافة UUID
      name: 'Karim Saleh (Stacked)',
      phone: '01000000002',
      email: 'karim@test.com',
      NationalID: '29500000000002',
      address: '456 Dokki St, Giza',
      licenseNumber: 'LIC-002',
      licenseExpiry: new Date('2027-05-15'),
      Vehicles: { create: { plate: 'س ص ع 456', color: 'White' } },
    },
    include: { Vehicles: true },
  });

  const nader = await prisma.user.create({
    data: {
      uuid: randomUUID(), // ⬅️ تم إضافة UUID
      name: 'Nader Ali (Occupier)',
      phone: '01000000003',
      email: 'nader@test.com',
      NationalID: '29500000000003',
      address: '789 Haram St, Giza',
      licenseNumber: 'LIC-003',
      licenseExpiry: new Date('2025-11-20'),
      Vehicles: { create: { plate: 'م ن ل 789', color: 'Silver' } },
    },
    include: { Vehicles: true },
  });

  // --- 4. Create Test Case Data ---
  console.log('📅 Creating test cases...');
  const now = new Date();

  // **Test Case 1: Amr (Normal Reservation)**
  await prisma.reservation.create({
    data: {
      userId: amr.id,
      vehicleId: amr.Vehicles[0]!.id,
      slotId: 'A-01',
      startTime: new Date(now.getTime() - 30 * 60000),
      endTime: new Date(now.getTime() + 60 * 60000), // ينتهي بعد ساعة
      isStacked: false,
      status: ReservationsStatus.CONFIRMED,
    },
  });

  // **Test Case 2: Karim (Stacked Reservation with Conflict)**
  // أولاً: "نادر" يحتل المكان B-01
  await prisma.parkingSession.create({
    data: {
      userId: nader.id,
      vehicleId: nader.Vehicles[0]!.id,
      slotId: 'B-01',
      status: 'ACTIVE',
      entryTime: new Date(now.getTime() - 15 * 60000),
      // هذا هو الوقت الافتراضي الذي سنستخدمه لبدء أول جوب مؤجلة
      expectedExitTime: new Date(now.getTime() + 2 * 60 * 60000),
    },
  });

  // ثانيًا: حجز "كريم" على نفس المكان المشغول
  await prisma.reservation.create({
    data: {
      userId: karim.id,
      vehicleId: karim.Vehicles[0]!.id,
      slotId: 'B-01',
      startTime: now,
      endTime: new Date(now.getTime() + 3 * 60 * 60000), // ينتهي بعد 3 ساعات
      isStacked: true,
      status: ReservationsStatus.CONFIRMED,
    },
  });

  console.log('✅ Prisma seeding finished successfully!');
}

main()
  .catch((e) => { console.error('❌ Prisma seed failed:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });