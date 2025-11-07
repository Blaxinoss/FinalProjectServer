// (داخل ملف routes/admin/alertRoutes.ts أو أي ملف مناسب)

import { Router } from 'express';
import type { Request, Response } from 'express';
import { Alert } from '../../mongo_Models/alert.js'; // ⬅️ استيراد موديل Alert

const router = Router();

/* ---------------- GET ALL ALERTS ---------------- */
// Admin Only
router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    // جلب كل التنبيهات، ورتبهم من الأحدث للأقدم
    const alerts = await Alert.find({})
      .sort({ timestamp: -1 }) // ⬅️ الأحدث أولاً
      .limit(100); // ⬅️ (اختياري: تحديد حد أقصى عشان متجيبش مليون تنبيه)

    res.status(200).json({ success: true, data: alerts });
  } catch (error: any) {
    res.status(500).json({
      code: error.code || null,
      message: `Error while fetching the Alerts: ${error.message || "Unknown error"}`,
    });
  }
});

export default router;