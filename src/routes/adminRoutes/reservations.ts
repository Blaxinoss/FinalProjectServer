import { Router, type Request, type Response } from "express";
import { prisma } from "../prsimaForRouters.js";
import { ReservationsStatus } from "../../generated/prisma/index.js";
import { stripe } from "../../services/stripe.js";

const router = Router();

// --- 2. Get Admin All Reservations ---
router.get("/reservations", async (req: Request, res: Response) => {
  try {
    const userReservations = await prisma.reservation.findMany({
      where: {
        status: ReservationsStatus.CONFIRMED,
        startTime: {
          gte: new Date(),
        },
      },
      orderBy: {
        startTime: "asc",
      },
    });

    res.status(200).json(userReservations);
  } catch (error) {
    console.error("Error fetching user reservations:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- 4. Update a Reservation (للمدير فقط) ---
router.put("/reservations/:id", async (req: Request, res: Response) => {
  if (!req.params.id) {
    return res.status(400).json({ error: "No reservation id provided." });
  }

  const reservationId = parseInt(req.params.id);
  const { newStatus } = req.body;

  if (!newStatus) {
    return res.status(400).json({ error: "No newStatus provided." });
  }

  try {
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId }
    });

    if (!reservation) {
      return res.status(404).json({ error: "Reservation not found." });
    }

    if (newStatus === ReservationsStatus.CANCELLED) {
      if (reservation.paymentIntentId) {
        try {
          await stripe.paymentIntents.cancel(reservation.paymentIntentId);
          console.log(`Admin cancelled reservation ${reservationId}, PaymentIntent ${reservation.paymentIntentId} cancelled.`);
        } catch (stripeError: any) {
          console.error(`Error cancelling Stripe intent while admin cancelled reservation:`, stripeError.message);
        }
      }
    }

    const updatedReservation = await prisma.reservation.update({
      where: { id: reservationId },
      data: {
        status: newStatus 
      },
    });

    res.status(200).json(updatedReservation);

  } catch (error: any) {
    console.error("Error updating reservation status:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;