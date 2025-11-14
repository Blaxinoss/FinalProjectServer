import { Router } from "express";
import { prisma } from '../routes.js';
import type { Request, Response } from "express";



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
        parkingSession:{
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

export default router;