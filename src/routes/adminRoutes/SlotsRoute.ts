// (داخل ملف routes/admin/slotRoutes.ts أو أي ملف مناسب)

import { Router } from 'express';
import type { Request, Response } from 'express';
import { ParkingSlot } from '../../mongo_Models/parkingSlot.js'; // ⬅️ استيراد موديل ParkingSlot

const router = Router();

/* ---------------- GET ALL SLOTS (Live Status) ---------------- */
// Admin Only
router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    // جلب كل الأماكن من MongoDB عشان نعرض حالتهم الحقيقية
    const slots = await ParkingSlot.find({})
      .sort({ _id: 1 }); // ⬅️ رتبهم بالـ ID (A-01, A-02, B-01...)

    res.status(200).json({ success: true, data: slots });
  } catch (error: any) {
    res.status(500).json({
      code: error.code || null,
      message: `Error while fetching the Slots: ${error.message || "Unknown error"}`,
    });
  }
});

export default router;