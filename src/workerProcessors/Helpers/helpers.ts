import { Job } from 'bullmq';
import { prisma } from '../../routes/routes.js';
import { getRedisClient } from '../../db&init/redis.js';
import { ParkingSlot } from '../../mongo_Models/parkingSlot.js'; // Mongoose Model
import { GRACE_PERIOD_EARLY_ENTERANCE_MINUTES, OCCUPANCY_CHECK_DELAY_AFTER_ENTRY } from '../../constants/constants.js';

import { Alert } from '../../mongo_Models/alert.js';
import { SlotStatus } from '../../types/parkingEventTypes.js';
import { ParkingSessionStatus, ReservationsStatus, type Reservation } from '../../src/generated/prisma/index.js';
import { sessionLifecycleQueue } from '../../queues/queues.js';
/**
 * 🧠 يبحث عن مكان بديل آمن: متاح حاليًا (من MongoDB) وليس عليه حجوزات قريبة (من Prisma).
 * هذا هو المنطق الأساسي لمنع "الدوامة".
 * @returns {Promise<object|null>} - The full slot object from Prisma if a safe slot is found, otherwise null.
 */export async function findSafeAlternativeSlot() {
    // 1. جلب IDs المتاحة من MongoDB (زي ما هي)
    const availableMongoSlots = await ParkingSlot.find({ status: SlotStatus.AVAILABLE }).lean();
    if (availableMongoSlots.length === 0) return null;
    const availableSlotIds = availableMongoSlots.map(slot => slot._id.toString());

    // ------------------------------------
    // ⬇️ الخطوة الجديدة: فلترة النوع هنا ⬇️
    // ------------------------------------
    // 2. اسأل Prisma: مين من الأماكن المتاحة دي مش طوارئ؟
    const candidateSlots = await prisma.parkingSlot.findMany({
        where: {
            id: { in: availableSlotIds },
            type: { not: 'EMERGENCY' } // <-- ✅ الفلتر مكانه هنا
        },
        select: { id: true } // محتاجين الـ ID بس دلوقتي
    });
    const candidateSlotIds = candidateSlots.map(slot => slot.id);
    if (candidateSlotIds.length === 0) {
        console.log("Found available slots in Mongo, but none are non-emergency.");
        return null; // مفيش مرشحين متاحين ومش طوارئ
    }
    // ------------------------------------
    // ⬆️ نهاية الخطوة الجديدة ⬆️
    // ------------------------------------


    // 3. تحديد الفترة الزمنية (زي ما هي)
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    // 4. البحث عن حجوزات قادمة على الأماكن "المرشحة" فقط
    const upcomingReservations = await prisma.reservation.findMany({
        where: {
            slotId: { in: candidateSlotIds }, // <-- استخدم IDs المرشحين
            status: ReservationsStatus.CONFIRMED,
            startTime: { lte: endOfDay }
        },
        select: { slotId: true }
    });
    const reservedSlotIds = new Set(upcomingReservations.map(res => res.slotId));

    // 5. إيجاد أول ID "مرشح" وغير محجوز
    const safeSlotId = candidateSlotIds.find(id => !reservedSlotIds.has(id)); // <-- ابحث في المرشحين

    if (!safeSlotId) {
        console.log("Found available, non-emergency slots, but all have upcoming reservations.");
        return null;
    }

    // 6. جلب بيانات المكان الآمن النهائية (بدون فلتر نوع هنا)
    console.log(`Found a safe alternative slot. ID: ${safeSlotId}`);
    // <-- ❌ متشيلش الفلتر من هنا، سيبه زي ما كان في findUnique
    return await prisma.parkingSlot.findUnique({ where: { id: safeSlotId } }); // <-- ✅ متشيلش الفلتر من هنا
}



/**
 * ⚙️ ينفذ عملية متعددة الخطوات (غير قابلة للـ transaction) لتعيين مكان وبدء جلسة.
 * الأولوية لتسجيل البيانات في Prisma أولاً، ثم تحديث الحالة في MongoDB.
 * @param {object} reservation - The user's reservation object.
 * @param {object} slotToAssign - The prisma slot object to be assigned.
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function assignSlotAndStartSession(reservation: any, slotToAssign: any) {



    const now = new Date();
    const delay = reservation.endTime.getTime() - now.getTime();
    const exitJob = await sessionLifecycleQueue.add(
        'check-session-expiry',
        {
            reservationId: reservation.id
        },
        {
            delay: delay > 0 ? delay : 0 // تأكد من أن التأخير ليس سالبًا
        }
    );

    const occupancyCheckJob = await sessionLifecycleQueue.add(
        'check-actual-occupancy',
        { reservationId: reservation.id }, // سنحتاج لتحديثه بالـ sessionId
        { delay: OCCUPANCY_CHECK_DELAY_AFTER_ENTRY }
    );

    try {

        

        if (!exitJob || !exitJob.id || !occupancyCheckJob.id) {
            throw new Error(`Failed to create exit check job for reservation ${reservation.id}`);
        }



        // الخطوة 1: تسجيل العمليات الحرجة في قاعدة البيانات الأساسية (Prisma)
        const [updatedReservation, newSession] = await prisma.$transaction([
            prisma.reservation.update({
                where: { id: reservation.id },
                data: { status: 'FULFILLED', slotId: slotToAssign.id },
            }),
            prisma.parkingSession.create({
                data: {
                    userId: reservation.userId,
                    vehicleId: reservation.vehicleId,
                    slotId: slotToAssign.id,
                    entryTime: now,
                    expectedExitTime: reservation.endTime,
                    exitCheckJobId: exitJob.id,
                    paymentIntentId:reservation.paymentIntentId,
                    paymentType : reservation.paymentType,
                    overtimeStartTime: null,
                    overtimeEndTime: null,
                    occupancyCheckJobId:occupancyCheckJob.id,
                    isExtended: false,
                    status:ParkingSessionStatus.ACTIVE,
                    reservationId: reservation.id,
                },
            }),
        ]);

        // الخطوة 2: تحديث الحالة في قاعدة البيانات اللحظية (MongoDB)
        await ParkingSlot.updateOne(
            { _id: slotToAssign.id },
            {
                $set: {
                    status: SlotStatus.ASSIGNED, // ⬅️ الحالة الوسيطة الصحيحة
                    current_vehicle: {
                        plate_number: reservation.vehicle.plate, // اللوحة المتوقعة
                        occupied_since: null,
                        reservation_id: reservation.id.toString()
                    }
                }
            }
        );

        await exitJob.updateData({
            ...exitJob.data,
            parkingSessionId: newSession.id
        });

        await occupancyCheckJob.updateData({ ...occupancyCheckJob.data, parkingSessionId: newSession.id }); // ⬅️ تحديث الجوب الجديدة أيضًا

        return { success: true };

    } catch (error: any) {
        // TODO: تسجيل تنبيه حرج هنا
        console.error(`CRITICAL: Failed during session creation for reservation ${reservation.id}. Error: ${error.message}`);
        const alert = await Alert.create({
            type: 'CRITICAL',
            message: `Failed to start parking session for reservation ${reservation.id}. Manual intervention may be required.`,
            timestamp: new Date(),
        });
        await exitJob.remove();
        await occupancyCheckJob.remove(); 
        console.log(`Alert created with ID: ${alert._id}`);
        // لا ترمي الخطأ للخارج لمنع إعادة المحاولة، ولكن أرجع فشلًا واضحًا
        return { success: false, error: "Failed to start parking session.", alertId: alert._id };
    }
}