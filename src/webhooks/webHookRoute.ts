// routes/webhookRoutes.ts
import { Router } from 'express';
import { prisma } from '../routes/prsimaForRouters.js';
import { stripe } from '../services/stripe.js';
import Stripe from 'stripe';
import { TransactionStatus } from '../../src/generated/prisma/index.js';

const router = Router();

// ده الـ Secret اللي جبته من داش بورد Stripe وحطيته في .env
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;

// POST /api/webhooks/stripe
router.post('/stripe', async (req, res) => {
    const sig = req.headers['stripe-signature'] as string;
    const body = req.body; // (ده الـ Raw Body عشان السطر اللي ضفناه في app.ts)

    let event: Stripe.Event;

    // --- 1. التحقق من إن الرسالة دي جاية من Stripe فعلًا ---
    try {
        event = stripe.webhooks.constructEvent(body, sig, endpointSecret);
        console.log('Webhook signature verified.');
    } catch (err: any) {
        console.error(`❌ Webhook signature verification failed:`, err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // --- 2. معالجة الحدث (هنا اللوجيك بتاعك) ---
    try {
        // إحنا يهمنا بس الحدث ده:
        if (event.type === 'checkout.session.completed') {
            const session = event.data.object as Stripe.Checkout.Session;

            // 3. هات الـ ID الداخلي بتاعنا اللي خزنّاه في الـ metadata
            const internalTxnId = session.metadata?.parking_session_id;

            if (!internalTxnId) {
                console.error(`CRITICAL: Webhook ${event.id} completed, but no parking_session_id!`);
                return res.status(400).send('Missing metadata.');
            }

            // 4. ابحث عن المعاملة
            const paymentTransaction = await prisma.paymentTransaction.findUnique({
                where: { id: parseInt(internalTxnId) }, // ⬅️ حوله لـ Int
                include: { parkingSession: { include: { vehicle: true } } } // هات الجلسة والعربية
            });

            if (!paymentTransaction) {
                 console.error(`CRITICAL: Webhook ${event.id} refers to non-existent transaction ${internalTxnId}.`);
                 return res.status(404).send('Transaction not found.');
            }

            // 5. تحديث المعاملة (لو كانت لسه مش COMPLETED)
            if (paymentTransaction.transactionStatus !== TransactionStatus.COMPLETED) {
                await prisma.paymentTransaction.update({
                    where: { id: paymentTransaction.id },
                    data: {
                        transactionStatus: TransactionStatus.COMPLETED,
                        paidAt: new Date()
                    }
                });

                // 6. ⬛️ شيل العربية من القائمة السوداء ⬛️
                await prisma.vehicle.update({
                    where: { id: paymentTransaction.parkingSession.vehicleId },
                    data: { hasOutstandingDebt: false }
                });

                console.log(`✅ Debt paid for transaction ${internalTxnId}. Vehicle ${paymentTransaction.parkingSession.vehicle.plate} removed from blacklist.`);
            } else {
                 console.log(`Webhook received for already completed transaction ${internalTxnId}. Ignoring.`);
            }
        } else {
            console.log(`Received unhandled webhook event type: ${event.type}`);
        }

        // --- 7. رجع 200 لـ Stripe (عشان يعرف إنك استلمت) ---
        res.status(200).json({ received: true });

    } catch (error: any) {
         console.error(`Error processing webhook event ${event.id}:`, error.message);
         res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;