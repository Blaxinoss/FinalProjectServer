// prisma/seed.ts
import { ReservationsStatus, SlotType, paymentMethod } from '../src/generated/prisma/index.js'; // تأكد من المسار

import { prisma } from '../src/routes/prsimaForRouters.js';
import { randomUUID } from 'crypto';

async function main() {
    console.log('🌱 Starting Prisma seeding (Full Test Setup)...');

    // --- 1. Clean up ---
    console.log('🧹 Clearing old Prisma data...');
    await prisma.paymentTransaction.deleteMany();
    await prisma.parkingSession.deleteMany();
    await prisma.reservation.deleteMany();
    await prisma.parkingSlot.deleteMany();

    // --- 2. Create Slots (Structure + Type) ---
    console.log('🅿️ Creating parking slots...');
    await prisma.parkingSlot.createMany({
        data: [
            { id: 'A-01', type: SlotType.REGULAR }, // لعمرو (فيزا فاشل)
            { id: 'A-02', type: SlotType.REGULAR }, // لكريم (كاش)
            { id: 'B-01', type: SlotType.REGULAR }, // لصاحبك (وافد)
            { id: 'EMG-01', type: SlotType.EMERGENCY },
        ],
    });

    // --- 3. Create Users & Vehicles ---
    console.log('👤 Creating users and vehicles...');

    // Amr (App User, Card, FAKE Token/PI for testing failure)
    // Amr (App User, Card, FAKE Token/PI for testing failure)
    const amr = await prisma.user.upsert({
        where: { phone: '010000000A1' },
        update: {}, // You could also put vehicle logic here if needed
        create: {
            uuid: randomUUID(),
            name: 'Amr (App Card - Fails)',
            phone: '010000000A1',
            email: 'amr.a@test.com',
            NationalID: 'NID-AMR-A',
            address: 'Addr A',
            licenseNumber: 'LIC-A',
            licenseExpiry: new Date('2027-01-01'),
            paymentGatewayToken: 'cus_U5CERdQ0sPKnw9',
            Vehicles: { create: { plate: 'A B C 111', color: 'Red' } },
        },
        include: { Vehicles: true }
    });

    // 💡 Safety Check: If Amr existed but had no vehicle (from a previous failed seed)
    if (!amr.Vehicles || amr.Vehicles.length === 0) {
        // Manually create a vehicle if it's missing
        const newVehicle = await prisma.vehicle.create({
            data: { plate: 'A B C 111', color: 'Red', userId: amr.id }
        });
        // @ts-ignore - Patch the object for the next lines
        amr.Vehicles = [newVehicle];
    }

    // --- 4. Create Reservations (Fake Data for testing) ---
    console.log('📅 Creating reservations...');
    const now = new Date();
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

    // Amr's Reservation (Card, Fake PI_ID)
    const amrReser = await prisma.reservation.create({
        data: {
            userId: amr.id, vehicleId: amr.Vehicles[0]!.id, slotId: 'A-01',
            startTime: now, endTime: oneHourFromNow,
            status: ReservationsStatus.CONFIRMED,
            paymentType: paymentMethod.CARD,
            paymentIntentId: 'pi_FAKE_AMR_123' // ⬅️ ID وهمي عشان يسبب فشل
        },
    });

    await prisma.parkingSession.create({
        data: {
            slotId: "A-01",
            userId: amr.id,
            vehicleId: amr.Vehicles[0].id,
            reservationId: amrReser.id,
            expectedExitTime: amrReser.endTime,

        },
    });

    console.log('✅ Prisma seeding finished successfully!');
}

main().catch((e) => { console.error('❌ Prisma seed failed:', e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });