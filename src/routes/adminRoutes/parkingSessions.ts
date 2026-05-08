import { Router, type Request, type Response } from "express";
import { HANDLE_GATE_EXIT_EMIT, SESSION_SLOT_NOT_OCCUPIED_BEFORE_TOLERANCETIME } from "../../constants/constants.js";
import { getMQTTClient } from "../../db&init/mqtt.js";
import { getSocketServer } from "../../db&init/socket.js";
import { ParkingSessionStatus, TransactionStatus, paymentMethod } from "../../generated/prisma/client.js";
import { ParkingSlot } from "../../mongo_Models/parkingSlot.js";
import { sessionLifecycleQueue } from "../../queues/queues.js";
import { SlotStatus } from "../../types/parkingEventTypes.js";
import { prisma } from "../prsimaForRouters.js";

const router = Router();

/* ---------------- GET ALL Parking Sessions ---------------- */
// Admin Only
router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const parkingSessions = await prisma.parkingSession.findMany({
      include: { user: true, paymentTransaction: true, vehicle: true },
    });
    res.status(200).json({ success: true, data: parkingSessions });
  } catch (error: any) {
    res.status(500).json({
      code: error.code || null,
      message: `Error while fetching the Parking Sessions: ${error.message || "Unknown error"}`,
    });
  }
});

/* ---------------- FORCE CANCEL a Parking Session ---------------- */
// user didn't visit his slot / emergency left without going in
// camera didn't send slot available for some reason
// cancellation here means NO payment at all
router.post("/:sessionId/force-cancel", async (req: Request, res: Response) => {
  const { sessionId } = req.params;

  if (!sessionId) {
    return res.status(400).json({ error: "No session Id number were given" });
  }

  const sessionIdInt = parseInt(sessionId, 10);
  if (isNaN(sessionIdInt)) {
    return res.status(400).json({ error: "Invalid session ID format." });
  }

  try {
    const session = await prisma.parkingSession.findUnique({
      where: { id: sessionIdInt },
    });

    if (!session) {
      return res.status(404).json({ error: "Parking session not found." });
    }

    if (session.status !== ParkingSessionStatus.ACTIVE) {
      return res.status(400).json({
        error: `Session is already ${session.status}. No action needed.`,
      });
    }

    // --- 1. Cancel BullMQ jobs ---
    try {
      const jobsToCancel = [session.exitCheckJobId, session.occupancyCheckJobId].filter(Boolean);
      for (const jobId of jobsToCancel) {
        const job = await sessionLifecycleQueue.getJob(jobId!);
        if (job) await job.remove();
      }
      console.log(`Jobs for session ${session.id} removed.`);
    } catch (jobError: any) {
      console.error(
        `Error removing jobs for session ${session.id}, proceeding anyway:`,
        jobError.message
      );
    }

    // --- 2. Cancel session + create a zero-amount cancelled transaction ---
    await prisma.$transaction([
      prisma.parkingSession.update({
        where: { id: session.id },
        data: {
          status: ParkingSessionStatus.CANCELLED,
          exitTime: new Date(),
        },
      }),
      prisma.paymentTransaction.create({
        data: {
          userId: session.userId,
          parkingSessionId: session.id,
          amount: 0,
          paymentMethod: session.paymentType,
          transactionStatus: TransactionStatus.CANCELLED,
          paidAt: new Date(),
        },
      }),
    ]);

    console.log(`Session ${session.id} marked as CANCELLED. Zero cancelled payment created.`);

    // --- 3. Notify user via socket ---
    try {
      const io = getSocketServer();
      io.to(`user_${session.userId}`).emit(SESSION_SLOT_NOT_OCCUPIED_BEFORE_TOLERANCETIME, {
        type: "SESSION_CANCELLED",
        message: "Your parking session has been cancelled by the admin.",
      });
    } catch (socketError: any) {
      console.error("Socket emit failed (force-cancel):", socketError.message);
    }

    // --- 4. Free the slot in MongoDB ---
    if (session.slotId) {
      const vehicle = await prisma.vehicle.findUnique({
        where: { id: session.vehicleId },
        select: { plate: true },
      });

      await ParkingSlot.updateOne(
        {
          _id: session.slotId,
          "current_vehicle.plate_number": vehicle?.plate,
        },
        {
          $set: {
            status: SlotStatus.AVAILABLE,
            current_vehicle: null,
            conflict_details: null,
            violating_vehicle: null,
          },
        }
      );
      console.log(`Slot ${session.slotId} reset to AVAILABLE.`);
    }

    res.status(200).json({ message: `Session ${session.id} has been forcibly cancelled.` });
  } catch (error: any) {
    console.error(`Error during force-cancel for session ${sessionId}:`, error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ---------------- COMPLETE CASH PAYMENT ---------------- */
router.post("/:sessionId/complete-cash-payment", async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const mqttClient = getMQTTClient();

  if (!sessionId) {
    return res.status(400).json({ error: "No session Id number were given" });
  }

  const sessionIdInt = parseInt(sessionId, 10);
  if (isNaN(sessionIdInt)) {
    return res.status(400).json({ error: "Invalid session ID format." });
  }

  try {
    const parkingSession = await prisma.parkingSession.findUnique({
      where: { id: sessionIdInt },
      include: {
        paymentTransaction: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        vehicle: {
          select: { plate: true },
        },
      },
    });

    if (!parkingSession) {
      return res.status(404).json({ error: "Parking session not found." });
    }

    const transaction = parkingSession.paymentTransaction[0];

    if (!transaction || transaction.transactionStatus !== TransactionStatus.PENDING) {
      return res.status(400).json({ error: "No pending transaction found for this session." });
    }

    if (transaction.paymentMethod !== paymentMethod.CASH) {
      return res.status(400).json({ error: "This transaction is not marked for cash payment." });
    }

    await prisma.paymentTransaction.update({
      where: { id: transaction.id },
      data: {
        paidAt: new Date(),
        transactionStatus: TransactionStatus.COMPLETED,
      },
    });

    console.log(`CASH payment completed for session ${parkingSession.id} by admin.`);

    // --- Send MQTT command to open exit gate ---
    const topic = `garage/gate/event/response`;
    const payload = JSON.stringify({
      plateNumber: parkingSession.vehicle.plate,
      decision: "ALLOW_EXIT",
      reason: "MANUAL_CASH_PAYMENT",
    });
    mqttClient.publish(topic, payload);
    console.log(`MQTT command sent to open exit gate for ${parkingSession.vehicle.plate}`);

    // --- Notify user via socket ---
    try {
      const io = getSocketServer();
      io.to(`user_${parkingSession.userId}`).emit(HANDLE_GATE_EXIT_EMIT, {
        decision: "ALLOW_EXIT",
        reason: "MANUAL_CASH_PAYMENT",
        message: "Cash payment confirmed. Please proceed to the exit gate.",
      });
    } catch (socketError: any) {
      console.error("Socket emit failed (cash-payment):", socketError.message);
    }

    res.status(200).json({ message: "Cash payment confirmed. Gate opening command sent." });
  } catch (error: any) {
    console.error("Error completing cash payment:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;