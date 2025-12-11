import { Router } from "express";
import type { Request, Response } from "express";
import { createStripeCustomerAndSaveToken } from '../../services/stripeUserAdding.js';

import { prisma } from "../prsimaForRouters.js";

 //TODO
   //  AUTH
  //CHECK BUSINESS LOGIC

  
const router = Router();


//
router.get("/", async (req: Request, res: Response) => {
  try {
     const userId = req.user?.id!;
    const user = await prisma.user.findUnique({
      where: { id:userId },
      include: { ParkingSessions: true ,Vehicles:true},
    });

    res.status(200).json({user});
  } catch (error: any) {
    res.status(500).json({
      code: error.code || null,
message: `Error while fetcching the user cars: ${error.message || "Unknown error"}`
    });
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
  }
});


router.put("/", async (req: Request, res: Response): Promise<void> => {
  try {
   
    const userId = req.user?.id!;
const { name, address, licenseNumber, licenseExpiry } = req.body;


   const dataToUpdate = {
        name,
        address,
        licenseNumber,
        licenseExpiry: new Date(licenseExpiry) // (لازم نتأكد إنها تاريخ سليم)
    };

    const updatedUser = await prisma.user.update({
      where: { id: userId }, // 3. استخدم الـ ID الآمن
      data: dataToUpdate,     // 4. استخدم البيانات النضيفة
    });


    res.status(200).json({
      message: "User updated successfully",
      user: updatedUser,
    });
  } catch (error: any) {
    res.status(500).json({
      code: error.code || null,
message: `Error while updating the user: ${error.message || "Unknown error"}`
    });
  }
});

router.post('/save-card', async (req, res) => {
    try{
    const { paymentMethodId } = req.body; // paymentMethodId بييجي من الفرونت إند (Stripe.js)

 await createStripeCustomerAndSaveToken(req.user?.id!, paymentMethodId);

        res.status(200).json({ message: 'Card saved successfully!' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});


export default router;