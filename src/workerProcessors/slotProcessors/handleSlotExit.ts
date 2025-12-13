import { ParkingSlot } from "../../mongo_Models/parkingSlot.js";
import { prisma } from "../../routes/prsimaForRouters.js";
import { ParkingSessionStatus } from "../../generated/prisma/client.js";
import { AlertSeverity, AlertType, SlotStatus } from "../../types/parkingEventTypes.js";
import { sessionLifecycleQueue } from "../../queues/queues.js"; // Import queue
import { paymentQueue } from "../../queues/queues.js"; // Import payment queue
import { Alert } from "../../mongo_Models/alert.js";
import { calculateBill } from "../Helpers/Bills.js";
// Function to calculate bill (needs implementation)
// import { calculateBill } from "../services/billingService.js";

export const handleSlotExit = async (slot_id: string, timestamp: any) => {
    const eventTimestamp = new Date(timestamp);

    // 1. Get slot data BEFORE clearing it
    const leavingSlot = await ParkingSlot.findById(slot_id).lean();

    if (!leavingSlot) {
        // Log critical error, maybe alert
        console.error(`❌ handleSlotExit: Slot ID [${slot_id}] not found in MongoDB upon exit event.`);
        throw new Error(`Slot ID [${slot_id}] not found for exit event.`);
    }

    // If slot was already available, log it and exit (Idempotency/Correction)
    if (leavingSlot.status === SlotStatus.AVAILABLE) {
         console.warn(`🔄 Slot ${slot_id} is already AVAILABLE. Ignoring exit event.`);
         return;
    }


    let activeSession: any = null; // Use Prisma types later

    // --- 2. Find the Correct Active Session ---

    // Case A: Slot was in CONFLICT
    if (leavingSlot.status === SlotStatus.CONFLICT && leavingSlot.current_vehicle?.plate_number) {
        const plateNumber = leavingSlot.current_vehicle.plate_number;
        console.log(`Exit from CONFLICTED slot ${slot_id}. Searching session by plate: ${plateNumber}`);
        // Find vehicle first
        const vehicle = await prisma.vehicle.findUnique({ where: { plate: plateNumber } });
        if (vehicle) {
            activeSession = await prisma.parkingSession.findFirst({
                where: {
                    vehicleId: vehicle.id, // Search by Vehicle ID
                    status: ParkingSessionStatus.ACTIVE
                },
                include: { vehicle: { select: { plate: true } } }
            });
        } else {
             console.warn(`Could not find vehicle with plate ${plateNumber} for conflicted slot exit.`);
             // Alert might be needed
               await Alert.create({
                alert_type: AlertType.SUSPICIOUS_ACTIVITY,
                title: 'Leaving car without A session',
                description: `Vehicle [${plateNumber}] is leaving  slot [${slot_id}] and he has no parking session avilable`,
                severity: AlertSeverity.HIGH,
                timestamp: eventTimestamp,
                details: {
                    slotId: slot_id,
                    detectedPlate: plateNumber,
                }
            });

        }
    }
    // Case B: Slot was OCCUPIED (Normal Exit) or ASSIGNED (User left before occupying - less likely but possible)
    else if (leavingSlot.status === SlotStatus.OCCUPIED || leavingSlot.status === SlotStatus.ASSIGNED) {
         console.log(`Exit from ${leavingSlot.status} slot ${slot_id}. Searching session by slotId.`);
         activeSession = await prisma.parkingSession.findFirst({
            where: {
                slotId: slot_id,
                status: ParkingSessionStatus.ACTIVE
            },
            include: { vehicle: { select: { plate: true } } }
        });
    }
    // Case C: Slot was in another state (MAINTENANCE with violator, etc.)
    else {
         console.warn(`Exit event received for slot ${slot_id} with unexpected status: ${leavingSlot.status}. Clearing slot.`);
         // Just clear the slot, no session to close
         await ParkingSlot.updateOne(
             { _id: slot_id },
             { $set: { status: SlotStatus.AVAILABLE, current_vehicle: null, conflict_details: null, violating_vehicle: null } } // Clear everything
         );
         return; // Exit
    }

    // --- 3. Process the Found Session (or handle not found) ---

    if (!activeSession) {
        // This is problematic - slot was occupied/conflicted but no active session found.
        console.error(`CRITICAL: No active session found for exit from slot ${slot_id} (Status: ${leavingSlot.status}, Plate: ${leavingSlot.current_vehicle?.plate_number}). Clearing slot, but billing may fail.`);
        await Alert.create({
            alert_type: AlertType.VIOLATION,
            title: 'Session Not Found on Exit',
            description: `Could not find active session for vehicle ${leavingSlot.current_vehicle?.plate_number} exiting slot ${slot_id} (status ${leavingSlot.status}). Billing failed.`,
            severity: AlertSeverity.HIGH,
            timestamp: eventTimestamp,
            details: { slotId: slot_id, plateNumber: leavingSlot.current_vehicle?.plate_number, slotStatus: leavingSlot.status }
        });
        // Clear the slot anyway to prevent blocking
        await ParkingSlot.updateOne(
             { _id: slot_id },
             { $set: { status: SlotStatus.AVAILABLE, current_vehicle: null, conflict_details: null, violating_vehicle: null } }
         );
        return; // Exit
    }

    console.log(`Found active session ${activeSession.id} for exit from slot ${slot_id}. Proceeding to close.`);

    // --- 4. Cancel Delayed Jobs ---
    try {
        const jobIdsToCancel = [activeSession.exitCheckJobId, activeSession.occupancyCheckJobId].filter(Boolean); // Get non-null job IDs
        for (const jobId of jobIdsToCancel) {
            const job = await sessionLifecycleQueue.getJob(jobId);
            if (job) {
                await job.remove();
                console.log(`🧹 Removed job ${jobId} for exiting session ${activeSession.id}.`);
            }
        }
    } catch (error) {
        console.error(`Error removing jobs for session ${activeSession.id}:`, error);
        // Log but continue - closing session is more critical
    }

    // --- 5. Close the Session ---
    const closedSession = await prisma.parkingSession.update({
        where: { id: activeSession.id },
        data: {
            status: ParkingSessionStatus.COMPLETED,
            exitTime: eventTimestamp,
            // Clear job IDs just in case
            exitCheckJobId: null,
            occupancyCheckJobId: null
        },
        include:{vehicle:true}
    });
    
    try{
        // --- 6. Calculate Bill & Add Payment Job ---
        const billAmount = calculateBill(closedSession); // Implement this function based on rates and overtime fields
        console.log(`Calculated bill for session ${closedSession.id}: ${billAmount}`);
        await paymentQueue.add('process-payment', {
            sessionId: closedSession.id,
            amount: billAmount,
            userId: closedSession.userId,
            plateNumber: closedSession.vehicle.plate,
            // Add other necessary payment details
        }, { priority: 7 }); // Example priority
    }
    catch(err:any){
        console.log(`couldn't complete the billing phase ${err.message}`)
    }

    // --- 7. Clear the Slot in MongoDB ---
    await ParkingSlot.updateOne(
        { _id: slot_id },
        {
            $set: {
                status: SlotStatus.AVAILABLE,
                current_vehicle: null,
                conflict_details: null, // Ensure conflict details are cleared
                violating_vehicle: null // Ensure violator details are cleared
            }
            // Maybe reset stats if needed, or do it in a separate daily job
            // $set: { 'stats.last_used': eventTimestamp } // Example
        }
    );

    console.log(`✅ Session ${closedSession.id} closed. Slot ${slot_id} set to AVAILABLE.`);
    return; // Job successful
};