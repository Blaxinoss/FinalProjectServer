// (مثال في ملف userAccountRoutes.ts)
import { stripe } from '../../services/stripe.js';
import { prisma } from "../routes.js";
import { Router } from 'express';
import { createStripeCustomerAndSaveToken } from '../../services/stripeUserAdding.js';

const router = Router()
// POST /api/user/save-card
// (الفرونت إند هيبعتلك حاجة اسمها "PaymentMethod ID" بعد ما العميل يدخل بياناته في فورم آمن)
router.post('/user/save-card', async (req, res) => {
    try{
    const { paymentMethodId } = req.body; // paymentMethodId بييجي من الفرونت إند (Stripe.js)

 const customerToken = await createStripeCustomerAndSaveToken(req.user?.id!, paymentMethodId);

        res.status(200).json({ message: 'Card saved successfully!' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});