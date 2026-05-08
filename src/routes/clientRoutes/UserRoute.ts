import { Router } from "express";
import type { Request, Response } from "express";

import { prisma } from "../prsimaForRouters.js";
import { createSetupIntent } from "../../services/stripeUserAdding.js";
import { stripe } from "../../services/stripe.js";

//TODO
//  AUTH
//CHECK BUSINESS LOGIC


const router = Router();


//
router.get("/", async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id!;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { ParkingSessions: true, Vehicles: true },
    });

    res.status(200).json({ user });
  } catch (error: any) {
    res.status(500).json({
      code: error.code || null,
      message: `Error while fetcching the user cars: ${error.message || "Unknown error"}`
    });
    return;
  }
});
router.get("/cards", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id!;
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user?.paymentGatewayToken) {
      res.status(404).json({
        success: false,
        message: "لم يتم العثور على حساب دفع لهذا المستخدم"
      });
      return;
    }

    const paymentMethods = await stripe.paymentMethods.list({
      customer: user.paymentGatewayToken,

      type: "card",
    });

    // 2. رد النجاح
    res.status(200).json({
      success: true,
      data: paymentMethods.data
    });

  } catch (error: any) {
    // 3. حالة الـ 500 (خطأ غير متوقع في السيستم أو Stripe)
    console.error("Stripe Error:", error.message);
    res.status(500).json({
      success: false,
      message: "حدث خطأ فني أثناء جلب البطاقات"
    });
    return;
  }
});

router.delete("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id!;

    const deletedUser = await prisma.user.delete({
      where: { id: userId },
    });

    res.status(200).json({
      message: "User deleted successfully",
      user: deletedUser,
    });
  } catch (error: any) {
    res.status(500).json({
      code: error.code || null,
      message: `Error while deleting the user: ${error.message || "Unknown error"}`
    });
    return;
  }
});


router.delete("/cards/:paymentMethodId", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id!;
    const { paymentMethodId } = req.params;

    // 1. التأكد من وجود الـ paymentMethodId في الريكويست
    if (!paymentMethodId) {
      res.status(400).json({
        success: false,
        message: "Payment Method ID is required"
      });
      return;
    }

    // 2. نجيب بيانات اليوزر عشان الـ Customer Token
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user?.paymentGatewayToken) {
      res.status(404).json({
        success: false,
        message: "couldn't find customer token for this user"
      });
      return;
    }
    const paymentMethods = await stripe.paymentMethods.list({
      customer: user.paymentGatewayToken,
      type: "card",
    });

    const userCards = paymentMethods.data;

    const cardExists = userCards.some((card) => card.id === paymentMethodId);
    if (!cardExists) {
      res.status(403).json({
        success: false,
        message: "You don't have permission to delete this card or it dosn't exist"
      });
      return;
    }

    if (userCards.length <= 1) {
      res.status(400).json({
        success: false,
        message: "you can't delete the only card you have, please and another card and try again"
      });
      return;
    }

    await stripe.paymentMethods.detach(paymentMethodId);

    // 7. الرد بنجاح العملية
    res.status(200).json({
      success: true,
      message: "card has been deleted successfully"
    });

  } catch (error: any) {
    console.error("Stripe Detach Error:", error.message);
    res.status(500).json({
      success: false,
      message: `error while deleting card ${error.message || "Unknown error"}`
    });
    return;
  }
});

router.put("/", async (req: Request, res: Response): Promise<void> => {
  try {

    const userId = req.user?.id!;
    const { name, address, licenseNumber, phone } = req.body;



    const dataToUpdate = {
      name,
      address,
      licenseNumber,
      phone,
      // licenseExpiry: new Date(licenseExpiry) 
      // licenseExpiry
    };

    const updatedUser = await prisma.user.update({
      where: { id: userId }, // 3. استخدم الـ ID الآمن
      data: dataToUpdate,     // 4. استخدم البيانات النضيفة
    });


    res.status(200).json({
      success: true,
      message: "User updated successfully",
      user: updatedUser,
    });
  } catch (error: any) {
    res.status(500).json({
      code: error.code || null,
      message: `Error while updating the user: ${error.message || "Unknown error"}`
    });
    return;
  }
});

router.put("/notification-allowed", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id!;
    const { notificationAllowed } = req.body;

    if (typeof notificationAllowed !== "boolean") {
      res.status(400).json({
        success: false,
        message: "notificationAllowed must be a boolean value",
      });
      return;
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { notificationAllowed },
      include: { ParkingSessions: true, Vehicles: true },
    });

    res.status(200).json({
      success: true,
      message: `Notifications ${notificationAllowed ? "enabled" : "disabled"} successfully`,
      user: updatedUser,
    });
  } catch (error: any) {
    res.status(500).json({
      code: error.code || null,
      message: `Error while updating notification preference: ${error.message || "Unknown error"}`
    });
    return;
  }
});

// router.post('/save-card', async (req, res) => {
//   try {
//     const { paymentMethodId } = req.body; // paymentMethodId بييجي من الفرونت إند (Stripe.js)

//     await createStripeCustomerAndSaveToken(req.user?.id!, paymentMethodId);

//     res.status(200).json({ message: 'Card saved successfully!' });
//   } catch (error: any) {
//     res.status(500).json({ error: error.message });
//   }
// });

router.get('/setup-intent', async (req: Request, res: Response): Promise<void> => {
  try {
    const setupData = await createSetupIntent(req.user?.id!);

    res.status(200).json(setupData);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
    return;
  }
});


router.post('/register-push-token', async (req: Request, res: Response) => {
  const userId = req.user?.id;
  const { token } = req.body;

  if (!token || !userId) {
    return res.status(400).send({ message: "Token and User ID are required." });
  }

  try {
    // استخدام Prisma لتحديث التوكن في حقل المستخدم
    await prisma.user.update({
      where: { id: userId },
      data: { notificationToken: token },
    });

    res.status(200).send({ success: true, message: "Token updated successfully." });

  } catch (e) {
    console.error("Error saving token:", e);
    res.status(500).send({ success: false, message: "Failed to save token." });
    return;
  }
});

export default router;