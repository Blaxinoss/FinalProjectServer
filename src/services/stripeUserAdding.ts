// services/paymentService.ts
import { stripe } from './stripe.js'; // (ملف تهيئة Stripe)
import { prisma } from '../routes/prsimaForRouters.js';
/**
 * بينشئ عميل في Stripe لليوزر ده وبيحفظ التوكن بتاعه.
 * @param userId الـ ID بتاع اليوزر في الداتابيز بتاعتنا.
 * @param paymentMethodId التوكن الآمن اللي جاي من الفرونت إند. بعد ما اليوزر دخل بيانات الفيزا بتاعته
 * @returns الـ ID بتاع العميل في Stripe (اللي هو التوكن اللي هنحفظه).
 */
export const createSetupIntent = async (userId: number) => {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("User not found");

    let stripeCustomerId = user.paymentGatewayToken;

    // 1. تأكد من وجود العميل أولاً
    if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
            email: user.email,
            metadata: { userId: userId.toString() }
        });
        stripeCustomerId = customer.id;

        // احفظه فوراً في الداتا بيز
        await prisma.user.update({
            where: { id: userId },
            data: { paymentGatewayToken: stripeCustomerId }
        });
    }

    // 2. انشئ الـ SetupIntent للعميل ده
    const setupIntent = await stripe.setupIntents.create({
        customer: stripeCustomerId,
        payment_method_types: ['card'], // بنحدد إننا هنحفظ كارت
    });

    // 3. رجع الـ secret للموبايل عشان يفتح الـ UI
    return {
        clientSecret: setupIntent.client_secret,
        stripeCustomerId
    };
};

