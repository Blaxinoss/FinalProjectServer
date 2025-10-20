// prisma/seed.ts
import { PrismaClient } from "../src/generated/prisma/index.js";
const prisma = new PrismaClient();
async function main() {
  console.log('🌱 Starting database seeding...');

  // --- 1. Clean up existing data ---
  // الحذف بترتيب عكسي لإنشاء الجداول لتجنب مشاكل العلاقات
  console.log('🧹 Clearing old data...');
  await prisma.paymentTransaction.deleteMany();
  await prisma.parkingSession.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.vehicle.deleteMany();
  await prisma.user.deleteMany();
  await prisma.parkingSlot.deleteMany();

  // --- 2. Create Parking Slots ---
  console.log('🅿️ Creating parking slots...');
  const slotsData = [
    { id: 'A-01' },
    { id: 'A-02' },
    { id: 'B-01' }, // Slot for stackable test case
    { id: 'B-02' },
    { id: 'C-01' },
  ];
  await prisma.parkingSlot.createMany({
    data: slotsData,
  });

  // --- 3. Create Users and Vehicles ---
  console.log('👤 Creating users and vehicles...');
  const amr = await prisma.user.create({
    data: {
      name: 'Amr Ahmed',
      phone: '01001234567',
      email: 'amr@test.com',
      password: 'hashed_password_1',
      NationalID: '29501010101234',
      address: '123 Giza St, Giza',
      licenseNumber: 'ABC-123',
      licenseExpiry: new Date('2026-10-10'),
      Vehicles: {
        create: { plate: 'أ ب ج 123', color: 'Black' },
      },
    },
    include: { Vehicles: true },
  });

  const karim = await prisma.user.create({
    data: {
      name: 'Karim Saleh',
      phone: '01119876543',
      email: 'karim@test.com',
      password: 'hashed_password_2',
      NationalID: '29602020202345',
      address: '456 Dokki St, Giza',
      licenseNumber: 'DEF-456',
      licenseExpiry: new Date('2027-05-15'),
      Vehicles: {
        create: { plate: 'س ص ع 456', color: 'White' },
      },
    },
    include: { Vehicles: true },
  });

  const nader = await prisma.user.create({
    data: {
      name: 'Nader Ali',
      phone: '01223344556',
      email: 'nader@test.com',
      password: 'hashed_password_3',
      NationalID: '29703030303456',
      address: '789 Haram St, Giza',
      licenseNumber: 'GHI-789',
      licenseExpiry: new Date('2025-11-20'),
      Vehicles: {
        create: { plate: 'م ن ل 789', color: 'Silver' },
      },
    },
    include: { Vehicles: true },
  });

  // --- 4. Create Test Case Reservations and Sessions ---
  console.log('📅 Creating test cases...');
  const now = new Date();

  // **Test Case 1: Amr - Normal reservation, slot should be free.**
  // عمرو عنده حجز عادي، ومكانه المفروض يكون فاضي.
  await prisma.reservation.create({
    data: {
      userId: amr.id,
      vehicleId: amr.Vehicles[0].id,
      slotId: 'A-01',
      startTime: new Date(now.getTime() - 30 * 60000), // Started 30 mins ago
      endTime: new Date(now.getTime() + 60 * 60000), // Ends in 1 hour
      isStacked: false,
    },
  });

  // **Test Case 2: Karim - Stacked reservation, but his slot is OCCUPIED.**
  // كريم عنده حجز متكدس، لكن مكانه (B-01) مشغول حاليًا بسيارة نادر
  // أولًا، ننشئ جلسة ركن نشطة لـ "نادر" عشان نحتل المكان
  await prisma.parkingSession.create({
    data: {
      userId: nader.id,
      vehicleId: nader.Vehicles[0].id,
      slotId: 'B-01', // This is the slot Karim is supposed to use
      status: 'ACTIVE',
    },
  });

  // ثانيًا، ننشئ حجز "كريم" على نفس المكان المشغول
  await prisma.reservation.create({
    data: {
      userId: karim.id,
      vehicleId: karim.Vehicles[0].id,
      slotId: 'B-01',
      startTime: now,
      endTime: new Date(now.getTime() + 3 * 60 * 60000), // Ends in 3 hours
      isStacked: true,
      status: 'CONFIRMED',
    },
  });
  
  // **Test Case 3: A completed session with payment for Nader's past visit**
  // جلسة مكتملة قديمة لـ "نادر" مع عملية دفع ناجحة
  const completedSession = await prisma.parkingSession.create({
      data:{
          userId: nader.id,
          vehicleId: nader.Vehicles[0].id,
          slotId: 'C-01',
          status: 'COMPLETED',
          entryTime: new Date(now.getTime() - 24 * 60 * 60000), // Entered 1 day ago
          exitTime: new Date(now.getTime() - 22 * 60 * 60000), // Exited 22 hours ago
      }
  });

  await prisma.paymentTransaction.create({
      data:{
          parkingSessionId: completedSession.id,
          amount: 50.0,
          paymentMethod: 'card',
          transactionStatus: 'COMPLETED'
      }
  });


  console.log('✅ Database seeding finished successfully!');
}

main()
  .catch((e) => {
    console.error('❌ An error occurred while seeding the database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });