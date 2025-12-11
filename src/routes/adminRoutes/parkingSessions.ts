import { Router, type Request, type Response } from "express";

import { prisma } from "../prsimaForRouters.js";
import { ParkingSessionStatus,TransactionStatus } from "../../generated/prisma/index.js";

const router = Router();

/* ---------------- GET ALL Parking Sessions ---------------- */
// Admin Only
router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const parkingSessions: any[] = await prisma.parkingSession.findMany({
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
router.post("/:sessionId/force-cancel", async (req: Request, res: Response) => {
  const { sessionId } = req.params;

  if (!sessionId) {
    return res.status(400).json({ error: 'No session Id number were given' });
  }
  const sessionIdInt = parseInt(sessionId, 10);

  if (isNaN(sessionIdInt)) {
    return res.status(400).json({ error: 'Invalid session ID format.' });
  }

  try {
    const session = await prisma.parkingSession.findUnique({
      where: { id: sessionIdInt }
    });

    if (!session) {
      return res.status(404).json({ error: 'Parking session not found.' });
    }

    if (session.status !== ParkingSessionStatus.ACTIVE) {
      return res.status(400).json({ error: `Session is already ${session.status}. No action needed.` });
    }

    await prisma.parkingSession.update({
      where: { id: session.id },
      data: {
        status: ParkingSessionStatus.CANCELLED,
        exitTime: new Date(),
      }
    });

    res.status(200).json({ message: `Session ${session.id} has been forcibly cancelled.` });
  } catch (error: any) {
    console.error(`Error during force-cancel for session ${sessionId}:`, error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/* ---------------- COMPLETE CASH PAYMENT ---------------- */
router.post("/:sessionId/complete-cash-payment", async (req: Request, res: Response) => {
  const { sessionId } = req.params;

  if (!sessionId) {
    return res.status(400).json({ error: 'No session Id number were given' });
  }
  const sessionIdInt = parseInt(sessionId, 10);

  if (isNaN(sessionIdInt)) {
    return res.status(400).json({ error: 'Invalid session ID format.' });
  }

  try {
    const parkingSession = await prisma.parkingSession.findUnique({
      where: { id: sessionIdInt },
      include: {
        paymentTransaction: {
          orderBy: { createdAt: 'desc' },
          take: 1
        },
        vehicle: {
          select: { plate: true }
        }
      }
    });

    if (!parkingSession) {
      return res.status(404).json({ error: 'Parking session not found.' });
    }

    const transaction = parkingSession.paymentTransaction[0];

    if (!transaction || transaction.transactionStatus !== TransactionStatus.PENDING) {
      return res.status(400).json({ error: 'No pending transaction found for this session.' });
    }

    await prisma.paymentTransaction.update({
      where: { id: transaction.id },
      data: {
        paidAt: new Date(),
        transactionStatus: "COMPLETED",
      }
    });

    res.status(200).json({ message: 'Cash payment confirmed.' });

  } catch (error: any) {
    console.error("Error completing cash payment:", error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;