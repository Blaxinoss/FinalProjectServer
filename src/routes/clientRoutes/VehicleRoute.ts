import { Router } from "express";
import { prisma } from "../routes.js";
import type { Request, Response } from "express";
import type { Vehicle } from "../../src/generated/prisma/index.js";
const router = Router();



  
  /* ---------------- GET ALL MY VEHICLES ---------------- */
  router.get("/", async (req: Request, res: Response): Promise<void> => {
    try {
      const vehicles: Vehicle[] = await prisma.vehicle.findMany({
              where : {userId:req.user?.id!},  
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



/* ---------------- CREATE VEHICLE ---------------- */
router.post("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const { plate, color } = req.body;

    const userId = req.user?.id!;

    if (!plate || !color || !userId) {
      res
        .status(400)
        .json({
          success: false,
          message: "Missing required fields for creating a vehicle",
        });
    }

    const newVehicle = await prisma.vehicle.create({
      data: { plate,color,userId },
    });

    res.status(201).json({ success: true, data: newVehicle });
  } catch (error: any) {
    res.status(500).json({
      code: error.code || null,
      message: `Error while creating the vehicle: ${error.message || "Unknown error"}`,
    });
  }
});




/* ---------------- UPDATE VEHICLE ---------------- */
router.put("/:id", async (req: Request, res: Response): Promise<void> => {
  try {

     if (!req.params.id) {
      res.status(400).json({ message: "User Id is not provided" });
      return;
    }


    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ success: false, message: "Invalid vehicle ID" });
return;
    }

    const data = req.body;
    if (!data || Object.keys(data).length === 0) {
       res.status(400).json({ success: false, message: "No data provided to update" });
      return;
      }

    const updatedVehicle = await prisma.vehicle.update({
      where: { id,userId:req.user?.id! },
      data,
    });

    res.status(200).json({ success: true, data: updatedVehicle });
  } catch (error: any) {
    res.status(500).json({
      code: error.code || null,
      message: `Error while updating the vehicle: ${error.message || "Unknown error"}`,
    });
  }
});





/* ---------------- DELETE VEHICLE ---------------- */
router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.params.id) {
      res.status(400).json({ message: "User Id is not provided" });
      return;
    }


    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ success: false, message: "Invalid vehicle ID" });
      return;
    }

    const deletedVehicle = await prisma.vehicle.delete({ where: { id,userId:req.user?.id! } });

    res.status(200).json({ success: true, data: deletedVehicle });
  } catch (error: any) {
    res.status(500).json({
      code: error.code || null,
      message: `Error while deleting the vehicle: ${error.message || "Unknown error"}`,
    });
  }

});


export default router;