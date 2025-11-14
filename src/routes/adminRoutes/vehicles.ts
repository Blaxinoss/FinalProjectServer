import { Router, type Request, type Response } from "express";
import { prisma } from "../routes.js";
import type { Vehicle } from "../../src/generated/prisma/index.js";
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

/* ---------------- GET VEHICLE BY ID ADMIN ---------------- */
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.params.id) {
      res.status(400).json({ message: "Vehicle Id is not provided" });
      return;
    }

    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ success: false, message: "Invalid vehicle ID" });
      return;
    }

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

/* ---------------- POST /api/admin/vehicles/:plate/clear-debt ---------------- */
router.post("/:plateNumber/clear-debt", async (req: Request, res: Response) => {
  const { plateNumber } = req.params;
  try {
    if (!plateNumber) {
      return res.status(404).json({ error: 'Plate number is missing.' });
    }
    const vehicleOwner = await prisma.vehicle.findUnique({
      where: { plate: plateNumber },
      select: {
        hasOutstandingDebt: true,
        user: {
          select: {
            id: true,
            hasOutstandingDebt: true,
          }
        }
      }
    });

    if (!vehicleOwner) {
      return res.status(404).json({ error: 'Vehicle data is not found.' });
    }

    if (!vehicleOwner.hasOutstandingDebt && !vehicleOwner.user.hasOutstandingDebt) {
      return res.status(200).json({ message: 'This user/vehicle already has no outstanding debt.' });
    }

    await prisma.$transaction([
      prisma.vehicle.update({
        where: { plate: plateNumber },
        data: { hasOutstandingDebt: false }
      }),
      prisma.user.update({
        where: { id: vehicleOwner.user.id },
        data: { hasOutstandingDebt: false }
      })
    ]);
    console.log(`Debt cleared for vehicle ${plateNumber} and user ${vehicleOwner.user.id}`);

    return res.status(200).json({ message: 'Debt cleared successfully for vehicle and user.' });

  } catch (error) {
    console.error("Error clearing debt:", error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;