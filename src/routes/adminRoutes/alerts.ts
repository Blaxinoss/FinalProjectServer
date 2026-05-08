import { Router, type Request, type Response } from "express";
import { Alert } from "../../mongo_Models/alert.js";
import { AlertStatus } from "../../types/parkingEventTypes.js";

const router = Router();

/* ---------------- GET ALL ALERTS ---------------- */
// Admin Only
router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const alerts = await Alert.find({})
      .sort({ timestamp: -1 }) // newest first
      .limit(100);

    res.status(200).json({ success: true, data: alerts });
  } catch (error: any) {
    res.status(500).json({
      code: error.code || null,
      message: `Error while fetching the Alerts: ${error.message || "Unknown error"}`,
    });
  }
});

router.patch("/:id/resolve", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id;

    const alert = await Alert.findOneAndUpdate(
      { _id: id },
      {
        $set: { status: AlertStatus.RESOLVED },
      },
      {
        new: true,
      }
    );

    if (!alert) {
      res.status(404).json({
        success: false,
        message: "Alert not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: alert,
    });
  } catch (error: any) {
    res.status(500).json({
      code: error.code || null,
      message: `Error while resolving the Alert: ${error.message || "Unknown error"}`,
    });
  }
});


export default router;