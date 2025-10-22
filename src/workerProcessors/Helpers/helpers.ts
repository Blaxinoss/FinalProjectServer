import { Job } from 'bullmq';
import { prisma } from '../../routes/routes.js';
import { getRedisClient } from '../../db&init/redis.js';
import { ParkingSlot } from '../../mongo_Models/parkingSlot.js'; // Mongoose Model
import { GRACE_PERIOD_EARLY_ENTERANCE_MINUTES } from '../../constants/constants.js';

import { Alert } from '../../mongo_Models/alert.js';
import { SlotStatus } from '../../types/parkingEventTypes.js';
import { ParkingSessionStatus, ReservationsStatus } from '../../src/generated/prisma/index.js';
import { sessionLifecycleQueue } from '../../queues/queues.js';
/**
 * 🧠 يبحث عن مكان بديل آمن: متاح حاليًا (من MongoDB) وليس عليه حجوزات قريبة (من Prisma).
 * هذا هو المنطق الأساسي لمنع "الدوامة".
 * @returns {Promise<object|null>} - The full slot object from Prisma if a safe slot is found, otherwise null.
 */
export async function findSafeAlternativeSlot() {
    // 1. جلب كل الأماكن المتاحة "حاليًا" من المصدر السريع (MongoDB)
    const availableMongoSlots = await ParkingSlot.find({ status: SlotStatus.AVAILABLE }).lean();
    if (availableMongoSlots.length === 0) {
        console.log("No slots are currently marked as AVAILABLE in MongoDB.");
        return null;
    }
    const availableSlotIds = availableMongoSlots.map(slot => slot._id.toString());

    // 2. تحديد الفترة الزمنية الحرجة (حتى نهاية اليوم)
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    // 3. البحث في Prisma عن أي حجوزات مؤكدة قادمة على هذه الأماكن المتاحة
    const upcomingReservations = await prisma.reservation.findMany({
        where: {
            slotId: { in: availableSlotIds },
            status: ReservationsStatus.CONFIRMED,
            startTime: { lte: endOfDay } // أي حجز سيبدأ قبل نهاية اليوم
        },
        select: { slotId: true }
    });

    const reservedSlotIds = new Set(upcomingReservations.map(res => res.slotId));

    // 4. إيجاد أول ID لمكان متاح وغير محجوز في المستقبل القريب
    const safeSlotId = availableSlotIds.find(id => !reservedSlotIds.has(id));

    if (!safeSlotId) {
        console.log("Found available slots in Mongo, but all have upcoming reservations today.");
        return null;
    }

    // 5. جلب البيانات الهيكلية الكاملة للمكان الآمن من Prisma
    console.log(`Found a safe alternative slot. ID: ${safeSlotId}`);
    return await prisma.parkingSlot.findUnique({ where: { id: safeSlotId } });
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

    try {


        if (!exitJob || !exitJob.id) {
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
                    overtimeStartTime: null,
                    overtimeEndTime: null,
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

        return { success: true };

    } catch (error: any) {
        // TODO: تسجيل تنبيه حرج هنا
        console.error(`CRITICAL: Failed during session creation for reservation ${reservation.id}. Error: ${error.message}`);
        const alert = await Alert.create({
            type: 'CRITICAL',
            message: `Failed to start parking session for reservation ${reservation.id}. Manual intervention may be required.`,
            timestamp: new Date(),
        });
        console.log(`Alert created with ID: ${alert._id}`);
        // لا ترمي الخطأ للخارج لمنع إعادة المحاولة، ولكن أرجع فشلًا واضحًا
        return { success: false, error: "Failed to start parking session.", alertId: alert._id };
    }
}