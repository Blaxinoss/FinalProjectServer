import { Router } from "express";

import type { Request,Response } from "express";
import { prisma } from '../prsimaForRouters.js';
import { ParkingSessionStatus } from "../../generated/prisma/index.js";
import { getMaximumExtensionTime } from "../../services/getMaximumExtensionTime.js";
import {  sessionLifecycleQueue } from "../../queues/queues.js";
import { OCCUPANCY_CHECK_DELAY_AFTER_ENTRY } from "../../constants/constants.js";
const router = Router();


//TODO AUTH     //TRIGER CALCULATING AND PAYMENT WORKRER on deletion

/* ---------------- GET ALL Parking Sessions For me ---------------- */

router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {

    const id = req.user?.id!;
    const userParkingSessions: any[] = await prisma.parkingSession.findMany({
      where: {userId : id},
      include : {user:true} 
    });
    res.status(200).json({ success: true, data: userParkingSessions });
  } catch (error: any) {
    res.status(500).json({
      code: error.code || null,
      message: `Error while fetching the Parking Sessions for user with id ${req.user?.id!}: ${error.message || "Unknown error"}`,
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
      const userId = req.user?.id!;
        if (!sessionIdInt || !extendForMinutes || isNaN(extendForMinutes) || extendForMinutes <= 0) {
            return res.status(400).json({ error: 'Invalid session ID or extension duration.' });
        }

        
        // --- 2. جلب الجلسة الحالية ---
        // (هات الجلسة من Prisma باستخدام sessionId)
        // (اتأكد إنها موجودة وإن حالتها لسه ACTIVE، لو لا ⬅️ ارفض الطلب)
        const session = await prisma.parkingSession.findUnique({
          where:{id : sessionIdInt, status:ParkingSessionStatus.ACTIVE, userId}
        })

        if(!session) {
          return res.status(400).json({ error: 'Session not found or not active.' });
        }
        
        // --- 3. التحقق من إمكانية التمديد (المنطق الذكي) ---
        
        const newExpectedExitTime = new Date(session.expectedExitTime.getTime()+ extendForMinutes * 60000);

        // (هنا هتستدعي الدالة اللي بتجيب أقصى وقت متاح)
        const maxAllowedTime = await getMaximumExtensionTime(session.slotId); //  (هنعدل دي تحت)

        // (قارن: لو الوقت الجديد > الوقت الأقصى ⬅️ ارفض الطلب 409 Conflict)
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