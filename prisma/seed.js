// prisma/seed.ts
import {  ReservationsStatus, SlotType,  paymentMethod } from '../src/generated/prisma/index.js'; // تأكد من المسار

import { prisma } from '../dist/src/routes/prsimaForRouters.js';
import { randomUUID } from 'crypto';

async function main() {
    console.log('🌱 Starting Prisma seeding (Full Test Setup)...');

    // --- 1. Clean up ---
    console.log('🧹 Clearing old Prisma data...');
    await prisma.paymentTransaction.deleteMany();
    await prisma.parkingSession.deleteMany();
    await prisma.reservation.deleteMany();
    // await prisma.vehicle.deleteMany();
    // await prisma.user.deleteMany();
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
    const amr = await prisma.user.create({
        data: {
            uuid: randomUUID(), name: 'Amr (App Card - Fails)', phone: '010000000A1', email: 'amr.a@test.com',
            NationalID: 'NID-AMR-A', address: 'Addr A', licenseNumber: 'LIC-A', licenseExpiry: new Date('2027-01-01'),
            notificationToken:"21312",
            paymentGatewayToken: 'cus_FAKE_TOKEN_AMR', // توكن وهمي
            Vehicles: { create: { plate: '٥٦١-روص'
                , color: 'Red' } },
        }, include: { Vehicles: true }
    });
    
    // Kareem (App User, Cash)
    const kareem = await prisma.user.create({
        data: {
            uuid: randomUUID(), name: 'Kareem (App Cash)', phone: '010000000K1', email: 'kareem.k@test.com',
            NationalID: 'NID-KAREEM-K', address: 'Addr K', licenseNumber: 'LIC-K', licenseExpiry: new Date('2027-01-01'),
            paymentGatewayToken: null, // معندوش توكن
                        notificationToken:"13212",

            Vehicles: { create: { plate: 'ك ك ك 222', color: 'Blue' } },
        }, include: { Vehicles: true }
    });

    // Sadek (Walk-in User, for real Stripe test)
    // هنعمل اليوزر والعربية بتوعه عشان نقدر نحطه في البلاك ليست
     await prisma.vehicle.create({
        data: {
            plate: 'ABC125', // ⬅️ لوحة صاحبك
            color: 'Black',
            user: {
                create: {
                    uuid: randomUUID(), name: 'Sadek (Walk-in)', phone: '01226858272', // ⬅️ رقم صاحبك
                    email: 'sadek.s@test.com',
                    NationalID: 'NID-SADEK-S', address: 'Addr S', licenseNumber: 'LIC-S', licenseExpiry: new Date('2027-01-01'),
                }
            }
        },
    });

    // --- 4. Create Reservations (Fake Data for testing) ---
    console.log('📅 Creating reservations...');
    const now = new Date();
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
    
    // Amr's Reservation (Card, Fake PI_ID)
    await prisma.reservation.create({
        data: {
            userId: amr.id, vehicleId: amr.Vehicles[0].id, slotId: 'A-01',
            startTime: now, endTime: oneHourFromNow,
            status: ReservationsStatus.CONFIRMED,
            paymentType: paymentMethod.CARD,
            paymentIntentId: 'pi_FAKE_AMR_123' // ⬅️ ID وهمي عشان يسبب فشل
        },
    });

    // Kareem's Reservation (Cash)
    await prisma.reservation.create({
        data: {
            userId: kareem.id, vehicleId: kareem.Vehicles[0].id, slotId: 'A-02',
            startTime: now, endTime: oneHourFromNow,
            status: ReservationsStatus.CONFIRMED,
            paymentType: paymentMethod.CASH,
            paymentIntentId: null
        },
    });

     console.log('✅ Prisma seeding finished successfully!');
}

main().catch((e) => { console.error('❌ Prisma seed failed:', e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });