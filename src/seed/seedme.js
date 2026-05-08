// prisma-slots-seed.ts
import { SlotType } from '../generated/prisma/index.js'; // تأكد من المسار
import { prisma } from '../../dist/src/routes/prsimaForRouters.js'
async function main() {
    console.log('🌱 Starting Prisma Slots Seeding...');

    // 1. مسح الأماكن القديمة فقط
    console.log('🧹 Clearing old parking slots from Prisma...');
    // ملاحظة: لو واجهت مشكلة Foreign Key constraint، ممكن تحتاج تمسح الـ Sessions و Reservations المرتبطة بيهم الأول
    await prisma.parkingSlot.deleteMany();

    // 2. إنشاء 10 أماكن جديدة
    console.log('🅿️ Creating 10 new parking slots...');
    await prisma.parkingSlot.createMany({
        data: [
            // Zone A - Regular Slots
            { id: 'A-01', type: SlotType.REGULAR },
            { id: 'A-02', type: SlotType.REGULAR },
            { id: 'A-03', type: SlotType.REGULAR },
            { id: 'A-04', type: SlotType.REGULAR },

            // Zone B - Regular Slots
            { id: 'B-01', type: SlotType.REGULAR },
            { id: 'B-02', type: SlotType.REGULAR },
            { id: 'B-03', type: SlotType.REGULAR },
            { id: 'B-04', type: SlotType.REGULAR },

            // Emergency / VIP Slots
            { id: 'EMG-01', type: SlotType.EMERGENCY },
            { id: 'EMG-02', type: SlotType.EMERGENCY },
        ],
    });

    console.log('✅ Prisma Slots seeding finished successfully!');
}

main()
    .catch((e) => {
        console.error('❌ Prisma seed failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });