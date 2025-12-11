import { Router, type Request, type Response } from "express";
import { prisma } from "../prsimaForRouters.js";
import { ParkingSessionStatus, paymentMethod, ReservationsStatus, TransactionStatus, type User, type Vehicle } from "../../generated/prisma/index.js";
import { getMQTTClient } from "../../db&init/mqtt.js";
import { SlotStatus } from "../../types/parkingEventTypes.js";
import { ParkingSlot } from "../../mongo_Models/parkingSlot.js";
import { sessionLifecycleQueue } from "../../queues/queues.js";
import { Alert } from '../../mongo_Models/alert.js'; // ⬅️ استيراد موديل Alert
import { stripe } from "../../services/stripe.js";


const mqttClient = getMQTTClient();
export const router = Router();

//المسار: /api/admin/sessions/:sessionId/complete-cash-payment


router.post('sessions/:sessionId/complete-cash-payment',async(req:Request,res:Response)=>{
    
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

          const topic = `garage/gate/event/response`;
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



router.post('vehicles/:plateNumber/clear-debt',async(req:Request,res:Response)=>{

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

router.put('slots/:slotId/status-force', async (req, res) => {
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
router.post('sessions/:sessionId/force-cancel', async (req, res) => {
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
        const commandTopic = `garage/gate/admin/command/${command}`;
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



/* ---------------- GET ALL ALERTS ---------------- */
// Admin Only
router.get("/alerts", async (req: Request, res: Response): Promise<void> => {
  try {
    // جلب كل التنبيهات، ورتبهم من الأحدث للأقدم
    const alerts = await Alert.find({})
      .sort({ timestamp: -1 }) // ⬅️ الأحدث أولاً
      .limit(100); // ⬅️ (اختياري: تحديد حد أقصى عشان متجيبش مليون تنبيه)

    res.status(200).json({ success: true, data: alerts });
  } catch (error: any) {
    res.status(500).json({
      code: error.code || null,
      message: `Error while fetching the Alerts: ${error.message || "Unknown error"}`,
    });
  }
});




/* ---------------- GET ALL SLOTS (Live Status) ---------------- */
// Admin Only
router.get("/slots", async (req: Request, res: Response): Promise<void> => {
  try {
    // جلب كل الأماكن من MongoDB عشان نعرض حالتهم الحقيقية
    const slots = await ParkingSlot.find({})
      .sort({ _id: 1 }); // ⬅️ رتبهم بالـ ID (A-01, A-02, B-01...)

    res.status(200).json({ success: true, data: slots });
  } catch (error: any) {
    res.status(500).json({
      code: error.code || null,
      message: `Error while fetching the Slots: ${error.message || "Unknown error"}`,
    });
  }
});



    /* ---------------- GET ALL VEHICLES ADMIN ---------------- */
  router.get("/vehicles", async (req: Request, res: Response): Promise<void> => {
    try {
      const vehicles: Vehicle[] = await prisma.vehicle.findMany({
              include: { user: true, ParkingSessions: true },
      });
      res.status(200).json({ success: true, data: vehicles });
    } catch (error: any) {
      res.status(500).json({
        code: error.code || null,
        message: `Error while fetching the Vehicles: ${error.message || "Unknown error"}`,
      });
    }
  });

/* ---------------- GET VEHICLE BY ID ADMIN---------------- */
router.get("/vehicle/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.params.id) {
      res.status(400).json({ message: "User Id is not provided" });
      return;
    }

    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ success: false, message: "Invalid vehicle ID" });
    }

    const vehicle = await prisma.vehicle.findUnique({
      where: { id },
      include: { user: true, ParkingSessions: true },
    });

    if (!vehicle) {
      res.status(404).json({ success: false, message: "Vehicle not found" });
      return;
    }

    res.status(200).json({ success: true, data: vehicle });
  } catch (error: any) {
    res.status(500).json({
      code: error.code || null,
      message: `Error while fetching this specfic vehicle: ${error.message || "Unknown error"}`,
    });
  }
});


/* ---------------- GET ALL USERS Admin ---------------- */
router.get("/users", async (req: Request, res: Response): Promise<void> => {
  try {
    const users: User[] = await prisma.user.findMany();
    res.status(200).json(users);
  } catch (error: any) {
    res.status(500).json({
      code: error.code || null,
message: `Error while fetcching the user: ${error.message || "Unknown error"}`
    });
  }
});


router.get("/vehicles/:userId", async (req: Request, res: Response) => {
  try {
      if (!req.params.userId) {
      res.status(400).json({ message: "User Id is not provided" });
      return;
    }
    const userId = parseInt(req.params.userId, 10);
    
    if (isNaN(userId)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }

    const vehicles = await prisma.vehicle.findMany({
      where: { userId },
      include: { ParkingSessions: true },
    });

    res.status(200).json({vehicles});
  } catch (error: any) {
    res.status(500).json({
      code: error.code || null,
message: `Error while fetcching the user cars: ${error.message || "Unknown error"}`
    });
  }
});




router.delete("/user/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.params.id) {
      res.status(400).json({ message: "no id provided to delete" });
      return;
    }

    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      res.status(400).json({ message: "Invalid user ID" });
      return;
    }

    const deletedUser = await prisma.user.delete({
      where: { id},
    });

    res.status(200).json({
      message: "User deleted successfully",
      user: deletedUser,
    });
  } catch (error: any) {
    res.status(500).json({
      code: error.code || null,
message: `Error while deleting the user: ${error.message || "Unknown error"}`
    });
  }
});


router.put("/user/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.params.id) {
      res.status(400).json({ message: "no id provided to delete" });
      return;
    }

    const user_id = parseInt(req.params.id, 10);

    const user = req.body;

    if (!user || Object.keys(user).length === 0) {
      res.status(400).json({ message: "No user data provided" });
      return;
    }

    const newUser = await prisma.user.update({
      where: { id: user_id },
      data: { ...user },
    });

    res.status(200).json({
      message: "User updated successfully",
      user: newUser,
    });
  } catch (error: any) {
    res.status(500).json({
      code: error.code || null,
message: `Error while updating the user: ${error.message || "Unknown error"}`
    });
  }
});


// --- 2. Get Admin All Reservations ---
router.get("/reservations", async (req: Request, res: Response) => {
 

  try {
    const userReservations = await prisma.reservation.findMany({
      where: {
        // userId: userId,
        status: ReservationsStatus.CONFIRMED, // اعرض فقط الحجوزات المؤكدة والقادمة
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



// --- 4. Update a Reservation (للمدير فقط) ---
// المسار: PUT /reservations/:id
// if user want to change start or end time he must cancel and create a new reservation
// this route is only used internally by admin to change slotId in emergency cases
// FOR ADMIN ONLY!!!!!!!!!!!!
router.put("/reservations/:id", async (req: Request, res: Response) => {
    // (الميدل وير بتاع الأدمن شغال)
    

    if (!req.params.id) {
        return res.status(400).json({ error: "No reservation id provided." });
    }


    const reservationId = parseInt(req.params.id);
    const { newStatus } = req.body; // { "newStatus": "CANCELLED" }

    if (!newStatus) {
        return res.status(400).json({ error: "No newStatus provided." });
    }

    try {
        // --- 1. هات الحجز الأصلي (عشان نجيب بياناته) ---
        const reservation = await prisma.reservation.findUnique({
            where: { id: reservationId }
        });

        if (!reservation) {
            return res.status(404).json({ error: "Reservation not found." });
        }


        // (أهم حالة: لو الأدمن بيلغي الحجز)
        if (newStatus === ReservationsStatus.CANCELLED) {
            
            // 2أ. الغي الهولد بتاع الفلوس (لو موجود)
            if (reservation.paymentIntentId) {
                try {
                    await stripe.paymentIntents.cancel(reservation.paymentIntentId);
                    console.log(`Admin cancelled reservation ${reservationId}, PaymentIntent ${reservation.paymentIntentId} cancelled.`);
                } catch (stripeError: any) {
                    console.error(`Error cancelling Stripe intent while admin cancelled reservation:`, stripeError.message);
                    // (ممكن نوقف هنا أو نكمل - الأفضل نكمل ونلغي الحجز)
                }
            }
            
            // 2ب. (لو فيه جوبات مستقبلية مرتبطة بالحجز ده، نلغيها هنا)
            // (في حالتنا الجوبات مرتبطة بالسيشن، فمفيش حاجة هنا)
        }

        // --- 3. تنفيذ التحديث في الداتابيز ---
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



/* ---------------- GET ALL PAYMENT TRANSACTIONS ---------------- */
router.get("/transactions", async (req: Request, res: Response): Promise<void> => {
  try {
    const transactions: any[] = await prisma.paymentTransaction.findMany({
      include: { parkingSession: true }, 
    });
    res.status(200).json({ success: true, data: transactions });
  } catch (error: any) {
    res.status(500).json({
      code: error.code || null,
      message: `Error while fetching the Payment Transactions: ${error.message || "Unknown error"}`,
    });
  }
});

/* ---------------- GET PAYMENT TRANSACTION BY ID ---------------- */
router.get("/transactions/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.params.id) {
      res.status(400).json({ success: false, message: "Transaction ID is not provided" });
      return;
    }

    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ success: false, message: "Invalid transaction ID" });
      return;
    }

    const transaction = await prisma.paymentTransaction.findUnique({
      where: { id },
      include: { parkingSession: true }, 
    });

    if (!transaction) {
      res.status(404).json({ success: false, message: "Payment Transaction not found" });
      return;
    }

    res.status(200).json({ success: true, data: transaction });
  } catch (error: any) {
    res.status(500).json({
      code: error.code || null,
      message: `Error while fetching this specific payment transaction: ${error.message || "Unknown error"}`,
    });
  }
});



/* ---------------- UPDATE PAYMENT TRANSACTION ---------------- */
router.put("/transactions/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.params.id) {
      res.status(400).json({ success: false, message: "Transaction ID is not provided" });
      return;
    }

    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ success: false, message: "Invalid transaction ID" });
      return;
    }

    const data = req.body;
    if (!data || Object.keys(data).length === 0) {
      res.status(400).json({ success: false, message: "No data provided to update" });
      return;
    }
    

    const updatedTransaction = await prisma.paymentTransaction.update({
      where: { id,
        parkingSession:{
          userId:req.user?.id!
        }
       },
      data,
    });

    res.status(200).json({ success: true, data: updatedTransaction });
  } catch (error: any) {
    // P2025 is often the error code for record not found in Prisma update operations
    if (error.code === 'P2025') {
       res.status(404).json({ success: false, message: "Payment Transaction not found for update" });
       return;
    }
    res.status(500).json({
      code: error.code || null,
      message: `Error while updating the payment transaction: ${error.message || "Unknown error"}`,
    });
  }
});



/* ---------------- DELETE PAYMENT TRANSACTION ---------------- */
router.delete("/transactions/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.params.id) {
      res.status(400).json({ success: false, message: "Transaction ID is not provided" });
      return;
    }

    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ success: false, message: "Invalid transaction ID" });
      return;
    }

    const deletedTransaction = await prisma.paymentTransaction.delete({ where: { id } });

    res.status(200).json({ success: true, data: deletedTransaction });
  } catch (error: any) {
    // P2025 is often the error code for record not found in Prisma delete operations
    if (error.code === 'P2025') {
      res.status(404).json({ success: false, message: "Payment Transaction not found for deletion" });
      return;
    }
    res.status(500).json({
      code: error.code || null,
      message: `Error while deleting the payment transaction: ${error.message || "Unknown error"}`,
    });
  }
});



/* ---------------- CREATE PAYMENT TRANSACTION ---------------- */
router.post("/transactions", async (req: Request, res: Response): Promise<void> => {
  try {
    // Note: paidAt, createdAt, updatedAt, and transactionStatus have defaults in the schema
    const { parkingSessionId, amount, paymentMethod, transactionStatus } = req.body;

    if (!parkingSessionId || !amount || !paymentMethod) {
      res.status(400).json({
        success: false,
        message: "Missing required fields: parkingSessionId, amount, and paymentMethod",
      });
      return;
    }

    // Basic type/value validation
    if (typeof parkingSessionId !== 'number' || typeof amount !== 'number' || typeof paymentMethod !== 'string') {
        res.status(400).json({ success: false, message: "Invalid data types for one or more fields" });
        return;
    }


    const newTransaction = await prisma.paymentTransaction.create({
      data: { 
          parkingSessionId, 
          amount, 
          paymentMethod, 
          // transactionStatus is optional in the request body as it has a default, but if provided, use it
          ...(transactionStatus && { transactionStatus }) 
      },
    });

    res.status(201).json({ success: true, data: newTransaction });
  } catch (error: any) {
    res.status(500).json({
      code: error.code || null,
      message: `Error while creating the payment transaction: ${error.message || "Unknown error"}`,
    });
  }
});



/* ---------------- GET ALL Parking Sessions ---------------- */
//Admin Only
router.get("/sessions", async (req: Request, res: Response): Promise<void> => {
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



/* ---------------- DELETE a Parking Session ---------------- */
//no need force control did it



export default router;
