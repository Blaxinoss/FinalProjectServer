// services/paymentService.ts
import { stripe } from './stripe.js'; // (ملف تهيئة Stripe)
import { prisma } from '../routes/prsimaForRouters.js';
/**
 * بينشئ عميل في Stripe لليوزر ده وبيحفظ التوكن بتاعه.
 * @param userId الـ ID بتاع اليوزر في الداتابيز بتاعتنا.
 * @param paymentMethodId التوكن الآمن اللي جاي من الفرونت إند. بعد ما اليوزر دخل بيانات الفيزا بتاعته
 * @returns الـ ID بتاع العميل في Stripe (اللي هو التوكن اللي هنحفظه).
 */
export const createStripeCustomerAndSaveToken = async (userId: number, paymentMethodId: string) => {
    
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("User not found");

    // 1. انشئ العميل في Stripe
    const customer = await stripe.customers.create({
        payment_method: paymentMethodId,
        email: user.email, // (أو أي بيانات تانية)
        phone: user.phone,
        invoice_settings: {
            default_payment_method: paymentMethodId,
        },
    });

    // 2. احفظ التوكن (customer.id) في الداتابيز بتاعتنا
    await prisma.user.update({
        where: { id: userId },
        data: { paymentGatewayToken: customer.id }
    });

    // 3. رجع التوكن (customer.id) عشان الخطوة الجاية
    return customer.id;
}