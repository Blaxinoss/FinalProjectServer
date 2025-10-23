import { Router } from "express";

import type { Request,Response } from "express";
import { prisma } from "./routes.js";
import { ParkingSessionStatus } from "../src/generated/prisma/index.js";
import { getMaximumExtensionTime } from "../services/getMaximumExtensionTime.js";
import {  sessionLifecycleQueue } from "../queues/queues.js";
import { OCCUPANCY_CHECK_DELAY_AFTER_ENTRY } from "../constants/constants.js";
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





// 2. هتجيب الدالة اللي لسه هنعملها
// import { getMaximumExtensionTime } from '../services/parkingService.js'; 
/* ---------------- POST: Extend Parking Session ---------------- */
// POST /api/sessions/:sessionId/extend
router.post('/:sessionId/extend', async (req, res) => {
    try {
        // --- 1. جلب البيانات والتحقق منها ---
        // (خد الـ sessionId من req.params والـ extendForMinutes من req.body)
        // (اتأكد إن extendForMinutes رقم موجب)
        const { sessionId } = req.params; // ⬅️ 1. من params
        const { extendForMinutes } = req.body;
        const sessionIdInt = parseInt(sessionId, 10); // ⬅️ 2. تحويل لـ Int

        if (!sessionIdInt || !extendForMinutes || isNaN(extendForMinutes) || extendForMinutes <= 0) {
            return res.status(400).json({ error: 'Invalid session ID or extension duration.' });
        }

        
        // --- 2. جلب الجلسة الحالية ---
        // (هات الجلسة من Prisma باستخدام sessionId)
        // (اتأكد إنها موجودة وإن حالتها لسه ACTIVE، لو لا ⬅️ ارفض الطلب)
        const session = await prisma.parkingSession.findUnique({
          where:{id : sessionIdInt, status:ParkingSessionStatus.ACTIVE}
        })

        if(!session) {
          return res.status(400).json({ error: 'Session not found or not active.' });
        }
        
        // --- 3. التحقق من إمكانية التمديد (المنطق الذكي) ---
        // (احسب الوقت الجديد: const newExpectedExitTime = new Date(Date.now() + extendForMinutes * 60000))
        
        const newExpectedExitTime = new Date(session.expectedExitTime.getTime()+ extendForMinutes * 60000);

        // (هنا هتستدعي الدالة اللي بتجيب أقصى وقت متاح)
        const maxAllowedTime = await getMaximumExtensionTime(session.slotId); //  (هنعدل دي تحت)

        // (قارن: لو الوقت الجديد > الوقت الأقصى ⬅️ ارفض الطلب 409 Conflict)
        // (رسالة زي: "لا يمكن التمديد لهذه الفترة لوجود حجز قادم")

        if (newExpectedExitTime > maxAllowedTime) {
            return res.status(409).json({ error: `Extension exceeds maximum allowed time due to upcoming reservations, maximum time is ${maxAllowedTime}` });
        }
        
        // --- 4. التعامل مع الغرامة (المنطق بتاعك) ---
        // (هتعمل متغير let dataToUpdate = {})
        // (هتشيك: هل session.overTimeStartTime موجود و session.overTimeEndTime فاضي (null)؟)
        // (لو أه، ده معناه إنه بيصحح وضعه ⬅️ ضيف للحقل: dataToUpdate.overTimeEndTime = new Date())
        
        const dataToUpdate:any = {};
        if(session.overtimeStartTime && !session.overtimeEndTime){
           dataToUpdate.overtimeEndTime = new Date();
        }

        
        // --- 5. تعديل الـ Delayed Job (إلغاء القديمة وإنشاء الجديدة) ---
        // (هات الجوب القديمة: const oldJob = await exitCheckQueue.getJob(session.exitCheckJobId))
        // (لو لقيتها، الغيها: await oldJob.remove())
        
    if (session.exitCheckJobId) { // تأكد إنه مش null
            const oldJob = await sessionLifecycleQueue.getJob(session.exitCheckJobId); // ⬅️ 5. الاسم الصح
            if (oldJob) {
                await oldJob.remove();
            }
        }

        // (احسب الـ delay الجديد بالوقت الجديد)
        // (اعمل جوب جديدة في exitCheckQueue بالـ delay الجديد)
        // (خد الـ newJob.id)

        

        const checkSessionExpireJOB = await sessionLifecycleQueue.add(
            'check-session-expiry',
            {
                parkingSessionId: session.id
            },
            {
                delay: newExpectedExitTime.getTime() - Date.now()
            }
        );

        // --- 6. تحديث قاعدة البيانات (Prisma) ---
        // (هنا هتجمع كل التحديثات)
        dataToUpdate.expectedExitTime = newExpectedExitTime
        dataToUpdate.exitCheckJobId = checkSessionExpireJOB.id
        dataToUpdate.isExtended = true

        // (اعمل update للـ ParkingSession باستخدام الـ dataToUpdate)

        const updatedSession = await prisma.parkingSession.update({
            where: { id: session.id },
            data: dataToUpdate // ⬅️ 4. تحديث كل حاجة مرة واحدة
        });
        
        
        // --- 7. إرسال الرد الناجح ---
        // (res.status(200).json({ message: "تم التمديد بنجاح" }))
res.status(200).json({ message: "Extension successful", newExpectedExitTime: updatedSession.expectedExitTime });
   } catch (error: any) { // (خليها any عشان prisma errors)
        console.error("Error extending session:", error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


export default router; // Make sure to export the router