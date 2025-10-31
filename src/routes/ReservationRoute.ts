import { Router } from "express";
import type { Request, Response} from 'express'
import { prisma } from "../routes/routes.js"; // تأكد من أن المسار صحيح
import { ParkingSlot } from "../mongo_Models/parkingSlot.js";
import { SlotStatus } from "../types/parkingEventTypes.js";
import {CANCELLABLE_PERIOD_MINUTES, GRACE_PERIOD, HOLDAMOUNT_WHILE_RESERVATIONS} from "../constants/constants.js"
import { ParkingSessionStatus, paymentMethod, ReservationsStatus } from "../src/generated/prisma/index.js";
import { stripe } from "../services/stripe.js";

//TODO
// import { authMiddleware } from "../middleware/auth"; // ستحتاج إلى middleware للتحقق من هوية المستخدم
 //TODO
   //  AUTH
  //CHECK BUSINESS LOGIC


const router = Router();

// المسار: POST /reservations
// داخل ملف ReservationRoutes.ts


router.post("/", async (req: Request, res: Response) => {
  // افترض أن لديك middleware يضيف المستخدم للـ request
  // const userId = req.user.id;
  const userId = 1; // مثال مؤقت
  const { plateNumber, startTime, endTime,paymentTypeDecision} = req.body;

  let paymentIntentId: string | null = null;
  
  try {
    // --- 🛡️ قسم التحقق من الصحة (Validation) ---
    if (!plateNumber || !startTime || !endTime || !paymentTypeDecision) {
      return res.status(400).json({ error: "All fields are required." });
    }
    const user = await prisma.user.findUnique({ where: { id: userId }, include: { Vehicles: true } });
    const vehicle = user?.Vehicles.find(v => v.plate === plateNumber);
    if (!vehicle) {
      return res.status(403).json({ error: "This vehicle does not belong to the user." });
    }

    if(!user){
            return res.status(403).json({ error: "This user does not exist." });

    }
    const start = new Date(startTime);
    const end = new Date(endTime);
    if (start >= end || start < new Date()) {
      return res.status(400).json({ error: "Invalid time range." });
    }

    if(paymentTypeDecision !== paymentMethod.CASH && !user?.paymentGatewayToken){
      return res.status(400).json({error : "couldn't find the payment token, have you added a payment method ?"})
    }

    if(paymentTypeDecision === paymentMethod.CARD){
    const paymentIntent = await stripe.paymentIntents.create({
      amount: HOLDAMOUNT_WHILE_RESERVATIONS,
      currency:'egp',
      customer:user?.paymentGatewayToken!,
      capture_method:'manual',
      confirm:true,
      off_session:true,
    })


    if(!paymentIntent){
      throw(`couldn't do the transaction to hold ${HOLDAMOUNT_WHILE_RESERVATIONS}`)
    }else{
      console.log("HOlding money went successfull, continung reservation")
      paymentIntentId = paymentIntent.id;
    }
}

    // --- 🧠 قسم البحث الذكي (فقط في Prisma) ---

    // ✅ الخطوة 1: جلب كل المواقف المشغولة بالحجوزات في الفترة المطلوبة
    const conflictingReservations = await prisma.reservation.findMany({
      where: {
        status: { not: 'CANCELLED' }, // تجاهل الحجوزات الملغاة
        // الشرط الأساسي لتداخل الفترات الزمنية
        startTime: { lt: end }, 
        endTime: { gt: start }
      },
      select: { slotId: true }
    });
    const busyFromReservations = conflictingReservations.map(r => r.slotId);

    const conflictingSessions = await prisma.parkingSession.findMany({
        where: {
            status: ParkingSessionStatus.ACTIVE, // الجلسات النشطة فقط
            // شوف الجلسات اللي "متوقع" تخلص بعد ما حجزنا "يبدأ"
            expectedExitTime: { gt: start }
        },
        select: { slotId: true }
    });
    const busyFromSessions = conflictingSessions.map(s => s.slotId);
    // --- ⬆️ نهاية الإضافة ⬆️ ---


    // ✅ الخطوة 1ج: دمج القائمتين (عشان نجيب كل المشغول)
    const busySlotIds = [...new Set([...busyFromReservations, ...busyFromSessions])];
    console.log("Total busy slots (Reservations + Sessions):", busySlotIds);

    // ✅ الخطوة 2: ابحث عن موقف "فارغ حقًا" (Truly Free)
    // هو أي موقف لا يظهر في قائمة المواقف المشغولة
    // ملاحظة: ParkingSlot هنا يجب أن يكون من Prisma وليس MongoDB
    const trulyFreeSlot = await prisma.parkingSlot.findFirst({
      where: {
        id: { notIn: busySlotIds },
        type: {not:'EMERGENCY'}
      }
    });

    let chosenSlotId: string | null = null;
    let isStacked = false;

    if (trulyFreeSlot) {
      console.log(`✅ Truly free slot found: ${trulyFreeSlot.id}`);
      chosenSlotId = trulyFreeSlot.id;
      isStacked = false;
    } else {
      // ⚠️ الخطوة 3: إذا لم نجد، ابحث عن موقف "يمكن تكديسه" (Stackable)
      console.log("No truly free slots. Searching for a stackable slot...");
      const stackableReservation = await prisma.reservation.findFirst({
        where: {
          // ابحث عن حجز ينتهي قبل بدء حجزنا الجديد (مع فترة أمان)
          endTime: { 
            lte: new Date(start.getTime() - GRACE_PERIOD * 60000)
          },
          status: { not: 'CANCELLED' },
        },
        orderBy: { endTime: 'desc' }, // اختر الحجز الذي ينتهي الأقرب لوقتنا
        select: { slotId: true }
      });

      if (stackableReservation && !busySlotIds.includes(stackableReservation.slotId)) {
        console.log(`⚠️ Found a stackable slot: ${stackableReservation.slotId}`);
        chosenSlotId = stackableReservation.slotId;
        isStacked = true;
      }
    }

    // --- 💾 قسم إنشاء الحجز (Creation) ---
    if (chosenSlotId) {
      const reservation = await prisma.reservation.create({
        data: {
          userId: userId,
          vehicleId: vehicle.id, // استخدم الـ ID الصحيح للمركبة
          slotId: chosenSlotId,
          startTime: start,
          endTime:end,
          paymentIntentId: paymentIntentId,
          paymentType: paymentTypeDecision,
          status: ReservationsStatus.CONFIRMED,
          isStacked: isStacked // إضافة الـ flag
        },
      });
      return res.status(201).json(reservation);
    } else {
      // ⛔ الخطوة 4: لم نجد أي حل
      return res.status(409).json({ error: "No available slots for the selected time." });
    }

  } catch (error) {
    console.error("Error creating reservation:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- 2. Get Current User's Reservations ---
// المسار: GET /reservations/me
router.get("/me", async (req: Request, res: Response) => {
  // TODO: يجب إضافة middleware للتحقق من أن المستخدم مسجل دخوله
  // const userId = req.user.id;

  try {
    const userReservations = await prisma.reservation.findMany({
      where: {
        // userId: userId,
        userId: 1, // مثال مؤقت
        status: "CONFIRMED", // اعرض فقط الحجوزات المؤكدة والقادمة
        startTime: {
          gte: new Date(), // gte = greater than or equal to
        },
      },
      orderBy: {
        startTime: "asc", // رتبهم حسب الأقرب موعداً
      },
    });

    res.status(200).json(userReservations);
  } catch (error) {
    console.error("Error fetching user reservations:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- 3. Cancel a Reservation ---
// المسار: POST /reservations/:id/cancel
router.post("/:id/cancel", async (req: Request, res: Response) => {
  // TODO: يجب إضافة middleware للتحقق من أن المستخدم مسجل دخوله

    if (!req.params.id) {
      res.status(400).json({ message: "User Id is not provided" });
      return;
    }

  const reservationId = parseInt(req.params.id);
  // const userId = req.user.id;

  try {
    // 1. تأكد أن الحجز موجود أصلاً
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
    });

    if (!reservation) {
      return res.status(404).json({ error: "Reservation not found." });
    }

    //UNCOMMENT AFTER AUTH IMPLEMENTATION
    // if(reservation.userId !== userId ){
    //   return res.status(403).json({ error: "You are not authorized to cancel this reservation." });
    // }

    if(reservation.status !== "CONFIRMED"){
      return res.status(400).json({ error: "Only CONFIRMED reservations can be cancelled." });
    }

  if(reservation.paymentType === paymentMethod.CARD){
    if (reservation.paymentIntentId) {
      try {
        await stripe.paymentIntents.cancel(reservation.paymentIntentId);
        console.log(`Successfully cancelled payment intent: ${reservation.paymentIntentId}`);
      } catch (stripeError: any) {
        // لو فشل الإلغاء (ممكن يكون اتسحب قبل كده أو مشكلة في Stripe)
        console.error("Error cancelling payment intent:", stripeError.message);
        // ممكن تقرر توقف العملية أو تكمل (الأفضل نكمل طالما هنلغي الحجز)
        // return res.status(500).json({ error: "Failed to release payment hold." });
      }
    }
}
    const now = new Date();
    const cancellableDeadLine= new Date(reservation.startTime.getTime() - CANCELLABLE_PERIOD_MINUTES * 60000);

    if(now > cancellableDeadLine){
      console.log("can't cancel now you passed the cancellable period");
      return res.status(400).json({ error: `Reservations can only be cancelled up to ${CANCELLABLE_PERIOD_MINUTES} minutes before the start time.` });
      //ممكن تضيف منطق لإلغاء الحجز مع غرامة مالية
      //TODO after payment system implementation
    }else{

  const cancelledReservation = await prisma.reservation.update({
      where: {
        id: reservationId,
      },
      data: {
        status: "CANCELLED",
      },
    });
        res.status(200).json(cancelledReservation);

    }
  
  } catch (error) {
    console.error("Error cancelling reservation:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- 4. Update a Reservation (للمدير فقط) ---
// المسار: PUT /reservations/:id
// if user want to change start or end time he must cancel and create a new reservation
// this route is only used internally by admin to change slotId in emergency cases
router.put("/:id", async (req: Request, res: Response) => {
  // TODO: يجب إضافة middleware للتحقق من أن المستخدم هو مدير (Admin)

    if (!req.params.id) {
      res.status(400).json({ message: "Reservation Id is not provided" });
      return;
    }
  const reservationId = parseInt(req.params.id);
  const { status,slotId } = req.body;

  try {
    const updatedReservation = await prisma.reservation.update({
      where: { id: reservationId },
      data: {

        status,
        slotId
        
      },
    });

    res.status(200).json(updatedReservation);
  } catch (error) {
    console.error("Error updating reservation:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- 5. Get All Reservations (للمدير فقط) ---
// المسار: GET /reservations
router.get("/", async (req: Request, res: Response) => {
  // TODO: يجب إضافة middleware للتحقق من أن المستخدم هو مدير (Admin)

  try {
    const allReservations = await prisma.reservation.findMany({
      orderBy: {
        createdAt: "desc",
      },
    });
    res.status(200).json(allReservations);
  } catch (error) {
    console.error("Error fetching all reservations:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;