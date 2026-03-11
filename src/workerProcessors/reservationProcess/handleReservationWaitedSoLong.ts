import { Job } from 'bullmq';
import { prisma } from '../../routes/prsimaForRouters.js'; // تأكد من المسار
import { ReservationsStatus, ParkingSessionStatus } from "../../generated/prisma/client.js";
import { AlertSeverity, AlertType, SlotStatus } from "../../types/parkingEventTypes.js";
import { Alert } from "../../mongo_Models/alert.js";
import { stripe } from "../../services/stripe.js";
import { NO_SHOW_PENALTY_AMOUNT } from '../../constants/constants.js';
import { ParkingSlot } from '../../mongo_Models/parkingSlot.js';
// import { NO_SHOW_PENALTY_AMOUNT } from "../../constants/constants.js";

export const handleReservationNoShowCheck = async (job: Job) => {
    const { reservationId } = job.data;

    try {
        // 1. نجيب الحجز من الداتابيز
        const reservation = await prisma.reservation.findUnique({
            where: { id: reservationId }
        });

        // 2. لو الحجز مش موجود أو حالته اتغيرت (اتلغى أو اكتمل)، نوقف الشغل
        if (!reservation || reservation.status !== ReservationsStatus.CONFIRMED) {
            console.log(`ReservationNoShow Job ${job.id}: Reservation ${reservationId} not active. No action needed.`);
            return;
        }

        // 3. نتأكد هل اليوزر عمل Session (عدى من البوابة) ولا لأ؟
        // بنبحث عن Active Session لنفس اليوزر ونفس العربية وفي وقت متقاطع مع الحجز
        const activeSession = await prisma.parkingSession.findFirst({
            where: {
                userId: reservation.userId,
                vehicleId: reservation.vehicleId,
                status: ParkingSessionStatus.ACTIVE,
                // لو عامل ربط مباشر بين الـ Session والـ Reservation ID يكون أفضل (reservationId: reservation.id)
            }
        });

        // 4. لو مفيش Session، يبقى اليوزر مجاش (No-Show)
        if (!activeSession) {
            console.warn(`ReservationNoShow Job ${job.id}: User ${reservation.userId} did NOT show up for reservation ${reservation.id}.`);

            // a. تحديث حالة الحجز لـ CANCELLED أو NO_SHOW
            await prisma.reservation.update({
                where: { id: reservation.id },
                data: { status: ReservationsStatus.CANCELLED } // أو ضيف NO_SHOW في الـ Enum بتاعك
            });


            await ParkingSlot.updateOne({
                _id: reservation.slotId
            }, {
                $set: {
                    status: SlotStatus.AVAILABLE,
                    current_vehicle: {
                        plate_number: null,
                        occupied_since: null,
                        reservation_id: null,
                    }
                }
            })

            // b. سحب الغرامة من الـ Stripe Hold (لو كان دافع بالفيزا)
            if (reservation.paymentIntentId) {
                try {
                    // اسحب جزء من المبلغ كغرامة (أو المبلغ كله حسب البزنس لوجيك)
                    await stripe.paymentIntents.capture(reservation.paymentIntentId, {
                        amount_to_capture: NO_SHOW_PENALTY_AMOUNT * 100,
                    });
                    console.log(`Successfully captured penalty for No-Show reservation ${reservation.id}`);

                } catch (stripeError: any) {
                    console.error(`Stripe Error in No-Show Job: ${stripeError.message}`);
                }
            }

            await Alert.create({
                alert_type: AlertType.NO_SHOW,
                title: 'Reservation No-Show',
                description: `User (ID: ${reservation.userId}) did not arrive for reservation ${reservation.id}. Reservation cancelled.`,
                message: `User (ID: ${reservation.userId}) did not arrive for reservation ${reservation.id}. Reservation cancelled.`,
                severity: AlertSeverity.HIGH,
                timestamp: new Date(),
                details: {
                    reservationId: reservation.id,
                    userId: reservation.userId,
                    slotId: reservation.slotId
                }
            });

            // ملاحظة: المكان (Slot) في الـ Prisma هيفضى تلقائياً لأن الـ Smart Search بتاعك
            // بيعتمد على إن الحجز يكون مش CANCELLED عشان يعتبر المكان مشغول.
            console.log(`Reservation ${reservation.id} cancelled due to No-Show. Slot ${reservation.slotId} is now free.`);
            return;
        } else {
            // اليوزر جه وعمل Session، كدة كله تمام
            console.log(`ReservationNoShow Job ${job.id}: User showed up and has active session ${activeSession.id}. All good.`);
        }

    } catch (error: any) {
        console.error(`❌ CRITICAL ERROR in ReservationNoShow Job ${job.id}: ${error.message}`);
        throw error;
    }
};