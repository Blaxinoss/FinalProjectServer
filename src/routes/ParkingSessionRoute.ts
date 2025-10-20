import { Router } from "express";

import type { Request,Response } from "express";
import { prisma } from "./routes.js";
const router = Router();


//TODO AUTH     //TRIGER CALCULATING AND PAYMENT WORKRER on deletion

/* ---------------- GET ALL Parking Sessions ---------------- */
//Admin Only
router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const parkingSessions: any[] = await prisma.parkingSession.findMany({
      include: { user:true,paymentTransaction:true,vehicle:true }, 
    });
    res.status(200).json({ success: true, data: parkingSessions });
  } catch (error: any) {
    res.status(500).json({
      code: error.code || null,
      message: `Error while fetching the Parking Sessions: ${error.message || "Unknown error"}`,
    });
  }
});


/* ---------------- GET ALL Parking Sessions For one user---------------- */

router.get("/mine", async (req: Request, res: Response): Promise<void> => {
  //find it with the req.user.id
    let id;
  try {

     if (!req.params.id) {
      res.status(400).json({ success: false, message: "user ID is not provided" });
      return;
    }
         id = parseInt(req.params.id, 10);


    if (isNaN(id)) {
      res.status(400).json({ success: false, message: "Invalid user ID" });
      return;
    }

    const userParkingSessions: any[] = await prisma.parkingSession.findMany({
      where: {userId : id},
      include : {user:true} 
    });
    res.status(200).json({ success: true, data: userParkingSessions });
  } catch (error: any) {
    res.status(500).json({
      code: error.code || null,
      message: `Error while fetching the Parking Sessions for user with id ${id}: ${error.message || "Unknown error"}`,
    });
  }
});



//NO USER WILL BE ABLE TO CREATE A SESSION OR PATCH IT (HISTORICAL FACTS)
//TIS WILL BE DONE INTERNALLY BY THE WORKER
/* ---------------- CREATE a new Parking Session ---------------- */
// router.post("/", async (req: Request, res: Response): Promise<void> => {
//   try {
//     const { userId, vehicleId, startTime, expectedEndTime, slotId } = req.body;

//     // Basic validation to ensure required fields are present
//     if (!userId || !vehicleId || !startTime || !slotId) {
//       res.status(400).json({ success: false, message: "Missing required fields: userId, vehicleId, startTime, or spotId" });
//       return;
//     }

//     const newParkingSession = await prisma.parkingSession.create({
//       data: {
//         userId: parseInt(userId, 10),
//         vehicleId: parseInt(vehicleId, 10),
//         entryTime: new Date(startTime),
//         // expectedEndTime is optional in the request body
//         exitTime: new Date(expectedEndTime),
//         slotId: slotId,
//       },
//       include: { user: true, vehicle: true },
//     });

//     //TODO:
//     //HERE WILL BE THE addToQueue Logic

//     res.status(201).json({ success: true, data: newParkingSession, message: "Parking Session started successfully" });
//   } catch (error: any) {
//     // Check for Prisma specific error (e.g., foreign key constraint violation)
//     if (error.code === 'P2003') {
//        res.status(404).json({ success: false, message: "User, Vehicle, or Parking Spot not found." });
//        return;
//     }
//     res.status(500).json({
//       code: error.code || null,
//       message: `Error while creating a new Parking Session: ${error.message || "Unknown error"}`,
//     });
//   }
// });


//NO USER WILL BE ABLE TO CREATE A SESSION
//TIS WILL BE DONE INTERNALLY BY THE WORKER
/* ---------------- PATCH: Update specific fields of a Parking Session ---------------- */
// router.patch("/:id", async (req: Request, res: Response): Promise<void> => {
//   try {
    
//          if (!req.params.id) {
//       res.status(400).json({ success: false, message: "user ID is not provided" });
//       return;
//     }
       
//     const sessionId = parseInt(req.params.id, 10);
    
//     if (isNaN(sessionId)) {
//       res.status(400).json({ success: false, message: "Invalid Session ID" });
//       return;
//     }

//     // السماح بتحديث حقول معينة
//     const { expectedExitTime, slotId, status } = req.body; 

//     // 💥 تجهيز البيانات للتحديث مع تحويل التواريخ والأرقام
//     const updateData: any = {};
//     if (expectedExitTime) updateData.expectedExitTime = new Date(expectedExitTime);
//     if (slotId) updateData.slotId = slotId; // افترض أن slotId رقم أو سترينج
//     if (status) updateData.status = status; // للسماح بتعديل حالة الحجز يدوياً إذا لزم الأمر
    
//     if (Object.keys(updateData).length === 0) {
//          res.status(400).json({ success: false, message: "No valid fields provided for update." });
//          return;
//     }

//     const updatedSession = await prisma.parkingSession.update({
//       where: { id: sessionId },
//       data: updateData,
//       include: { user: true, vehicle: true, paymentTransaction: true },
//     });
    
//     // ==========================================================
//     // 💥 لوجيك إعادة جدولة الـ Job Queue إذا تم تمديد expectedExitTime
//     // ==========================================================


//     res.status(200).json({ success: true, data: updatedSession, message: "Parking Session updated successfully" });
//   } catch (error: any) {
//     if (error.code === 'P2025') {
//       res.status(404).json({ success: false, message: `Parking Session with ID ${req.params.id} not found.` });
//       return;
//     }
//     res.status(500).json({
//       code: error.code || null,
//       message: `Error while updating the Parking Session: ${error.message || "Unknown error"}`,
//     });
//   }
// });


/* ---------------- DELETE a Parking Session ---------------- */
router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  try {

       if (!req.params.id) {
      res.status(400).json({ success: false, message: "user ID is not provided" });
      return;
    }

    const sessionId = parseInt(req.params.id, 10);
    
    if (isNaN(sessionId)) {
      res.status(400).json({ success: false, message: "Invalid Session ID" });
      return;
    }

    await prisma.parkingSession.update({
      where: { id: sessionId },
      data:{status:"COMPLETED"}
    });

    //TRIGER CALCULATING AND PAYMENT WORKRER


    res.status(200).json({ success: true, message: `Parking Session with ID ${sessionId} marked deleted successfully` });
  } catch (error: any) {
    // P2025 for "record to delete does not exist"
    if (error.code === 'P2025') {
      res.status(404).json({ success: false, message: `Parking Session with ID ${req.params.id} not found.` });
      return;
    }
    res.status(500).json({
      code: error.code || null,
      message: `Error while deleting the Parking Session: ${error.message || "Unknown error"}`,
    });
  }
});



/* ---------------- POST: Manually END a Parking Session ---------------- */
// DO SAME WORKER LOGIC IN CASE ANY FAILS HAPPENED
router.post("/:id/end", async (req: Request, res: Response): Promise<void> => {
  try {
    

      if (!req.params.id) {
      res.status(400).json({ success: false, message: "user ID is not provided" });
      return;
    }

    const sessionId = parseInt(req.params.id, 10);
    
    if (isNaN(sessionId)) {
      res.status(400).json({ success: false, message: "Invalid Session ID" });
      return;
    }

    // المنطق هنا هو: قم بتعيين وقت الخروج الفعلي الآن وتغيير الحالة إلى 'COMPLETED'
    const updatedSession = await prisma.parkingSession.update({
      where: { id: sessionId, status: 'ACTIVE' }, // تأكد من إنهاء جلسة نشطة فقط
      data: {
        exitTime: new Date(), // تحديد وقت الانتهاء الفعلي الآن
        status: 'COMPLETED', // تعيين الحالة إلى COMPLETED بشكل إجباري
      },
      include: { user: true, vehicle: true, paymentTransaction: true }, 
    });

    // 💥 هنا يجب إرسال مهمة إلى Job Queue لمعالجة الدفع وحساب الرسوم (لوجيك طويل الأمد)
    // await paymentJobQueue.add('processPayment', { sessionId: updatedSession.id });


    res.status(200).json({ success: true, data: updatedSession, message: "Parking Session ended and payment job initiated" });
  } catch (error: any) {
    if (error.code === 'P2025') {
      res.status(404).json({ success: false, message: `Active Parking Session with ID ${req.params.id} not found or already ended.` });
      return;
    }
    res.status(500).json({
      code: error.code || null,
      message: `Error while ending the Parking Session: ${error.message || "Unknown error"}`,
    });
  }
});


export default router; // Make sure to export the router