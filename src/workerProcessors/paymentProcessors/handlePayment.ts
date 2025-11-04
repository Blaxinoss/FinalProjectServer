import type { Job } from "bullmq";
import { prisma } from "../../routes/routes.js";
import { paymentMethod, TransactionStatus, type ParkingSession, type paymentTransaction, type User } from "../../src/generated/prisma/index.js";
import { Alert } from "../../mongo_Models/alert.js";
import { AlertSeverity, AlertType } from "../../types/parkingEventTypes.js";
import { stripe } from "../../services/stripe.js";
import { sendPushNotification } from "../../services/notifications.js";
import { sendSmsNotification } from "../../services/smsTwilio.js";

export const handlePayment = async (job: Job) => {

    const { sessionId, amount, userId, plateNumber } = job.data

    if (!sessionId || !amount || !userId || !plateNumber) {
        console.log(`data missing while running job ${job.id}`)
        throw (`data is missing for the payment worker on job ${job.id}`)
    }
    

    const session: ParkingSession = await prisma.parkingSession.findUniqueOrThrow({
        where: { id: sessionId }
    })

    const user: User = await prisma.user.findUniqueOrThrow({
        where: { id: userId }
    })

    if (!session) {
        console.log(`couldn't find a session for this id to create a payment transaction`)
        throw (`couldn't find a session for this id to create a payment transaction`)
    }

    if (session.paymentType === paymentMethod.CARD && !session.paymentIntentId) {
        console.log(`card payment but there is no Intent Id ?`)
        throw (`card payment but session lacks Intent Id can't proceed`)
    }

    const paymentTransaction: paymentTransaction = await prisma.paymentTransaction.create({
        data: {
            amount,
            parkingSessionId: sessionId,
            paymentMethod: session.paymentType,
            transactionStatus: TransactionStatus.PENDING
        }
    })


    // --- 3. التوجيه (هنبني المسار الأخضر) ---
    if (session.paymentType === paymentMethod.CASH) {

        await Alert.create({
            alert_type: AlertType.PAYMENT_HELP_REQUEST,
            severity: AlertSeverity.CRITICAL,
            description: `a cash parking session car ${plateNumber} is requesting imidiate payment and reaching the gate, please welcome it`,
            timestamp: new Date(),
            details: {
                plateNumber,
                amount,
                originalPaymentType: session.paymentType

            }
        })
        console.log(`cash alert was created for job ${job.id}`)
        return `CASH payment pending. Alert sent.`;
    }




    if (session.paymentType === paymentMethod.CARD) {
        if (!session.paymentIntentId) {
            console.warn(`Card payment for session ${sessionId} but NO paymentIntentId found.`);
            // (هنا هندخل في المسار الأحمر - فشل الدفع)
            // ... (لوجيك البلاك ليست واللينك هييجي هنا) ...
            throw new Error(`Card payment for session ${sessionId} but NO paymentIntentId found.`);
        }

        const paymentIntentId = session.paymentIntentId;

        try {
            // --- ⬇️ الخطوة الحاسمة (الخصم الفعلي) ⬇️ ---
            // 4. محاولة سحب المبلغ (Capture)
            await stripe.paymentIntents.capture(
                paymentIntentId,
                { amount_to_capture: amount }
            );

            // 5. نجح السحب (السيناريو الأخضر) ✅
            console.log(`✅ Stripe payment captured successfully for session ${sessionId}.`);

            // تحديث المعاملة لـ "مكتملة"
            await prisma.paymentTransaction.update({
                where: { id: paymentTransaction.id },
                data: {
                    transactionStatus: TransactionStatus.COMPLETED,
                    paidAt: new Date()
                }
            });
            // (إرسال إشعار "إيصال" للعميل)
            await sendPushNotification(userId, "Payment Successful", `Charged ${amount/100} EGP for your parking.`);

            return `Payment ${paymentTransaction.id} completed and payment went successfully. for job ${job.id}`;
            // --- ⬆️ نهاية الخطوة الحاسمة ⬆️ ---
        } catch (stripeError: any) {
            // (هنا هندخل في المسار الأحمر - فشل الدفع)
            console.warn(`Payment capture failed for session ${sessionId} (PI: ${paymentIntentId}):`, stripeError.message);
            // ... (لوجيك البلاك ليست واللينك هييجي هنا) ...
            await prisma.paymentTransaction.update({
                where: { id: paymentTransaction.id },
                data: { transactionStatus: TransactionStatus.UNPAID_EXIT }
            });

            // ب. وضع العربية في القائمة السوداء
            await prisma.vehicle.update({
                where: { plate: plateNumber },
                data: { hasOutstandingDebt: true }
            });

            console.log(`⬛️ Vehicle ${plateNumber} blacklisted due to failed payment.`);

            //create the checkout Link to give to the exiting user when failing to pay
            const Checkoutsession = await stripe.checkout.sessions.create({
            line_items: [{
                price_data: {
                currency: 'egp',
                product_data: {
                    name: `Parking Fee ${session.id}`,
                },
                unit_amount: amount,
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: 'https://your-site.com/thanks',
            cancel_url: 'https://your-site.com/try-again',

            //  <<<--- هنا أهم جزء ---<<<
            metadata: {
                'parking_session_id': session.id,
                'user_phone':user.phone,
                'user_mail':user.email,
                'user_Nationa_id':user.NationalID,
            }
            });


                //or use pushToken this is so critical back to it 
                //TODO
                //!!!!!!!!!!!!!!!!!!####!!!!!!!!!!!!!!!
                if (session.reservationId) {
                //!!!!!!!!!!!!!!!!!!####!!!!!!!!!!!!!!!

                    console.log('sending application notification')
                await sendPushNotification(user.id,
                    `Payment Failed for session ${sessionId}`,
                `We couldn't charge your card for ${amount/100} EGP. The gate will open, but your vehicle is now blacklisted. Please pay via this link:${Checkoutsession.url}`);
            } else {
                console.log('User is a walk in. Sending SMS.');

                await Alert.create({
                    alert_type: AlertType.PAYMENT_HELP_REQUEST,
                    severity: AlertSeverity.CRITICAL,
                    description: `a WALK_IN car parking session failed car ${plateNumber} the gate will be opened to him anyway but be at gate if he want to pay in cash`,
                    timestamp: new Date(),
                    details: {
                        plateNumber,
                        amount,
                        originalPaymentType: session.paymentType

                    }
                })
                                    console.log('sending sms notification')

                await sendSmsNotification(user.phone, `we apologize but your payment has failed an alert has been fired and someone is on his way to you to collect 
                    the money on cash,but the gate will still be oppened ${Checkoutsession.url
                    }`)

            }

            //failing the paymentInten
            await stripe.paymentIntents.cancel(session.paymentIntentId)


            return `Payment failed for session ${sessionId}. User blacklisted and notified. and Intent was canceled`;
        }
    }
    
          await prisma.paymentTransaction.update({
                where: { id: paymentTransaction.id },
                data: { transactionStatus: TransactionStatus.FAILED }
            });
console.log(`Unknown payment method: ${session.paymentType}`); // ⬅️ استخدم paymentMethod
}


