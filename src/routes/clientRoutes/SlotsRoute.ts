import { Router } from "express";
import type { Request, Response } from 'express'
import { ParkingSlot } from "../../mongo_Models/parkingSlot.js";

const router = Router();


router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const slots = await ParkingSlot.find({})
      .sort({ _id: 1 });

    res.status(200).json({ success: true, data: slots });
  } catch (error: any) {
    res.status(500).json({
      code: error.code || null,
      message: `Error while fetching the Slots: ${error.message || "Unknown error"}`,
    });
  }
});


export default router;