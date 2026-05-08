import { Router, type Request, type Response } from "express";
import { prisma } from "../prsimaForRouters.js";
import { ReservationsStatus } from "../../generated/prisma/client.js";
import { stripe } from "../../services/stripe.js";
import { getSocketServer } from "../../db&init/socket.js";
import { CANCELED_RESERVATION_EMITTER_MESSAGE } from "../../constants/constants.js";

const router = Router();

/* ---------------- GET ALL RESERVATIONS ---------------- */
// Admin Only — returns upcoming CONFIRMED reservations
router.get("/", async (req: Request, res: Response) => {
  try {
    const reservations = await prisma.reservation.findMany({
      where: {
        status: ReservationsStatus.CONFIRMED,
        startTime: { gte: new Date() },
      },
      orderBy: { startTime: "asc" },
    });
    res.status(200).json({ success: true, data: reservations });
  } catch (error) {
    console.error("Error fetching reservations:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ---------------- UPDATE RESERVATION ---------------- */
// PUT /api/admin/reservations/:id
router.put("/:id", async (req: Request, res: Response): Promise<void> => {
  if (!req.params.id) {
    res.status(400).json({ error: "No reservation id provided." });
    return;
  }

  const reservationId = parseInt(req.params.id, 10);
  if (isNaN(reservationId)) {
    res.status(400).json({ error: "Invalid reservation ID." });
    return;
  }

  // Whitelist only fields admin is allowed to change
  const { status, slotId, startTime, endTime, paymentType, isStacked } = req.body;

  const updateData: Record<string, any> = {};
  if (status !== undefined) updateData.status = status;
  if (slotId !== undefined) updateData.slotId = slotId;
  if (startTime !== undefined) updateData.startTime = new Date(startTime);
  if (endTime !== undefined) updateData.endTime = new Date(endTime);
  if (paymentType !== undefined) updateData.paymentType = paymentType;
  if (isStacked !== undefined) updateData.isStacked = isStacked;

  if (Object.keys(updateData).length === 0) {
    res.status(400).json({
      error: "No valid fields provided. Admins can update: status, slotId, startTime, endTime, paymentType, isStacked.",
    });
    return;
  }

  try {
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
    });

    if (!reservation) {
      res.status(404).json({ error: "Reservation not found." });
      return;
    }

    // If admin is cancelling — also cancel Stripe PaymentIntent if exists
    if (
      updateData.status === ReservationsStatus.CANCELLED &&
      reservation.status !== ReservationsStatus.CANCELLED
    ) {
      if (reservation.paymentIntentId) {
        try {
          await stripe.paymentIntents.cancel(reservation.paymentIntentId);
          console.log(
            `Admin cancelled reservation ${reservationId}, PaymentIntent ${reservation.paymentIntentId} cancelled.`
          );
        } catch (stripeError: any) {
          console.error("Error cancelling Stripe intent:", stripeError.message);
        }
      }
    }

    const updatedReservation = await prisma.reservation.update({
      where: { id: reservationId },
      data: updateData,
    });

    // --- Notify user if reservation was cancelled ---
    if (updateData.status === ReservationsStatus.CANCELLED) {
      try {
        const io = getSocketServer();
        io.to(`user_${reservation.userId}`).emit(CANCELED_RESERVATION_EMITTER_MESSAGE, {
          title: "Reservation Cancelled",
          message: "Your reservation has been cancelled by the admin.",
          reservationId: reservation.id,
        });
      } catch (socketError: any) {
        console.error("Socket emit failed (cancel-reservation):", socketError.message);
      }
    }

    res.status(200).json({ success: true, data: updatedReservation });
  } catch (error: any) {
    console.error("Error updating reservation:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;