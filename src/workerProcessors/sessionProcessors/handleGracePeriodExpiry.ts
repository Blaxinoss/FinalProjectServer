import { Job } from 'bullmq';
import { ParkingSlot } from "../../mongo_Models/parkingSlot.js";
import { prisma } from "../../routes/routes.js";
import { ParkingSessionStatus } from "../../src/generated/prisma/index.js";
import { AlertType, SlotStatus } from "../../types/parkingEventTypes.js";
import { sendPushNotification } from '../../services/notifications.js'; // 1. استدعاء دالة الإشعارات
import { Alert } from '../../mongo_Models/alert.js';
// 2. (اختياري) استدعاء دالة إرسال تنبيه للداش بورد (عبر WebSocket أو MQTT)
// import { sendAlertToDashboard } from '../services/dashboardService.js'; 

/**
 * المعالج الخاص بانتهاء "فترة السماح" (بعد الـ 10 دقائق).
 * وظيفته هي بدء "عداد الغرامة" إذا كان العميل ما زال موجودًا.
 */
export const handleGracePeriodExpiry = async (job: Job) => {
    const { parkingSessionId } = job.data;

    try {
        // --- 1. جلب الجلسة من Prisma ---
        const session = await prisma.parkingSession.findUnique({
            where: { id: parkingSessionId }
        });

        // --- 2. التحقق الأولي (هل الجلسة ما زالت نشطة؟) ---
        if (!session) {
            console.warn(`GracePeriod Job ${job.id}: Session ${parkingSessionId} not found.`);
            return; // لا يوجد ما يمكن فعله
        }

        // السيناريو السعيد: العميل غادر "أثناء" فترة السماح.
        if (session.status === ParkingSessionStatus.COMPLETED) {
            console.log(`GracePeriod Job ${job.id}: Session ${parkingSessionId} already completed. No action needed.`);
            return;
        }

        // --- 3. التحقق من الواقع (MongoDB) ---
        const slotStatus = await ParkingSlot.findById(session.slotId).select('status').lean();

        // --- 4. منطق الحالات ---

        // حالة (أ): تصحيح ذاتي (العميل غادر أثناء فترة السماح + معالج الكاميرا فشل)
if (slotStatus?.status !== SlotStatus.OCCUPIED) {
                console.warn(`Data Inconsistency: GracePeriod Job ${job.id} found session ${session.id} ACTIVE but slot ${session.slotId} is AVAILABLE. Forcing completion.`);
            
            await prisma.parkingSession.update({
                where: { id: session.id },
                data: {
                    status: ParkingSessionStatus.COMPLETED,
                    exitTime: new Date() // افترض أنه غادر الآن
                    // لا يتم تعيين overTimeStartTime لأنه غادر قبل انتهاء السماح
                }
            });
            return;
        }

        // حالة (ب): العميل ما زال موجودًا (بدء الغرامة)
        if (slotStatus?.status === SlotStatus.OCCUPIED) {
            
            // تحقق إضافي: هل بدأنا الغرامة بالفعل؟ (لمنع تشغيل الكود مرتين)
            if (session.overtimeStartTime) {
                console.log(`GracePeriod Job ${job.id}: Overtime for session ${session.id} already started. No action needed.`);
                return;
            }

            console.log(`Job ${job.id}: Grace period for session ${session.id} ended. Slot ${session.slotId} is still OCCUPIED. Starting penalty time.`);

            // 1. تحديث قاعدة البيانات (بدء عداد الغرامة)
            await prisma.parkingSession.update({
                where: { id: session.id },
                data: {
                    overtimeStartTime: new Date() // ⬅️ الخطوة الحاسمة
                }
            });

            // 2. إرسال تنبيه فوري للمستخدم
            // await sendPushNotification(
            //     session.userId,
            //     "‼️ Penalty Time Started",
            //     "Your grace period has ended, and penalty time has started for your parking session."
            // );

            // 3. (اختياري) إرسال تنبيه للداش بورد
            await Alert.create({
                type: AlertType.OVERTIME,
                message: `User ${session.userId} has entered penalty time for session ${session.id}.`,
                timestamp: new Date(),
            });
            
            return;
        }

    } catch (error: any) {
        console.error(`❌ CRITICAL ERROR in GracePeriod Job ${job.id}: ${error.message}`);
        // أعد إرسال الخطأ للسماح لـ BullMQ بإعادة المحاولة
        throw error;
    }
};