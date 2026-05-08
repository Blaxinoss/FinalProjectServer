import { Router, type Request, type Response } from "express";
import { SESSION_SLOT_NOT_OCCUPIED_BEFORE_TOLERANCETIME, SLOT_STATUS_CHANGED_MESSAGE } from "../../constants/constants.js";
import { getSocketServer } from "../../db&init/socket.js";
import { ParkingSessionStatus } from "../../generated/prisma/client.js";
import { ParkingSlot } from "../../mongo_Models/parkingSlot.js";
import { sessionLifecycleQueue } from "../../queues/queues.js";
import { SlotStatus } from "../../types/parkingEventTypes.js";
import { prisma } from "../prsimaForRouters.js";

const router = Router();

/* ---------------- GET ALL SLOTS (Live Status) ---------------- */
// Admin Only
router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const slots = await ParkingSlot.find({}).sort({ _id: 1 });
    res.status(200).json({ success: true, data: slots });
  } catch (error: any) {
    res.status(500).json({
      code: error.code || null,
      message: `Error while fetching the Slots: ${error.message || "Unknown error"}`,
    });
  }
});

/* ---------------- FORCE UPDATE SLOT STATUS ---------------- */
// PUT /api/admin/slots/:slotId/status-force
router.put("/:slotId/status-force", async (req: Request, res: Response) => {
  const { slotId } = req.params;
  const { newStatus } = req.body;

  if (!newStatus) {
    return res.status(400).json({ error: "newStatus is required." });
  }

  if (!slotId) {
    return res.status(400).json({ error: "Slot id is required to forcec an action" });

  }

  if (!Object.values(SlotStatus).includes(newStatus as SlotStatus)) {
    return res.status(400).json({
      error: `Invalid status. Must be one of: ${Object.values(SlotStatus).join(", ")}`,
    });
  }

  try {
    const currentSlot = await ParkingSlot.findById(slotId).lean();
    if (!currentSlot) {
      return res.status(404).json({ error: "Parking slot not found in MongoDB." });
    }

    const isOccupied = [SlotStatus.OCCUPIED, SlotStatus.ASSIGNED, SlotStatus.CONFLICT].includes(
      currentSlot.status
    );
    const isBeingCleared = [
      SlotStatus.AVAILABLE,
      SlotStatus.MAINTENANCE,
      SlotStatus.DISABLED,
    ].includes(newStatus as SlotStatus);

    if (isOccupied && isBeingCleared) {
      console.warn(
        `Admin is forcing slot ${slotId} from ${currentSlot.status} to ${newStatus}. Checking for active session...`
      );

      const activeSession = await prisma.parkingSession.findFirst({
        where: { slotId, status: ParkingSessionStatus.ACTIVE },
        select: { id: true, occupancyCheckJobId: true, exitCheckJobId: true },
      });

      if (activeSession) {
        console.log(`Found active session ${activeSession.id}. Cancelling it and its jobs.`);

        const cancelledSession = await prisma.parkingSession.update({
          where: { id: activeSession.id },
          data: {
            status: ParkingSessionStatus.CANCELLED,
            notes: `Admin forced slot status to ${newStatus}.`,
          },
          select: { userId: true },
        });

        const jobsToCancel = [activeSession.exitCheckJobId, activeSession.occupancyCheckJobId].filter(
          Boolean
        );
        for (const jobId of jobsToCancel) {
          const job = await sessionLifecycleQueue.getJob(jobId!);
          if (job) await job.remove();
        }

        // --- Notify user their session was cancelled ---
        try {
          const io = getSocketServer();
          io.to(`user_${cancelledSession.userId}`).emit(SESSION_SLOT_NOT_OCCUPIED_BEFORE_TOLERANCETIME, {
            type: "SESSION_CANCELLED",
            message: "Your parking session has been cancelled. The slot is under maintenance.",
          });
        } catch (socketError: any) {
          console.error("Socket emit failed (force-slot-status):", socketError.message);
        }
      }
    }

    const updateQuery: any = { $set: { status: newStatus } };
    if (isBeingCleared) {
      updateQuery.$set.current_vehicle = null;
      updateQuery.$set.conflict_details = null;
      updateQuery.$set.violating_vehicle = null;
    }

    await ParkingSlot.updateOne({ _id: slotId }, updateQuery);

    // --- Broadcast slot status change to all connected clients ---
    try {
      const io = getSocketServer();
      io.emit(SLOT_STATUS_CHANGED_MESSAGE, { slotId, newStatus });
    } catch (socketError: any) {
      console.error("Socket emit failed (slot-status-changed):", socketError.message);
    }

    res.status(200).json({
      message: `Slot ${slotId} status successfully updated to ${newStatus}.`,
    });
  } catch (error: any) {
    console.error(`Error updating slot status for ${slotId}:`, error);
    res.status(500).json({ error: "Internal server error" });
  }
});


/* ---------------- CREATE NEW SLOT ---------------- */
// Admin Only
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const { slotId: id, status, type } = req.body;

  // 1. Basic Validation
  if (!id) {
    res.status(400).json({ error: "Slot ID is required." });
    return;
  }

  try {
    // 2. Check for existence in MongoDB first (fast check)
    const existingMongo = await ParkingSlot.findById(id);
    if (existingMongo) {
      res.status(400).json({ error: `Slot with ID ${id} already exists in MongoDB.` });
      return;
    }

    // 3. Sync Creation in Prisma and MongoDB using a transaction
    await prisma.$transaction(async (tx) => {
      // Create in Prisma (Postgres)
      await tx.parkingSlot.create({
        data: {
          id: id,
          type: type
        },
      });

      // Create in MongoDB
      // We initialize with default stats and null vehicle/conflict data
      await ParkingSlot.create({
        _id: id,
        status: status || SlotStatus.AVAILABLE,
        current_vehicle: null,
        conflict_details: null,
        stats: {
          total_uses_today: 0,
          average_duration_minutes: 0,
        },
      });
    });



    res.status(201).json({
      success: true,
      message: `Slot ${id} created successfully in Prisma and MongoDB.`,
    });

  } catch (error: any) {
    // Handle Prisma unique constraint errors (P2002)
    if (error.code === 'P2002') {
      res.status(400).json({ error: "Slot ID already exists in PostgreSQL database." });
      return;
    }

    console.error("Error during Slot Creation:", error);
    res.status(500).json({
      error: "Failed to create slot across databases.",
      details: error.message,
    });
  }
});


/* ---------------- UPDATE SLOT CONFIGURATION ---------------- */
// PATCH /api/admin/slots/:slotId
router.patch("/:slotId", async (req: Request, res: Response): Promise<void> => {
  const { slotId } = req.params;
  const { id: newId, status, type } = req.body;

  try {
    // ✅ FIX 1: Fetch currentSlot BEFORE the transaction (it was used but never defined)
    const currentSlot = await ParkingSlot.findById(slotId);
    if (!currentSlot) {
      res.status(404).json({ success: false, message: "Slot not found in MongoDB" });
      return;
    }

    // ✅ FIX 2: Pre-validate new ID before starting the transaction
    if (newId && newId !== slotId) {
      const existing = await ParkingSlot.findById(newId);
      if (existing) {
        res.status(409).json({ success: false, message: "New ID already exists in MongoDB" });
        return;
      }
    }

    // ✅ MongoDB update (separate — these two DBs can't share a transaction)
    if (newId && newId !== slotId) {
      const rawDoc = currentSlot.toObject();

      const deleteRes = await ParkingSlot.deleteOne({ _id: slotId });
      if (deleteRes.deletedCount === 0) {
        // ⚠️ Prisma already committed — log this for manual reconciliation
        console.error(`INCONSISTENCY: Prisma updated to ${newId} but MongoDB delete of ${slotId} failed`);
        throw new Error("MongoDB document not found for deletion");
      }

      await ParkingSlot.create({ ...rawDoc, _id: newId, status, ...(type && { type }) });
    } else {
      await ParkingSlot.updateOne(
        { _id: slotId },
        { $set: { ...(status && { status }), ...(type && { type }) } }
      );
    }

    res.status(200).json({ success: true, message: "Updated successfully" });

  } catch (error: any) {
    console.error("Update Error:", error);
    res.status(400).json({
      success: false,
      message: "Failed to update",
      error: error.message,
    });
  }
});

/* ---------------- DELETE SLOT ---------------- */
// DELETE /api/admin/slots/:slotId
router.delete("/:slotId", async (req: Request, res: Response): Promise<void> => {
  const slotId = req.params.slotId;

  if (!slotId) {
    res.status(400).json({ success: false, message: "slotId is required" });
    return;
  }

  try {
    // 1. تأكد إن الـ slot موجود في MongoDB
    const existingSlot = await ParkingSlot.findById(slotId);
    if (!existingSlot) {
      res.status(404).json({ success: false, message: "Slot not found" });
      return;
    }

    // 2. تأكد مفيش session active على الـ slot ده
    const activeSession = await prisma.parkingSession.findFirst({
      where: { slotId, status: ParkingSessionStatus.ACTIVE },
    });

    if (activeSession) {
      res.status(409).json({
        success: false,
        message: "Cannot delete slot with an active session",
      });
      return;
    }

    // 3. احذف من الاتنين
    await prisma.$transaction(async (tx) => {
      await tx.parkingSlot.deleteMany({ where: { id: slotId } });
      await ParkingSlot.deleteOne({ _id: slotId });
    });

    // 4. Broadcast للـ clients
    try {
      const io = getSocketServer();
      io.emit(SLOT_STATUS_CHANGED_MESSAGE, { slotId, deleted: true });
    } catch (socketError: any) {
      console.error("Socket emit failed (slot-deleted):", socketError.message);
    }

    res.status(200).json({ success: true, message: `Slot ${slotId} deleted successfully` });

  } catch (error: any) {
    // Prisma foreign key constraint — في sessions مرتبطة بالـ slot
    if (error.code === "P2003") {
      res.status(409).json({
        success: false,
        message: "Cannot delete slot, it has related session records",
      });
      return;
    }

    console.error("Error deleting slot:", error);
    res.status(500).json({ success: false, message: "Failed to delete slot", error: error.message });
  }
});

export default router;