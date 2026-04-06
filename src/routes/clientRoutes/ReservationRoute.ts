import { Router } from "express";
import type { Request, Response } from 'express'
import { prisma } from "../prsimaForRouters.js";

import { CANCELLABLE_PERIOD_MINUTES, GRACE_PERIOD, HOLDAMOUNT_WHILE_RESERVATIONS, MAX_RESERVATION_HOURS, NO_SHOW_PENALTY_AMOUNT, RESERVATION_CHECK_IF_IT_HAS_CONTINUE } from "../../constants/constants.js"
import { ParkingSessionStatus, paymentMethod, ReservationsStatus, TransactionStatus } from "../../generated/prisma/client.js";
import { stripe } from "../../services/stripe.js";
import { sessionLifecycleQueue } from "../../queues/queues.js";
import { SlotStatus } from "../../types/parkingEventTypes.js";
import { ParkingSlot } from "../../mongo_Models/parkingSlot.js";

//TODO
// import { authMiddleware } from "../middleware/auth"; // ستحتاج إلى middleware للتحقق من هوية المستخدم
//TODO
//  AUTH
//CHECK BUSINESS LOGIC


const router = Router();

// المسار: POST /reservations
// داخل ملف ReservationRoutes.ts

router.post("/", async (req: Request, res: Response) => {
  const userId = req.user?.id!;
  const { plateNumber, startTime, endTime, paymentTypeDecision, paymentMethodId, isImmediate } = req.body;
  let paymentIntentId: string | null = null;

  try {
    // 1. --- 🛡️ الأساسيات (Basic Validation) ---
    if (!plateNumber || !startTime || !endTime || !paymentTypeDecision || (!startTime && !isImmediate)) {
      return res.status(400).json({ error: "All fields are required." });
    }
    const start = isImmediate ? new Date() : new Date(startTime);
    const end = new Date(endTime);
    const now = new Date();
    now.setSeconds(now.getSeconds() - 30); // Buffer للـ Network Latency

    if (start >= end || (start < now && !isImmediate)) {
      return res.status(400).json({ error: "Invalid time range." });
    }

    // 2. --- 👤 صلاحية اليوزر والعربة ---
    const user = await prisma.user.findUnique({ where: { id: userId }, include: { Vehicles: true } });
    if (!user) return res.status(404).json({ error: "User not found." });

    const vehicle = user.Vehicles.find((v: any) => v.plate === plateNumber);
    if (!vehicle) return res.status(403).json({ error: "This vehicle does not belong to the user." });

    if (user.hasOutstandingDebt || vehicle.hasOutstandingDebt) {
      return res.status(403).json({ error: "You have an outstanding debt that must be paid first." });
    }
    const durationInHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    if (durationInHours > MAX_RESERVATION_HOURS) {
      return res.status(400).json({ error: `You cannot reserve a slot for more than ${MAX_RESERVATION_HOURS} hours.` });
    }
    // 3. --- 🚫 منع الحجز المزدوج (Double Booking Check) ---
    const existingActiveReservation = await prisma.reservation.findFirst({
      where: {
        userId: userId,
        status: ReservationsStatus.CONFIRMED,
        endTime: { gt: new Date() } // حجز لسه مخلصش
      }
    });

    if (existingActiveReservation) {
      return res.status(400).json({ error: "You already have an active reservation." });
    }

    // 4. --- 🧠 البحث الذكي عن مكان (Smart Search) ---
    // بنجيب الأماكن المشغولة سواء بحجز أو بجلسة ركن فعالية
    const busyFromReservations = (await prisma.reservation.findMany({
      where: {
        status: { not: 'CANCELLED' },
        startTime: { lt: end },
        endTime: { gt: start }
      },
      select: { slotId: true }
    })).map(r => r.slotId);

    const busyFromSessions = (await prisma.parkingSession.findMany({
      where: {
        status: ParkingSessionStatus.ACTIVE,
        expectedExitTime: { gt: start }
      },
      select: { slotId: true }
    })).map(s => s.slotId);

    const busySlotIds = [...new Set([...busyFromReservations, ...busyFromSessions])];

    // محاولة إيجاد مكان فاضي تماماً
    const trulyFreeSlot = await prisma.parkingSlot.findFirst({
      where: { id: { notIn: busySlotIds }, type: { not: 'EMERGENCY' } }
    });

    let chosenSlotId: string | null = null;
    let isStacked = false;

    if (trulyFreeSlot) {
      chosenSlotId = trulyFreeSlot.id;
    } else {
      // محاولة البحث عن مكان بنظام التكديس (Stacking)
      const stackable = await prisma.reservation.findFirst({
        where: {
          endTime: { lte: new Date(start.getTime() - GRACE_PERIOD * 60000) },
          status: { not: 'CANCELLED' },
        },
        orderBy: { endTime: 'desc' },
      });

      if (stackable && !busySlotIds.includes(stackable.slotId)) {
        chosenSlotId = stackable.slotId;
        isStacked = true;
      }
    }

    // 5. --- ⛔ التحقق النهائي من وجود مكان ---
    if (!chosenSlotId) {
      return res.status(409).json({ error: "No available slots for the selected time." });
    }



    // 6. --- 💳 عملية الدفع (Stripe Hold) ---
    // بنعملها هنا "بعد" ما اتأكدنا إن فيه مكان، عشان منسحبش فلوس ونقول لليوزر "مفيش مكان معلش"
    if (paymentTypeDecision === paymentMethod.CARD) {
      if (!paymentMethodId || !user.paymentGatewayToken) {
        return res.status(400).json({ error: "Card details missing or user not linked to Stripe." });
      }

      const paymentIntent = await stripe.paymentIntents.create({
        amount: HOLDAMOUNT_WHILE_RESERVATIONS,
        currency: 'egp',
        customer: user.paymentGatewayToken,
        payment_method: paymentMethodId,
        capture_method: 'manual',
        confirm: true,
        off_session: true,
      });

      if (!paymentIntent) throw new Error("Stripe transaction failed.");
      paymentIntentId = paymentIntent.id;
    }

    // 7. --- 💾 إنشاء الحجز في الداتابيز ---
    const reservation = await prisma.reservation.create({
      data: {
        userId: userId,
        vehicleId: vehicle.id,
        slotId: chosenSlotId,
        startTime: start,
        endTime: end,
        paymentIntentId: paymentIntentId,
        paymentType: paymentTypeDecision,
        status: ReservationsStatus.CONFIRMED,
        isStacked: isStacked
      },
    });



    if (isImmediate) {
      await ParkingSlot.updateOne({
        _id: chosenSlotId
      }, {
        $set: {
          status: SlotStatus.RESERVED,
          "current_vehicle.reservation_id": reservation.id
        }
      })
      console.log(`🗺️ Slot ${chosenSlotId} marked as RESERVED for immediate booking.`);
    }


    await sessionLifecycleQueue.add("check-reservation-not-moving", {
      reservationId: reservation.id
    }, { delay: Math.max(new Date(reservation.startTime).getTime() - Date.now() + (RESERVATION_CHECK_IF_IT_HAS_CONTINUE * 60 * 1000), 0), jobId: `no_show_check_${reservation.id}` })

    return res.status(201).json(reservation);

  } catch (error: any) {
    console.error("Critical Error:", error);
    // لو حصل مشكلة بعد ما عملنا الـ Hold للفلوس، يفضل تعمل لها Cancel هنا
    res.status(500).json({
      error: `Internal server error: ${error.raw?.message || error.message || "Unknown error"}`
    });
  }
});

// --- 2. Get Current User's Reservations ---
// المسار: GET /reservations/me
router.get("/", async (req: Request, res: Response) => {
  // TODO: يجب إضافة middleware للتحقق من أن المستخدم مسجل دخوله
  // const userId = req.user.id;

  try {
    const userId = req.user?.id!
    const userReservations = await prisma.reservation.findMany({
      where: {
        userId,
        status: ReservationsStatus.CONFIRMED,
        endTime: {
          gt: new Date(),
        },

      },
      include: { vehicle: true },
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


router.get("/active", async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id!;

    // استخدمنا findFirst بدل findMany
    const activeReservation = await prisma.reservation.findFirst({
      where: {
        userId,
        status: ReservationsStatus.CONFIRMED,
        endTime: {
          gt: new Date(), // حجز لسه مخلصش
        },
      },
      include: { vehicle: true },
      orderBy: {
        startTime: "asc", // هات أقرب حجز قادم
      },
    });

    // هيرجع Object الحجز مباشرة، أو null لو معندوش حجز حالي
    res.status(200).json(activeReservation);
  } catch (error) {
    console.error("Error fetching active reservation:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});


// المسار: POST /reservations/:id/cancel
router.post("/:id/cancel", async (req: Request, res: Response) => {
  if (!req.params.id) {
    return res.status(400).json({ message: "reservation Id is not provided" });
  }

  const userId = req.user?.id!;
  const reservationId = parseInt(req.params.id);

  const { forceCancel } = req.body;

  try {
    // 1. --- 🛡️ التأكد من وجود الحجز وصلاحياته ---
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId, userId },
    });

    if (!reservation) {
      return res.status(404).json({ error: "Reservation not found." });
    }
    if (reservation.status !== "CONFIRMED") {
      return res.status(400).json({ error: "Only CONFIRMED reservations can be cancelled." });
    }

    const now = new Date();
    const cancellableDeadLine = new Date(reservation.startTime.getTime() - CANCELLABLE_PERIOD_MINUTES * 60000);
    const isPastDeadline = now > cancellableDeadLine;

    if (isPastDeadline && !forceCancel) {
      return res.status(400).json({
        error: `Reservations can only be cancelled for free up to ${CANCELLABLE_PERIOD_MINUTES} minutes before the start time.`,
        requiresForceCancel: true
      });
    }

    if (reservation.paymentType === paymentMethod.CARD && reservation.paymentIntentId) {
      try {
        if (isPastDeadline && forceCancel) {
          // الحالة الأولى: إلغاء إجباري (Force Cancel) -> سحب الغرامة
          await stripe.paymentIntents.capture(reservation.paymentIntentId, {
            amount_to_capture: NO_SHOW_PENALTY_AMOUNT * 100,
          });
          console.log(`Penalty captured for forced cancellation of reservation: ${reservation.id}`);

          // تسجيل العملية المادية
          await prisma.paymentTransaction.create({
            data: {
              userId: reservation.userId,
              reservationId: reservation.id,
              amount: NO_SHOW_PENALTY_AMOUNT,
              transactionStatus: TransactionStatus.UNPAID_EXIT,
              paymentMethod: reservation.paymentType,
              stripeTransactionId: reservation.paymentIntentId,
            }
          });
        } else {
          await stripe.paymentIntents.cancel(reservation.paymentIntentId);
          console.log(`Successfully cancelled payment intent: ${reservation.paymentIntentId}`);
        }
      } catch (stripeError: any) {
        console.error("Stripe error during cancellation:", stripeError.message);
        return res.status(500).json({ error: "Failed to process payment cancellation." });
      }
    }

    // 4. --- 💾 تحديث حالة الحجز في الداتابيز ---
    const cancelledReservation = await prisma.reservation.update({
      where: { id: reservationId },
      data: { status: ReservationsStatus.CANCELLED },
    });

    await ParkingSlot.updateOne(
      { _id: reservation.slotId },
      {
        $set: {
          status: SlotStatus.AVAILABLE,
          "current_vehicle.plate_number": null,
          "current_vehicle.reservation_id": null,
          "current_vehicle.occupied_since": null
        }
      }
    );

    console.log(`♻️ Slot ${reservation.slotId} is now AVAILABLE after cancellation.`);

    // 5. --- 🧹 مسح الجوب بتاعت الـ No-Show من الـ Queue ---
    try {
      const jobId = `no_show_check_${reservation.id}`;
      const noShowJob = await sessionLifecycleQueue.getJob(jobId);
      if (noShowJob) {
        await noShowJob.remove();
        console.log(`Successfully removed No-Show job: ${jobId}`);
      }
    } catch (queueError) {
      console.error(`Error removing No-Show job for reservation ${reservation.id}:`, queueError);
    }

    res.status(200).json({
      message: isPastDeadline ? "Reservation cancelled with penalty." : "Reservation cancelled successfully.",
      reservation: cancelledReservation
    });

  } catch (error) {
    console.error("Error cancelling reservation:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});


export default router;