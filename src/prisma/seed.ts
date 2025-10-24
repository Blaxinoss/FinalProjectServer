// prisma/seed.ts
import { PrismaClient, ReservationsStatus, SlotType, ParkingSessionStatus } from '../src/generated/prisma/index.js'; // تأكد من المسار
import { prisma } from '../routes/routes.js'; // تأكد من المسار
import { randomUUID } from 'crypto';

async function main() {
    console.log('🌱 Starting Prisma seeding...');

    // --- Clean up ---[]
    console.log('🧹 Clearing old Prisma data...');
    await prisma.paymentTransaction.deleteMany();
    await prisma.parkingSession.deleteMany();
    await prisma.reservation.deleteMany();
    await prisma.vehicle.deleteMany();
    await prisma.user.deleteMany();
    await prisma.parkingSlot.deleteMany();

    // --- Create Slots (Structure + Type) ---
    console.log('🅿️ Creating parking slots...');
   const slots = await prisma.parkingSlot.createMany({ // Using createMany as per your code
        data: [
            { id: 'A-01', type: SlotType.REGULAR },
            { id: 'A-02', type: SlotType.REGULAR }, // Fatma's intended slot
            { id: 'B-01', type: SlotType.REGULAR }, // Karim's intended (occupied) slot, allows stacked reservations
            { id: 'B-02', type: SlotType.REGULAR }, // Potential alternative, allows stacked reservations
            { id: 'C-01', type: SlotType.REGULAR }, // Saeed's intended slot
            { id: 'EMG-01', type: SlotType.EMERGENCY }, // Emergency slot
        ],
    });
    console.log(`Created ${slots.count} slots.`); // .count is correct for createMany

    // --- Create Users & Vehicles ---
    console.log('👤 Creating users and vehicles...');
    const amr = await prisma.user.create({
        data: {
            uuid: randomUUID(), name: 'Amr (Victim A)', phone: '010000000A1', email: 'amr.a@test.com',
            NationalID: 'NID-AMR-A', address: 'Addr A', licenseNumber: 'LIC-A', licenseExpiry: new Date('2027-01-01'),
            Vehicles: { create: { plate: 'أ أ أ 111', color: 'Red' } },
        }, include: { Vehicles: true }
    });
    const karim = await prisma.user.create({
        data: {
            uuid: randomUUID(), name: 'Karim (Stacked)', phone: '010000000K1', email: 'karim.k@test.com',
            NationalID: 'NID-KARIM-K', address: 'Addr K', licenseNumber: 'LIC-K', licenseExpiry: new Date('2027-01-01'),
            Vehicles: { create: { plate: 'ك ك ك 222', color: 'Blue' } },
        }, include: { Vehicles: true }
    });
     const nader = await prisma.user.create({
        data: {
            uuid: randomUUID(), name: 'Nader (Occupier B-01)', phone: '010000000N1', email: 'nader.n@test.com',
            NationalID: 'NID-NADER-N', address: 'Addr N', licenseNumber: 'LIC-N', licenseExpiry: new Date('2027-01-01'),
            Vehicles: { create: { plate: 'ن ن ن 333', color: 'Green' } },
        }, include: { Vehicles: true }
    });
    const fatma = await prisma.user.create({
        data: {
            uuid: randomUUID(), name: 'Fatma (Violator B)', phone: '010000000F1', email: 'fatma.f@test.com',
            NationalID: 'NID-FATMA-F', address: 'Addr F', licenseNumber: 'LIC-F', licenseExpiry: new Date('2027-01-01'),
            Vehicles: { create: { plate: 'ف ف ف 444', color: 'Yellow' } },
        }, include: { Vehicles: true }
    });
    // --- ⬇️ إضافة سعيد ⬇️ ---
    const saeed = await prisma.user.create({ // User for C-01
        data: {
            uuid: randomUUID(), name: 'Saeed (Occupies C-01)', phone: '010000000S1', email: 'saeed.s@test.com',
            NationalID: 'NID-SAEED-S', address: 'Addr S', licenseNumber: 'LIC-S', licenseExpiry: new Date('2027-01-01'),
            Vehicles: { create: { plate: 'ص ص ص 666', color: 'Purple' } },
        }, include: { Vehicles: true }
    });
    // --- ⬆️ نهاية إضافة سعيد ⬆️ ---
    const unauthorized = await prisma.user.create({ // User for unauthorized parking test
        data: {
            uuid: randomUUID(), name: 'Unauthorized User', phone: '010000000U1', email: 'unauth.u@test.com',
            NationalID: 'NID-UNAUTH-U', address: 'Addr U', licenseNumber: 'LIC-U', licenseExpiry: new Date('2027-01-01'),
            Vehicles: { create: { plate: 'غ غ غ 555', color: 'Grey' } },
        }, include: { Vehicles: true }
    });

    console.log(`Created users and vehicles.`);

    // --- Create Reservations ---
    console.log('📅 Creating reservations...');
    const now = new Date();
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
    const threeHoursFromNow = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    // Amr's reservation for A-01 (Victim)
    await prisma.reservation.create({ data: { userId: amr.id, vehicleId: amr.Vehicles[0]!.id, slotId: 'A-01', startTime: now, endTime: oneHourFromNow, status: ReservationsStatus.CONFIRMED } });
    // Karim's reservation for B-01 (Stacked Conflict)
    await prisma.reservation.create({ data: { userId: karim.id, vehicleId: karim.Vehicles[0]!.id, slotId: 'B-01', startTime: now, endTime: threeHoursFromNow, isStacked: true, status: ReservationsStatus.CONFIRMED } });
    // Fatma's reservation for A-02 (Violator - she will park in A-01)
     await prisma.reservation.create({ data: { userId: fatma.id, vehicleId: fatma.Vehicles[0]!.id, slotId: 'A-02', startTime: now, endTime: twoHoursFromNow, status: ReservationsStatus.CONFIRMED } });
    // --- ⬇️ إضافة حجز سعيد ⬇️ ---
    // Saeed's reservation for C-01
    await prisma.reservation.create({ data: { userId: saeed.id, vehicleId: saeed.Vehicles[0]!.id, slotId: 'C-01', startTime: now, endTime: twoHoursFromNow, status: ReservationsStatus.CONFIRMED } });
    // --- ⬆️ نهاية إضافة حجز سعيد ⬆️ ---
    console.log(`Created reservations.`);

    // --- Create Initial Active Session (Nader occupying B-01) ---
    console.log('🚗 Creating initial active session...');
    await prisma.parkingSession.create({
        data: {
            userId: nader.id, vehicleId: nader.Vehicles[0]!.id, slotId: 'B-01', status: ParkingSessionStatus.ACTIVE,
            entryTime: new Date(now.getTime() - 15 * 60000), // Entered 15 mins ago
            expectedExitTime: new Date(now.getTime() + 90 * 60000), // Expected to leave in 90 mins
            // No need to create jobs for this seed session
        }
    });
    console.log(`Initial session created for Nader in B-01.`);

    console.log('✅ Prisma seeding finished successfully!');
}

main()
  .catch((e) => { console.error('❌ Prisma seed failed:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });