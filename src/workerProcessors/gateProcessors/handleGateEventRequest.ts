import { Job } from 'bullmq';
import { prisma } from '../../routes/routes.js';
import { connectRedis, getRedisClient } from '../../db&init/redis.js';
import { ParkingSlot } from '../../mongo_Models/parkingSlot.js';
import { GRACE_PERIOD_EARLY_ENTERANCE_MINUTES, OCCUPANCY_CHECK_DELAY_AFTER_ENTRY } from '../../constants/constants.js';
import { SlotStatus } from '../../types/parkingEventTypes.js';
import { assignSlotAndStartSession, findSafeAlternativeSlot } from '../Helpers/helpers.js';
import { getMQTTClient_IN_WORKER } from '../../workers/consumer.js';
import { ParkingSessionStatus, paymentMethod, ReservationsStatus } from '../../src/generated/prisma/index.js';
import { sessionLifecycleQueue } from '../../queues/queues.js';
// ... الدوال المساعدة findSafeAlternativeSlot و assignSlotAndStartSession تبقى كما هي ...


const redis = await connectRedis();


/**
 * 🚪 الدالة الرئيسية التي تتعامل مع طلبات الدخول من البوابة (بنمط القرار النهائي).
 */
export const handleGateEntryRequest = async (job: Job) => {
    const { plateNumber, requestId } = job.data;
    
    // 1. تعريف متغيرات القرار النهائي
    let decision = 'DENY_ENTRY'; // القيمة الافتراضية هي الرفض
    let reason = 'UNHANDLED_CASE';
    let slotName: string | null = null;
    let message: string | null = null;
    let jobStatus: object = { success: false, decision, reason, slotName };

    const mqttClient = getMQTTClient_IN_WORKER();
    const responseTopic = `garage/gate/event/response`;

    try {
        if (!plateNumber) {
            reason = 'MISSING_PLATE_NUMBER';
            throw new Error('Missing plateNumber in job data');
        }

        const now = new Date();
        const gracePeriodStart = new Date(now.getTime() + GRACE_PERIOD_EARLY_ENTERANCE_MINUTES * 60000);
        
        console.log(await prisma.reservation.findMany({include: { vehicle: true }}));

        const reservation = await prisma.reservation.findFirst({
  where: {
    vehicle: { plate: plateNumber },    
    status: ReservationsStatus.CONFIRMED,
    startTime: { lte: gracePeriodStart },
    endTime: { gte: now },
  },
  include: { vehicle: true }
});
        console.log(reservation ? `Reservation found for plate ${plateNumber}: ${reservation.id}` : `No reservation found for plate ${plateNumber}.`);
        // =======================
        //  الحالة أ: يوجد حجز
        // =======================
        if (reservation) {
            
            console.log(`🔍 Found reservation ${reservation.id} for plate ${plateNumber}.`);
            const designatedSlotStatus = await ParkingSlot.findById(reservation.slotId).select('status').lean();
            console.log(`Designated slot ${reservation.slotId} status: ${designatedSlotStatus?.status}`);

            
            if (designatedSlotStatus?.status === SlotStatus.AVAILABLE) {
                const designatedSlot = await prisma.parkingSlot.findUnique({ where: { id: reservation.slotId } });
                await assignSlotAndStartSession(reservation, designatedSlot);
                console.log(`✅ Reservation honored. Vehicle ${plateNumber} assigned to slot ${designatedSlot?.id}.`);
                // ✅ تعيين القرار بالنجاح
                decision = 'ALLOW_ENTRY';
                reason = 'RESERVATION_HONORED';
                message = `Vehicle assigned to reserved slot ${designatedSlot?.id} and session started.`;
                slotName = designatedSlot?.id || "";

            } else if (reservation.isStacked && designatedSlotStatus?.status === SlotStatus.OCCUPIED) {
                console.log(`⚠️ Stacked reservation's slot is OCCUPIED. Searching for a safe alternative...`);
                const alternativeSlot = await findSafeAlternativeSlot();

                if (alternativeSlot) {
                    await assignSlotAndStartSession(reservation, alternativeSlot);
                    
                    console.log(`✅ Stacked reservation relocated. Vehicle ${plateNumber} assigned to alternative slot ${alternativeSlot.id}.`);
                    // ✅ تعيين القرار بالنجاح مع مكان بديل
                    decision = 'ALLOW_ENTRY';
                    reason = 'STACKED_RESERVATION_RELOCATED';
                    message = `Vehicle assigned to alternative slot ${alternativeSlot.id} and session started.`;
                    slotName = alternativeSlot.id;
                } else {
                    reason = 'NO_SAFE_ALTERNATIVE_SLOT';
                    message = 'Garage is full; no safe alternative slots available.';
                }

            } else {
                reason = 'RESERVED_SLOT_UNAVAILABLE';
                message = 'Designated slot is unavailable and reservation is not stackable,';   
            }
        }
        // =======================
        //  الحالة ب: لا يوجد حجز (Walk-in)
        // =======================
        else {
            const permission = await redis.get(`entry-permit:${plateNumber}`);

            if (!permission) {
                reason = 'NO_RESERVATION_OR_PERMIT';
                message = 'No walk-in permit found, have you scanned the QR code.';
                
            } else {
                console.log(`🅿️ Walk-in permit found for ${plateNumber}. Searching for a safe slot...`);
                const { userId, vehicleId,expectedExitTime,paymentTypeDecision,paymentIntentId } = JSON.parse(permission);
                const expectedExitTimeDate = new Date(expectedExitTime); // Convert string to Date
                const safeSlot = await findSafeAlternativeSlot();

                if (!safeSlot) {
                    reason = 'GARAGE_IS_FULL';
                    message = 'Sorry, the garage is currently full.'; // Add message for this case
                } else {
                    

                    const now = new Date(); // Get current time precisely here
            const exitDelay = expectedExitTimeDate.getTime() - now.getTime();
            const occupancyCheckDelay = OCCUPANCY_CHECK_DELAY_AFTER_ENTRY; // Use constant

            // 2. Create Delayed Jobs
            const exitJob = await sessionLifecycleQueue.add(
                'check-session-expiry',
                { vehicleId }, // Initial data, will update with sessionId
                { delay: exitDelay > 0 ? exitDelay : 0 }
            );

            const occupancyCheckJob = await sessionLifecycleQueue.add(
                'check-actual-occupancy',
                { vehicleId }, // Initial data, will update with sessionId
                { delay: occupancyCheckDelay }
            );

            if (!exitJob?.id || !occupancyCheckJob?.id) {
                // Attempt to remove jobs if one failed
                if(exitJob) await exitJob.remove();
                if(occupancyCheckJob) await occupancyCheckJob.remove();
                throw new Error('Failed to create necessary session jobs for walk-in.');
            }

            if(paymentTypeDecision === paymentMethod.CARD && !paymentIntentId) {
                // Attempt to remove jobs if one failed
                if(exitJob) await exitJob.remove();
                if(occupancyCheckJob) await occupancyCheckJob.remove();
                throw new Error('payment should be with cart and there is not payment Id in the redis permission.');
            }

                    const newSession = await prisma.parkingSession.create({ data:
                         { userId, vehicleId, slotId: safeSlot.id,expectedExitTime, 
                            entryTime: now,exitCheckJobId:exitJob.id,
                            occupancyCheckJobId:occupancyCheckJob.id, status: ParkingSessionStatus.ACTIVE,
                            paymentType:paymentTypeDecision,
                            paymentIntentId,
                        } });
                    
                    // 4. Update Jobs with Session ID
            await exitJob.updateData({ ...exitJob.data, parkingSessionId: newSession.id });
            await occupancyCheckJob.updateData({ ...occupancyCheckJob.data, parkingSessionId: newSession.id });

                    await ParkingSlot.updateOne({ _id: safeSlot.id }, { $set: { status: SlotStatus.ASSIGNED ,current_vehicle:{
                        plateNumber,
                        occupied_since:null,
                        reservation_id:null,

                    }} ,
                    // Optional: $inc stats.total_uses_today if assignment counts
                });
                    await redis.del(`entry-permit:${plateNumber}`);

                    // ✅ تعيين القرار بالنجاح للـ Walk-in
                    decision = 'ALLOW_ENTRY';
                    message = `Walk-in vehicle assigned to slot ${safeSlot.id} and session started.`;
                    reason = 'WALK_IN_PERMIT_ACCEPTED';
                    slotName = safeSlot.id;
                }
            }
        }
        
        jobStatus = { success: true, decision, reason, slotName,message };

    } catch (error: any) {
        console.error(`❌ CRITICAL ERROR in job ${job.id}: ${error.message}`);
        reason = 'INTERNAL_SERVER_ERROR'; // decision يبقى على قيمته الافتراضية 'DENY_ENTRY'
        jobStatus = { success: false, error: error.message };
        
    } finally {
        // 2. إرسال القرار النهائي عبر MQTT
        // هذا الجزء سيعمل دائمًا، سواء نجحت العملية أو فشلت
        const responsePayload = JSON.stringify({
            requestId,
            decision,
            reason,
            message,
            slotName,
            timestamp: new Date().toISOString(),
        });

        console.log(`📢 Publishing final decision to topic ${responseTopic}:`, responsePayload);
        mqttClient.publish(responseTopic, responsePayload);

        // 3. إرجاع نتيجة المهمة للـ Queue نفسها
        return jobStatus;
    }
};