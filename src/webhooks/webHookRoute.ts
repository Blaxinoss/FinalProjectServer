// routes/webhookRoutes.ts
import type { Request, Response } from 'express';
import express, { Router } from 'express';
import { TransactionStatus } from '../../src/generated/prisma/index.js';
import { DEBT_CLEARED } from '../constants/constants.js';
import { getEmitter } from '../db&init/redisWorkerEmitterWithClient.js';
import { prisma } from '../routes/prsimaForRouters.js';
import { stripe } from '../services/stripe.js';
const router = Router();

// لاحظ استخدمنا express.raw هنا عشان سترايب
router.post('/stripe', express.raw({ type: 'application/json' }), async (req: Request, res: Response) => {
    const sig = req.headers['stripe-signature'] as string;
    const Emitter = getEmitter();
    // السيكرت ده بتجيبه من داشبورد سترايب (صفحة الـ Webhooks)
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;

    let event;

    try {
        // الخطوة دي بتضمن إن الريكويست جاي من سترايب فعلاً مش من هاكر
        event = await stripe.webhooks.constructEventAsync(req.body, sig, endpointSecret);
    } catch (err: any) {
        console.error(`❌ Webhook Error: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // إحنا مهتمين بحدث "نجاح الدفع" بس
    if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object as any;

        // ✨ هنا بنستلم الـ metadata اللي بعتناها وإحنا بنكريت الـ PaymentIntent
        const { transactionId, userId } = paymentIntent.metadata;
        const Int_transactionId = parseInt(transactionId)
        const Int_userId = parseInt(userId);
        if (transactionId && userId) {
            console.log(`✅ Webhook: Payment successful for Transaction: ${Int_transactionId}`);

            try {
                // 1. تحديث حالة المعاملة لـ COMPLETED
                const updatedTx = await prisma.paymentTransaction.update({
                    where: { id: Int_transactionId },
                    data: {
                        transactionStatus: TransactionStatus.COMPLETED,
                        paidAt: new Date() // لو عندك حقل لده
                    },
                    include: { parkingSession: true, }
                });

                // 2. فك الحظر (Blacklist) عن اليوزر
                await prisma.user.update({
                    where: { id: Int_userId },
                    data: { hasOutstandingDebt: false }
                });

                // 3. فك الحظر عن العربية (لو محتاج)
                if (updatedTx.parkingSession?.vehicleId) {
                    await prisma.vehicle.update({
                        where: { id: updatedTx.parkingSession.vehicleId },
                        data: { hasOutstandingDebt: false }
                    });
                }

                console.log(`🔓 User ${Int_userId} and their vehicle are now cleared from blacklist.`);

                Emitter.to(`user_${Int_userId}`).emit(DEBT_CLEARED, { message: "Your account is active again!" });

            } catch (dbError) {
                console.error("Database update failed inside webhook:", dbError);
            }
        }
    }

    // 🔴 لازم دايماً نرد على سترايب بـ 200، وإلا هتفضل تبعت نفس الريكويست لمدة 3 أيام!
    res.status(200).json({ received: true });
});

export default router;