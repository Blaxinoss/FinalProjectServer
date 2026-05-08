import { Router, type Request, type Response } from "express";
import { prisma } from "../prsimaForRouters.js";
import type { Vehicle } from "../../generated/prisma/client.js";
import { getSocketServer } from "../../db&init/socket.js";
import { DEBT_CLEARED } from "../../constants/constants.js";

const router = Router();

/* ---------------- GET ALL VEHICLES ADMIN ---------------- */
router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const vehicles: Vehicle[] = await prisma.vehicle.findMany({
      include: { user: true, ParkingSessions: true },
    });
    res.status(200).json({ success: true, data: vehicles });
  } catch (error: any) {
    res.status(500).json({
      code: error.code || null,
      message: `Error while fetching the Vehicles: ${error.message || "Unknown error"}`,
    });
  }
});

/* ---------------- GET VEHICLES BY USER ID ---------------- */
router.get("/user/:userId", async (req: Request, res: Response): Promise<void> => {
  if (!req.params.userId) {
    res.status(400).json({ message: "User Id is not provided" });
    return;
  }

  const userId = parseInt(req.params.userId, 10);
  if (isNaN(userId)) {
    res.status(400).json({ success: false, message: "Invalid user ID" });
    return;
  }

  try {
    const vehicles = await prisma.vehicle.findMany({
      where: { userId },
      include: { ParkingSessions: true },
    });
    res.status(200).json({ success: true, data: vehicles });
  } catch (error: any) {
    res.status(500).json({
      code: error.code || null,
      message: `Error while fetching vehicles for user: ${error.message || "Unknown error"}`,
    });
  }
});

/* ---------------- GET VEHICLE BY ID ADMIN ---------------- */
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  if (!req.params.id) {
    res.status(400).json({ message: "Vehicle Id is not provided" });
    return;
  }

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ success: false, message: "Invalid vehicle ID" });
    return;
  }

  try {
    const vehicle = await prisma.vehicle.findUnique({
      where: { id },
      include: { user: true, ParkingSessions: true },
    });

    if (!vehicle) {
      res.status(404).json({ success: false, message: "Vehicle not found" });
      return;
    }

    res.status(200).json({ success: true, data: vehicle });
  } catch (error: any) {
    res.status(500).json({
      code: error.code || null,
      message: `Error while fetching this specific vehicle: ${error.message || "Unknown error"}`,
    });
  }
});

/* ---------------- CLEAR DEBT ---------------- */
// POST /api/admin/vehicles/:plateNumber/clear-debt
router.post("/:plateNumber/clear-debt", async (req: Request, res: Response) => {
  const { plateNumber } = req.params;

  if (!plateNumber) {
    return res.status(400).json({ error: "Plate number is missing." });
  }

  try {
    const vehicleOwner = await prisma.vehicle.findUnique({
      where: { plate: plateNumber },
      select: {
        hasOutstandingDebt: true,
        user: { select: { id: true, hasOutstandingDebt: true } },
      },
    });

    if (!vehicleOwner) {
      return res.status(404).json({ error: "Vehicle data is not found." });
    }

    if (!vehicleOwner.hasOutstandingDebt && !vehicleOwner.user.hasOutstandingDebt) {
      return res.status(200).json({ message: "This user/vehicle already has no outstanding debt." });
    }

    await prisma.$transaction([
      prisma.vehicle.update({
        where: { plate: plateNumber },
        data: { hasOutstandingDebt: false },
      }),
      prisma.user.update({
        where: { id: vehicleOwner.user.id },
        data: { hasOutstandingDebt: false },
      }),
    ]);

    console.log(`Debt cleared for vehicle ${plateNumber} and user ${vehicleOwner.user.id}`);

    // --- Notify user via socket ---
    try {
      const io = getSocketServer();
      io.to(`user_${vehicleOwner.user.id}`).emit(DEBT_CLEARED, {
        message: "Your outstanding debt has been cleared by the admin.",
      });
    } catch (socketError: any) {
      console.error("Socket emit failed (clear-debt):", socketError.message);
    }

    return res.status(200).json({ message: "Debt cleared successfully for vehicle and user." });
  } catch (error: any) {
    console.error("Error clearing debt:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;