import { Job } from 'bullmq';
import { prisma } from '../../routes/prsimaForRouters.js'; // تأكد من المسار
import { ReservationsStatus, ParkingSessionStatus, TransactionStatus } from "../../generated/prisma/client.js";
import { AlertSeverity, AlertType, SlotStatus } from "../../types/parkingEventTypes.js";
import { Alert } from "../../mongo_Models/alert.js";
import { stripe } from "../../services/stripe.js";
import { NO_SHOW_PENALTY_AMOUNT } from '../../constants/constants.js';
import { ParkingSlot } from '../../mongo_Models/parkingSlot.js';
import { getEmitter } from '../../db&init/redisWorkerEmitterWithClient.js';
import { CANCELED_RESERVATION_EMITTER_MESSAGE } from '../../constants/constants.js';
// import { NO_SHOW_PENALTY_AMOUNT } from "../../constants/constants.js";

export const handleReservationNoShowCheck = async (job: Job) => {
    const { reservationId } = job.data;
    const Emitter = getEmitter()

    try {
        const reservation = await prisma.reservation.findUnique({
            where: { id: reservationId }
        });


        if (!reservation || reservation.status !== ReservationsStatus.CONFIRMED) {
            console.log(`ReservationNoShow Job ${job.id}: Reservation ${reservationId} not active. No action needed.`);
            return;
        }

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


            let penaltyPaid = false;
            let paymentLink = null;
            let currentTransactionStatus: TransactionStatus = TransactionStatus.PENDING;
            let currentStripeId: string | null = null;

            // 1. محاولة السحب (لو معاه فيزا فقط)
            if (reservation.paymentIntentId) {
                try {
                    await stripe.paymentIntents.capture(reservation.paymentIntentId, {
                        amount_to_capture: NO_SHOW_PENALTY_AMOUNT * 100,
                    });
                    console.log(`Successfully captured penalty for No-Show reservation ${reservation.id}`);
                    penaltyPaid = true; // 🟢 الدفع نجح
                    currentTransactionStatus = TransactionStatus.COMPLETED;
                    currentStripeId = reservation.paymentIntentId;

                } catch (stripeError: any) {
                    console.warn(`❌ Payment capture failed for No-Show ${reservation.id}:`, stripeError.message);
                    try { await stripe.paymentIntents.cancel(reservation.paymentIntentId); } catch (e: any) {
                        console.log("Couldn't cancel the old paymentIntent during reservation cancelling", e.message || "payment error")
                    }
                }
            }

            // 2. معالجة المديونية (لو الكارت فشل أو لو كان الدفع كاش من البداية)
            if (!penaltyPaid) {
                // هيدخل هنا لو الفيزا فشلت، أو لو مفيش فيزا أصلاً (كاش)

                const checkoutSession = await stripe.checkout.sessions.create({
                    line_items: [{
                        quantity: 1,
                        price_data: {
                            currency: "egp",
                            product_data: { name: `No-Show Penalty Fee (Reservation ${reservation.id})` },
                            unit_amount: NO_SHOW_PENALTY_AMOUNT * 100,
                        },
                    }],
                    mode: 'payment',
                    success_url: 'https://your-site.com/thanks',
                    cancel_url: 'https://your-site.com/try-again',
                    metadata: {
                        'reservation_id': reservation.id,
                        'user_id': reservation.userId,
                        'type': 'NO_SHOW_PENALTY'
                    }
                });

                paymentLink = checkoutSession.url;
                currentTransactionStatus = TransactionStatus.UNPAID_EXIT;
                currentStripeId = checkoutSession.id;

                // وضعه في القائمة السوداء
                await prisma.user.update({
                    where: { id: reservation.userId },
                    data: { hasOutstandingDebt: true }
                });

                await prisma.vehicle.update({
                    where: { id: reservation.vehicleId },
                    data: { hasOutstandingDebt: true }
                });

                console.log(`⬛️ User ${reservation.userId} blacklisted due to unpaid No-Show penalty (Cash or Failed Card).`);
            }

            Emitter.to(`user_${reservation.userId}`).emit(CANCELED_RESERVATION_EMITTER_MESSAGE, {
                type: "RESERVATION_CANCELLED",
                reservationId: reservation.id,
                charge: penaltyPaid ? NO_SHOW_PENALTY_AMOUNT : 0,
                debtAmount: !penaltyPaid ? NO_SHOW_PENALTY_AMOUNT : 0,
                paymentLink: paymentLink,
                isBlacklisted: !penaltyPaid,
                message: penaltyPaid
                    ? `Your reservation was canceled for no-show. A penalty of ${NO_SHOW_PENALTY_AMOUNT} EGP was charged.`
                    : `Your reservation was canceled. Penalty charge failed. You are blacklisted until you pay the ${NO_SHOW_PENALTY_AMOUNT} EGP via the provided link.`
            });

            console.log(`sending back to user_${reservation.userId} the cancelled reservation alert`)

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

            await prisma.paymentTransaction.create({
                data: {
                    userId: reservation.userId,
                    amount: NO_SHOW_PENALTY_AMOUNT,
                    transactionStatus: currentTransactionStatus,
                    reservationId: reservation.id,
                    stripeTransactionId: currentStripeId,

                }
            });
            console.log(`💳 PaymentTransaction recorded with status: ${currentTransactionStatus}`);


            console.log(`Reservation ${reservation.id} cancelled due to No-Show. Slot ${reservation.slotId} is now free.`);
            return;
        } else {
            console.log(`ReservationNoShow Job ${job.id}: User showed up and has active session ${activeSession.id}. All good.`);
        }

    } catch (error: any) {
        console.error(`❌ CRITICAL ERROR in ReservationNoShow Job ${job.id}: ${error.message}`);
        throw error;
    }
};