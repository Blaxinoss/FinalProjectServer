import { ParkingSlot } from "../../mongo_Models/parkingSlot.js";
import { prisma } from "../../routes/routes.js";
import { ParkingSessionStatus } from "../../src/generated/prisma/index.js";
import { SlotStatus } from "../../types/parkingEventTypes.js";
import { GRACE_PERIOD_TO_LEAVE_AFTER_SESSION_END_TIME } from "../../constants/constants.js";
import { sendPushNotification } from "../../services/notifications.js";
import { sessionLifecycleQueue } from "../../queues/queues.js";

export const handleSessionExpiry = async (job: any) => {

const { parkingSessionId } = job.data;
    // جلب الجلسة والحجز المرتبط بها
    const session = await prisma.parkingSession.findFirst({
        where: { id:parkingSessionId}
    });

    if(!session || !session.slotId) {
console.warn(`Job ${job.id} ran, but session ${parkingSessionId} not found.`);
        throw new Error(`the job ran but the session not found ${parkingSessionId}`);
    }
    if(session.status === ParkingSessionStatus.COMPLETED) {
        console.log(`Job ${job.id}: Session ${parkingSessionId} already completed. No action needed.`);
        return;
    }


       const slotStatus = await ParkingSlot.findById(session.slotId).select('status').lean();

    
    if (slotStatus?.status === SlotStatus.AVAILABLE) {
        // (ده منطق "التصحيح الذاتي" بتاعك، وهو ممتاز)
        // معناه: الكاميرا شافت العربية مشيت، بس المعالج بتاعها فشل يقفل الجلسة
        console.warn(`Data Inconsistency: Job ${job.id} found session ${session.id} ACTIVE but slot ${session.slotId} is AVAILABLE. Forcing completion.`);
        
        await prisma.parkingSession.update({
            where : { id: session.id },
            data: { 
                status: ParkingSessionStatus.COMPLETED,
                exitTime: new Date() // هنفترض إنه مشي دلوقتي
            }
        });
        // (مش محتاجين نحدث مونجو لأنه أصلاً AVAILABLE)
        return;

    }else if (slotStatus?.status === SlotStatus.OCCUPIED) {
        // --- 4. المنطق الأهم: العميل اتأخر! ---
        console.log(`Job ${job.id}: Session ${session.id} expired. Slot ${session.slotId} is still OCCUPIED. Starting grace period.`);

        // أ. أرسل تنبيه للمستخدم (زي ما أنت عملت)
        sendPushNotification(session.userId, "Your session ended!","Your session has expired. A 10-minute grace period has started.");

        // ب. إنشاء "المهمة المؤجلة الثانية" (جوب فترة السماح)
        await sessionLifecycleQueue.add(
            'check-grace-period-expiry', // ⬅️ اسم مهمة جديد
            { parkingSessionId: session.id },
            { delay: GRACE_PERIOD_TO_LEAVE_AFTER_SESSION_END_TIME } // ⬅️ هتشتغل بعد 10 دقايق
        );

        return;
    }

    


}