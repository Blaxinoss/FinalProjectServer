import type { Request, Response } from "express";
import { Router } from "express";
import { TransactionStatus } from "../../generated/prisma/index.js";
import { stripe } from "../../services/stripe.js";
import { prisma } from '../prsimaForRouters.js';



//TODO
//  AUTH
//CHECK BUSINESS LOGIC


const router = Router();


/* ---------------- GET My PAYMENT TRANSACTION  ---------------- */
router.get("", async (req: Request, res: Response): Promise<void> => {
  try {

    const userId = req.user?.id!;
    const transaction = await prisma.paymentTransaction.findMany({
      where: {
        parkingSession: {
          userId,
        }
      },
      include: { parkingSession: true },
      orderBy: {
        createdAt: 'desc'
      }
    });


    res.status(200).json({ success: true, data: transaction });
  } catch (error: any) {
    res.status(500).json({
      code: error.code || null,
      message: `Error while fetching this user payment transactions: ${error.message || "Unknown error"}`,
    });
  }
});



// router.post("/get-checkout-link", async (req: Request, res: Response): Promise<void> => {
//   try {
//     const { transactionId } = req.body;
//     const userId = req.user?.id;

//     const transaction = await prisma.paymentTransaction.findUnique({
//       where: { id: transactionId },
//       include: { parkingSession: true }
//     });

//     if (!transaction || transaction.userId !== userId) {
//       res.status(404).json({ success: false, message: "Transaction not found" });
//       return;
//     }

//     // 2. تأكد إنها لسه مدفعتش
//     if (transaction.transactionStatus === TransactionStatus.COMPLETED) {
//       res.status(400).json({ success: false, message: "Transaction already paid" });
//       return;
//     }

//     if (transaction.stripeSessionId) {
//       try {
//         const session = await stripe.checkout.sessions.retrieve(transaction.stripeSessionId);

//         if (session.status === 'open') {
//           res.status(200).json({
//             success: true,
//             url: transaction.stripeCheckoutUrl,
//             reused: true
//           });
//           return;
//         }
//       } catch (err: any) {
//         console.log("Old session not found or error, creating new one...", err?.message);
//       }
//     }
//     console.log("Generating a new fresh checkout link...");

//     const checkoutSession = await stripe.checkout.sessions.create({
//       line_items: [{
//         price_data: {
//           currency: 'egp',
//           product_data: {
//             name: `Parking Debt Recovery - Session ${transaction.parkingSessionId}`,
//           },
//           unit_amount: transaction.amount,
//         },
//         quantity: 1,
//       }],
//       mode: 'payment',
//       success_url: 'https://your-app.com/payment-success',
//       cancel_url: 'https://your-app.com/payment-failed',
//       metadata: {
//         transactionId: transaction.id,
//         parkingSessionId: transaction.parkingSessionId,
//         userId: userId
//       }
//     });

//     await prisma.paymentTransaction.update({
//       where: { id: transactionId },
//       data: {
//         stripeCheckoutUrl: checkoutSession.url,
//       }
//     });

//     res.status(200).json({
//       success: true,
//       data: {
//         url: checkoutSession.url,
//         reused: false
//       }
//     });

//   } catch (error: any) {
//     console.error("Error in get-checkout-link:", error.message);
//     res.status(500).json({ success: false, message: "Internal server error" });
//   }
// });


router.post("/get-payment-intent", async (req: Request, res: Response): Promise<void> => {
  try {
    const { transactionId } = req.body;
    const userId = req.user?.id;

    const transaction = await prisma.paymentTransaction.findUnique({
      where: { id: transactionId },
      include: { parkingSession: true }
    });

    if (!transaction || transaction.userId !== userId) {
      res.status(404).json({ success: false, message: "Transaction not found" });
      return;
    }

    if (transaction.transactionStatus === TransactionStatus.COMPLETED) {
      res.status(400).json({ success: false, message: "Transaction already paid" });
      return;
    }

    // --- حماية من الدفع المزدوج ---
    // لو كان فيه لينك قديم مبعوت في SMS، هنلغيه عشان اليوزر هيدفع من الأبلكيشن دلوقتي
    if (transaction.stripeSessionId) {
      try {
        const session = await stripe.checkout.sessions.retrieve(transaction.stripeSessionId);
        if (session.status === 'open') {
          console.log(`Expiring old web session ${session.id} to prevent double charge`);
          await stripe.checkout.sessions.expire(session.id);
        }
      } catch (err: any) {
        console.log("Error checking old session:", err?.message);
      }
    }

    console.log("Generating a new PaymentIntent for Native Mobile App...");

    // كريت الـ PaymentIntent النيتيف
    const paymentIntent = await stripe.paymentIntents.create({
      amount: transaction.amount,
      currency: 'egp',
      // metadata مهمة جداً عشان الـ Webhook
      metadata: {
        transactionId: transaction.id,
        parkingSessionId: transaction.parkingSessionId,
        userId: userId
      }
    });

    // اختياري: ممكن تسيف الـ paymentIntent.id في الترانزاكشن للتبع
    // await prisma.paymentTransaction.update({ ... })

    res.status(200).json({
      success: true,
      data: {
        clientSecret: paymentIntent.client_secret, // 👈 بنرجع السيكرت
      }
    });

  } catch (error: any) {
    console.error("Error in get-payment-intent:", error.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});


export default router;