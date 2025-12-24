import type { Job } from "bullmq";
import { prisma } from "../../routes/prsimaForRouters.js";
import { paymentMethod, ParkingSessionStatus, TransactionStatus } from "../../generated/prisma/client.js"; // ⬅️ استيراد ParkingSessionStatus
import { getMQTTClient_IN_WORKER } from "../../workers/consumer.js";
import { Alert } from "../../mongo_Models/alert.js"; // ⬅️ استيراد Alert
import { AlertSeverity, AlertType } from "../../types/parkingEventTypes.js"; // ⬅️ استيراد أنواع Alert


export const handleGateExitRequest = async (job: Job) => {
    const { plateNumber, requestId,timestamp,gate="gate2" } = job.data;

    // ⬅️ القيمة الافتراضية بقت الرفض (أكثر أمانًا)
    let decision = 'DENY_EXIT';
    let reason = 'UNHANDLED_ERROR';
    let message: string | null = null;
    let jobStatus: object = { success: false, decision, reason, plateNumber };
    const mqttClient = await getMQTTClient_IN_WORKER();

    try {
        const vehicle = await prisma.vehicle.findUnique({
            where: { plate: plateNumber }
        });

        if (!vehicle) {
            reason = 'VEHICLE_NOT_FOUND';
            message = `Vehicle ${plateNumber} not found in system.`;
            throw new Error(message);
        }

        // --- ⬇️ تعديل 1: البحث بـ entryTime ⬇️ ---
        // هات "آخر جلسة بدأت" للعربية دي، بغض النظر عن حالتها
        const lastSession = await prisma.parkingSession.findFirst({
            where: { vehicleId: vehicle.id },
            orderBy: { entryTime: 'desc' } // ⬅️ هات آخر واحدة "بدأت"
        });
        // --- ⬆️ نهاية التعديل ⬆️ ---

        if (!lastSession) {
            reason = 'NO_SESSION_FOUND';
            message = `No sessions found for vehicle ${plateNumber}.`;
            throw new Error(message);
        }

        // --- ⬇️ تعديل 2: التعامل مع "السباق" ⬇️ ---
        // 2. هل الجلسة دي لسه نشطة؟
        if (lastSession.status === ParkingSessionStatus.ACTIVE) {
            // ده معناه إن العربية وصلت البوابة "قبل" ما الـ handleSlotExit يشتغل
            console.warn(`RACE CONDITION: Car ${plateNumber} at gate, but session ${lastSession.id} is still ACTIVE. Telling gate to wait.`);
            
            decision = 'DENY_EXIT'; // 🛑
            reason = 'SESSION_STILL_PROCESSING';
            message = "Processing exit... Please wait 10 seconds.";
            
            jobStatus = { success: true, decision, message, reason };
            // اخرج بدري، الـ finally هيبعت الرد
            return jobStatus;
        }
        // --- ⬆️ نهاية الإضافة ⬆️ ---


        // 3. لو الكود وصل هنا، يبقى الـ handleSlotExit خلص شغله (السيشن COMPLETED)
        const paymentTransaction = await prisma.paymentTransaction.findFirst({
            where: { parkingSessionId: lastSession.id },
            orderBy: { createdAt: 'desc' }
        });

        if (!paymentTransaction) {
            reason = 'PAYMENT_TRANSACTION_MISSING';
            message = `Critical Error: Session ${lastSession.id} is COMPLETED but has NO payment transaction!`;
            // (إرسال تنبيه للنظام)
            await Alert.create({
                alert_type: AlertType.SUSPICIOUS_ACTIVITY,
                title: 'Missing Payment Transaction',
                description: message,
                severity: AlertSeverity.CRITICAL,
                details: { sessionId: lastSession.id, plateNumber }
            });
            throw new Error(message);
        }

        // 4. خد القرار النهائي (اللوجيك بتاعك سليم هنا)
        const status = paymentTransaction.transactionStatus;

        if (status === TransactionStatus.COMPLETED) {
            console.log(`Payment for ${lastSession.id} is COMPLETED. Opening gate.`);
            decision = 'ALLOW_EXIT';
            reason = 'PAYMENT_COMPLETED';
            message = 'Payment confirmed. Thank you!';
        }
        else if (status === TransactionStatus.UNPAID_EXIT) {
            console.log(`Payment for ${lastSession.id} is UNPAID_EXIT. Opening gate (Blacklisted).`);
            decision = 'ALLOW_EXIT';
            reason = 'PAYMENT_FAILED_BLACKLISTED';
            message = 'Gate opening. Unpaid balance recorded. Please check your app/SMS.';
        }
        else if (status === TransactionStatus.PENDING && lastSession.paymentType === paymentMethod.CASH) {
            console.log(`Payment for ${lastSession.id} is PENDING (CASH). Gate REMAINS CLOSED.`);
            decision = 'DENY_EXIT';
            reason = 'CASH_PAYMENT_PENDING';
            message = 'Cash payment required. Please wait for the attendant.';
        }
        else if (status === TransactionStatus.PENDING && lastSession.paymentType === paymentMethod.CARD) {
            // (دي حالة "سباق" تانية لو الـ paymentWorker هو اللي اتأخر)
            console.warn(`Payment for ${lastSession.id} is ${status} (CARD). Opening gate (Trusting worker).`);
            decision = 'ALLOW_EXIT';
            reason = 'PAYMENT_PROCESSING_CARD';
            message = 'Payment processing... Gate opening.';
        }

        else if (status === TransactionStatus.CANCELLED) {
    // (الأدمن لغاها)
    console.log(`Payment for ${lastSession.id} was CANCELLED. Opening gate.`);
    decision = 'ALLOW_EXIT';
    reason = 'SESSION_CANCELLED';
    message = 'Session was cancelled by administration.';
}

        else {
            console.log(`WEIRD STATE: Job ${job.id}, Status: ${status}, Method: ${lastSession.paymentType}`);
            decision = 'DENY_EXIT';
            reason = 'UNKNOWN_PAYMENT_STATUS';
            message = 'Unknown payment status. Please contact support.';
        }

        jobStatus = { success: true, decision, message, reason };

    } catch (err: any) {
        console.error(`error happend while processing exit gate for job ${job.id}: ${err.message}`);

        // لو القرار لسه متغيرش، خليه بالخطأ
        if (decision === 'DENY_EXIT' && reason === 'UNHANDLED_ERROR') {
            decision = 'DENY_EXIT';
            reason = 'INTERNAL_SERVER_ERROR';
            message = err.message; // رجع رسالة الخطأ
        }
        jobStatus = { success: false, error: err.message, decision, reason, message };

    } finally {
        // ... (نفس الـ finally بلوك بتاع إرسال MQTT) ...
        const responsePayload = JSON.stringify({
            requestId,
            decision,
            gate,
            reason,
            message,
            plateNumber,
            timestamp: new Date().toISOString(),
        });

        console.log(`📢 Publishing final decision to topic garage/gate/event/response`, responsePayload);
        mqttClient.publish(`garage/gate/event/response`, responsePayload);

        return jobStatus;
    }
}