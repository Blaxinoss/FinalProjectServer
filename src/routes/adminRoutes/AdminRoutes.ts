import { Router, type Request, type Response } from "express";
import { prisma } from "../routes.js";
import { ParkingSessionStatus, paymentMethod, TransactionStatus } from "../../src/generated/prisma/index.js";
import { getMQTTClient } from "../../db&init/mqtt.js";
import { SlotStatus } from "../../types/parkingEventTypes.js";
import { ParkingSlot } from "../../mongo_Models/parkingSlot.js";
import { sessionLifecycleQueue } from "../../queues/queues.js";



const mqttClient = getMQTTClient();
export const router = Router();

//المسار: /api/admin/sessions/:sessionId/complete-cash-payment


router.post('/:sessionId/complete-cash-payment',async(req:Request,res:Response)=>{
    
    const {sessionId} = req.params;
    
     if(!sessionId){
        return res.status(400).json({error:'no session Id number were given'})
    }
    const sessionIdInt = parseInt(sessionId, 10);

   if (isNaN(sessionIdInt)) {
        return res.status(400).json({ error: 'Invalid session ID format.' });
    }

    try {
         const parkingSession = await prisma.parkingSession.findUnique({where:{
        id:sessionIdInt,
    },
    include: {
                paymentTransaction: {
                    orderBy: { createdAt: 'desc' },
                    take: 1
                },
                vehicle: { 
                    select: { plate: true }
                }
            }
})

    if (!parkingSession) {
            return res.status(404).json({ error: 'Parking session not found.' });
        }

    const transaction = parkingSession.paymentTransaction[0];
    
  if (!transaction || transaction.transactionStatus !== TransactionStatus.PENDING) {
            return res.status(400).json({ error: 'No pending transaction found for this session.' });
        }

        if (transaction.paymentMethod !== paymentMethod.CASH) {
            return res.status(400).json({ error: 'This transaction is not marked for cash payment.' });
        }

    await prisma.paymentTransaction.update({
        where:{id:transaction.id},
        data:{
            paidAt: new Date(),
            transactionStatus:"COMPLETED",
        }
    })

    console.log(`CASH payment completed for session ${parkingSession.id} by admin.`);

          const topic = `garage/gate/admin/exit`;
        const payload = JSON.stringify({
            plateNumber: parkingSession.vehicle.plate,
            decision: 'ALLOW_EXIT',
            reason: 'MANUAL_CASH_PAYMENT'
        });
        mqttClient.publish(topic, payload);
        console.log(`MQTT command sent to open exit gate for ${parkingSession.vehicle.plate}`);


        res.status(200).json({ message: 'Cash payment confirmed. Gate opening command sent.' });

    } catch (error: any) {
        console.error("Error completing cash payment:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});



//POST /api/admin/vehicles/:plate/clear-debt



router.post('/:plateNumber/clear-debt',async(req:Request,res:Response)=>{

    const {plateNumber} = req.params;
    try {
        if(!plateNumber){
        return res.status(404).json({ error: 'plate number is missing.' });

        }
        const vehicleOwner = await prisma.vehicle.findUnique({
            where:{plate:plateNumber},
            select:{
                hasOutstandingDebt:true,
                user:{
                    select:{
                        id:true,
                        hasOutstandingDebt:true,
                    }
                }
            }
        })

        if(!vehicleOwner){
                    return res.status(404).json({ error: 'Vehicle data is not found.' });
        }

        if (!vehicleOwner.hasOutstandingDebt && !vehicleOwner.user.hasOutstandingDebt) {
             return res.status(200).json({ message: 'This user/vehicle already has no outstanding debt.' });
        }
        
        await prisma.$transaction([
         prisma.vehicle.update({
            where:{plate:plateNumber},
            data:{hasOutstandingDebt:false}
        }),

         prisma.user.update({
            where:{id:vehicleOwner.user.id},
            data:{hasOutstandingDebt:false}
        })
        ])
        console.log(`Debt cleared for vehicle ${plateNumber} and user ${vehicleOwner.user.id}`);

        return res.status(200).json({ message: 'Debt cleared successfully for vehicle and user.' });

    } catch (error) {
      console.error("Error completing cash payment:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
})



// PUT /api/admin/slots/:slotId/status

router.put('/:slotId/status-force', async (req, res) => {
    const { slotId } = req.params;
    const { newStatus } = req.body;

    if (!newStatus || !Object.values(SlotStatus).includes(newStatus as SlotStatus)) {
        return res.status(400).json({ 
            error: `Invalid status. Must be one of: ${Object.values(SlotStatus).join(', ')}` 
        });
    }

    try {
        const currentSlot = await ParkingSlot.findById(slotId).lean();
        if (!currentSlot) {
            return res.status(404).json({ error: 'Parking slot not found in MongoDB.' });
        }

        if (
            [SlotStatus.OCCUPIED, SlotStatus.ASSIGNED, SlotStatus.CONFLICT].includes(currentSlot.status) &&
            [SlotStatus.AVAILABLE, SlotStatus.MAINTENANCE, SlotStatus.DISABLED].includes(newStatus)
        ) {
            console.warn(`Admin is forcing slot ${slotId} from ${currentSlot.status} to ${newStatus}. Finding and cancelling active session...`);
        }

        const activeSession = await prisma.parkingSession.findFirst({
                where: {
                    slotId: slotId,
                    status: ParkingSessionStatus.ACTIVE
                },
                select: { id: true, occupancyCheckJobId: true, exitCheckJobId: true }
            });

            if (activeSession) {
                console.log(`Found active session ${activeSession.id}. Cancelling it and its jobs.`);
                
                await prisma.parkingSession.update({
                    where: { id: activeSession.id },
                    data: {
                        status: ParkingSessionStatus.CANCELLED, 
                        notes: `Admin forced slot status to ${newStatus}.` 
                    }
                });

                const jobsToCancel = [activeSession.exitCheckJobId, activeSession.occupancyCheckJobId].filter(Boolean);
                for (const jobId of jobsToCancel) {
                    const job = await sessionLifecycleQueue.getJob(jobId!);
                    if (job) await job.remove();
                }
            }
            let updateQuery: any = { $set: { status: newStatus } };
        
        if ([SlotStatus.AVAILABLE, SlotStatus.MAINTENANCE, SlotStatus.DISABLED].includes(newStatus)) {
            updateQuery.$set.current_vehicle = null;
            updateQuery.$set.conflict_details = null;
            updateQuery.$set.violating_vehicle = null;
        }

        await ParkingSlot.updateOne({ _id: slotId }, updateQuery);

        res.status(200).json({ message: `Slot ${slotId} status successfully updated to ${newStatus}.` });

    } catch (error: any) {
        console.error(`Error updating slot status for ${slotId}:`, error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


//user didn't visit his slot something emergenecy left without even going in 
// camera didn's send the Slot available for some reason 
// cancelation here means that there will be no payment at all
// POST /api/admin/sessions/:sessionId/force-cancel
router.post('/:sessionId/force-cancel', async (req, res) => {
    const { sessionId } = req.params;
    const sessionIdInt = parseInt(sessionId, 10);
    // const adminNotes = req.body.notes || "Forced cancellation by admin";
    // const adminId = req.user.id; // (من الميدل وير)

    if (isNaN(sessionIdInt)) {
        return res.status(400).json({ error: 'Invalid session ID format.' });
    }

    try {
        // --- 1. جلب الجلسة والتحقق منها ---
        const session = await prisma.parkingSession.findUnique({
            where: { id: sessionIdInt }
        });

        if (!session) {
            return res.status(404).json({ error: 'Parking session not found.' });
        }
        
        // (ممكن نسمح بإلغاء أي حالة، بس الأغلب إننا بنلغي ACTIVE)
        if (session.status !== ParkingSessionStatus.ACTIVE) {
             return res.status(400).json({ error: `Session is already ${session.status}. No action needed.` });
        }
        
        // --- 2. إلغاء الجوبات المؤجلة (التنضيف) ---
        console.log(`Admin cancelling jobs for session ${session.id}...`);
        try {
            const jobsToCancel = [session.exitCheckJobId, session.occupancyCheckJobId].filter(Boolean); // فلتر الـ null
            for (const jobId of jobsToCancel) {
                const job = await sessionLifecycleQueue.getJob(jobId!);
                if (job) await job.remove();
            }
            console.log(`Jobs for session ${session.id} removed.`);
        } catch (jobError: any) {
            console.error(`Error removing jobs for session ${session.id}, but proceeding anyway:`, jobError.message);
            // (هنكمل حتى لو الجوب منعرفش نلغيها، قفل السيشن أهم)
        }

        await prisma.$transaction([
        // --- 2. إلغاء الجلسة (Prisma) ---
        prisma.parkingSession.update({
            where: { id: session.id },
            data: {
                status: ParkingSessionStatus.CANCELLED,
                exitTime: new Date(),
            }
        }),

        // --- ⬇️ 3. الإضافة الجديدة: إنشاء فاتورة ملغية ⬇️ ---
        prisma.paymentTransaction.create({
            data: {
                parkingSessionId: session.id,
                amount: 0, // ⬅️ مفيش فلوس
                paymentMethod: session.paymentType, // (بنحفظ الطريقة اللي كانت مختارة)
                transactionStatus: TransactionStatus.CANCELLED, // ⬅️ الحالة الجديدة
                paidAt: new Date() // (بنعتبر إنها "اتقفلت" دلوقتي)
            }
        })
        // --- ⬆️ نهاية الإضافة ⬆️ ---
    ]);

        console.log(`Session ${session.id} marked as CANCELLED And a zero cancelled payment has been created.`);

        // --- 4. تحرير المكان (MongoDB) ---
        // (لازم نتأكد إننا بنفضي المكان الصح، وإن المكان ده مكنش أصلًا فاضي)
        if (session.slotId) {
            await ParkingSlot.updateOne(
                { _id: session.slotId, 'current_vehicle.plate_number': (await prisma.vehicle.findUnique({where: {id: session.vehicleId}}))?.plate }, // ⬅️ فلتر أمان إضافي
                {
                    $set: {
                        status: SlotStatus.AVAILABLE,
                        current_vehicle: null,
                        conflict_details: null,
                        violating_vehicle: null
                    }
                }
            );
            console.log(`Slot ${session.slotId} reset to AVAILABLE.`);
        }

res.status(200).json({ message: `Session ${session.id} has been forcibly cancelled.` });
    } catch (error: any) {
        console.error(`Error during force-cancel for session ${sessionId}:`, error);
        res.status(500).json({ error: 'Internal server error' });
    }
});




// POST /api/admin/gates/:gateId/force-command
// (نفترض إن الميدل وير بتاع الأدمن شغال عليه)
router.post('/force-command', async (req: Request, res: Response) => {
    const { command } = req.body; // (اختياري: سبب الفتح اليدوي)
    // const adminId = req.user.id; // (من الميدل وير)

    if (!command) {
        return res.status(400).json({ error: 'Command required.' });
    }

    
    try {
        // 1. تحديد التوبيك بتاع الأوامر (ده مثال، لازم تتفق عليه مع هاردوير البوابة)
        // ممكن يكون توبيك واحد والبوابة بتفلتر بالـ requestId أو gateId
        // أو توبيك مخصص لكل بوابة
        const commandTopic = `garage/gate/command/${command}`;
        const payload = JSON.stringify({
          command:  command.toUpperCase(),
            reason: `ADMIN_OVERRIDE`,
            adminId: 1,
            timestamp: new Date().toISOString()
        });

        // 2. إرسال الأمر
        mqttClient.publish(commandTopic, payload, { qos: 1 }); // (qos 1 لضمان وصوله)

        console.log(`ADMIN: Force ${command} command sent to gate.`);

        res.status(200).json({ message: `Force ${command} command sent to gate.` });

    } catch (error: any) {
        console.error(`Error sending force-open command:`, error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;