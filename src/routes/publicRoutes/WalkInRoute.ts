import { Router } from 'express';
import { prisma } from '../routes.js';
import { getRedisClient } from '../../db&init/redis.js';
import { createStripeCustomerAndSaveToken } from '../../services/stripeUserAdding.js';
import { stripe } from '../../services/stripe.js';
import { HOLDAMOUNT_WHILE_RESERVATIONS } from '../../constants/constants.js';
import { paymentMethod } from '../../src/generated/prisma/index.js';

const router = Router();

// داخل ملف walkInRoutes.ts

// داخل ملف walkInRoutes.ts

router.post('/register', async (req, res) => {
  try {
    const { uuid,name, phone, email,plateNumber,expectedDurationMinutes,licenseExpiry,paymentMethodId , paymentTypeDecision} = req.body;
 const redis = await getRedisClient();
    // --- 🛡️ قسم التحقق من الصحة (Validation) ---
 if (!plateNumber || !phone || !uuid || !name || !email || !expectedDurationMinutes || !paymentTypeDecision ) {
      return res.status(400).json({ error: 'Missing data, all fields are required.' });
    }
    const phoneRegex = /^01[0125][0-9]{8}$/;
    if (!phoneRegex.test(phone)) {
      return res.status(400).json({ error: 'Invalid Egyptian phone number format.' });
    }
    if (plateNumber.length < 3 || plateNumber.length > 10) {
      return res.status(400).json({ error: 'Invalid plate number length.' });
    }

    if(paymentTypeDecision === paymentMethod.CARD && !paymentMethodId){
      return res.status(400).json({ error: 'error finding the MethodId ensure that you entered a valid Card information.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (email && !emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format.' });
    }

    let paymentIntentId: string | null = null

  
    console.log(`Validation passed for plate: ${plateNumber}`);

    // --- 💾 قسم قاعدة البيانات (Prisma) ---

    // ابحث عن مستخدم بهذا الرقم.
    const durationMs = parseInt(expectedDurationMinutes, 10) * 60 * 1000;
    const expectedExitTime = new Date(Date.now() + durationMs);


    let user = await prisma.user.findUnique({ where: { phone:phone } });

    // إذا لم يكن المستخدم موجودًا، قم بإنشاء مستخدم "مؤقت" جديد.
    if (!user) {
      console.log(`User with phone ${phone} not found. Creating a new one.`);
      user = await prisma.user.create({
        data: {
          uuid,
          phone,
          name,
          email,// بريد إلكتروني فريد مؤقت
          NationalID: `${phone}-NID`,
          address: 'N/A',
          licenseNumber: `${phone}-LIC`,
          licenseExpiry :new Date(licenseExpiry),
        },
      });
    }

    // ابحث عن سيارة بهذا الرقم.
    let vehicle = await prisma.vehicle.findUnique({ where: { plate: plateNumber } });

    // إذا لم تكن السيارة موجودة، أنشئها واربطها بالمستخدم.
    if (!vehicle) {
      console.log(`Vehicle with plate ${plateNumber} not found. Creating a new one.`);
      vehicle = await prisma.vehicle.create({
        data: {
          plate: plateNumber,
          color: 'Unknown', // لون افتراضي
          userId: user.id, // الربط مع المستخدم الذي وجدناه أو أنشأناه
        },
      });
    }
    
    if(vehicle.hasOutstandingDebt || user.hasOutstandingDebt){
      return res.status(403).json({error:"user and vehicle are black listed due to unpaid reservation"})
    }

    
if(paymentTypeDecision === paymentMethod.CARD){
    // 1. انشئ العميل في Stripe
    const customer = await stripe.customers.create({
        payment_method: paymentMethodId,
        email: user.email, // (أو أي بيانات تانية)
        phone: user.phone,
        invoice_settings: {
            default_payment_method: paymentMethodId,
        },
    });

    if(!customer){
      throw new Error(`couldn't create a stripe user`)
    }

await prisma.user.update({
        where: { id: user.id },
        data: { paymentGatewayToken: customer.id }
    });

    const paymentIntent = await stripe.paymentIntents.create({
        amount: HOLDAMOUNT_WHILE_RESERVATIONS, // مثلاً 20 جنيه
        currency: 'egp',
        customer: customer.id,
            payment_method: paymentMethodId, 
        capture_method: 'manual', // ⬅️ هولد فقط
        confirm: true,
        off_session: true,
    });
    
    paymentIntentId = paymentIntent.id
  
    console.log(`Payment authorized (Hold) successfully: ${paymentIntent.id}`);
}
    
    console.log(`Database records are ready for user: ${user.id} and vehicle: ${vehicle.id}`);

    await redis.set(`entry-permit:${plateNumber}`, JSON.stringify({userId: user.id, paymentIntentId, paymentTypeDecision,vehicleId: vehicle.id,expectedExitTime: expectedExitTime.toISOString()}),'EX',900); // صلاحية 15 دقيقة


    // TODO: الخطوة التالية (النقطة الثالثة): التعامل مع Redis (المنطق الذكي)

    res.status(200).json({ message: 'User and vehicle are ready. Processing...' });

  } catch (error: any) {
    console.error("Error in /walk-in/register:", error);
    // تحقق من الأخطاء الشائعة مثل وجود بريد إلكتروني مكرر
    if (error.code === 'P2002') { // كود Prisma للـ Unique constraint violation
      return res.status(409).json({ error: 'A user with this phone or email already exists with different data.' });
    }

    if (error.type === 'StripeCardError') {
        return res.status(402).json({ error: `Payment failed: ${error.message}` });
    }

    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;