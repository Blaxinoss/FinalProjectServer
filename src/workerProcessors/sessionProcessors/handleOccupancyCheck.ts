import { Job } from 'bullmq'; // Make sure Job is imported from bullmq
import { ParkingSlot } from "../../mongo_Models/parkingSlot.js";
import {prisma} from '../../routes/prsimaForRouters.js';
import { ParkingSessionStatus } from "../../generated/prisma/client.js";
import { AlertSeverity, AlertType, SlotStatus } from "../../types/parkingEventTypes.js"; // Import AlertType
// Assuming GRACE_PERIOD_... is not needed here
// import { GRACE_PERIOD_TO_LEAVE_AFTER_SESSION_END_TIME } from "../../constants/constants.js";
import { sessionLifecycleQueue } from "../../queues/queues.js";
import { Alert } from "../../mongo_Models/alert.js";

/**
 * Handles the 'check-actual-occupancy' job.
 * Checks if a user actually occupied their assigned slot within the allowed time.
 * If not, cancels the session and frees the slot.
 */
export const handleOccupancyCheck = async (job: Job) => { // Added Job type
    const { parkingSessionId } = job.data;

    try {
        // --- 1. Get Session from Prisma ---
        const session = await prisma.parkingSession.findUnique({ // Use findUnique for ID
            where: { id: parkingSessionId }
        });

        // --- 2. Check if Session is still Active ---
        // If session not found, or already completed/cancelled, do nothing.
        if (!session || session.status !== ParkingSessionStatus.ACTIVE) {
            console.log(`OccupancyCheck Job ${job.id}: Session ${parkingSessionId} not found or not active. No action needed.`);
            return;
        }

        // --- 3. Check Slot Status from MongoDB ---
        // Corrected findById usage
        const slot = await ParkingSlot.findById(session.slotId).select('status').lean();

        // --- 4. Logic: Did the user occupy the slot? ---
        // If the slot is still assigned, it means the user didn't arrive.
        if (slot?.status === SlotStatus.ASSIGNED) {
            console.warn(`OccupancyCheck Job ${job.id}: User for session ${session.id} did NOT occupy slot ${session.slotId} within the time limit.`);

            // a. Create Alert for Dashboard
            await Alert.create({
                type: AlertType.NO_SHOW, // Or a more specific type like SLOT_NOT_OCCUPIED
                title: 'Slot Not Occupied by user after 10 min of enterance',
                message: `User (ID: ${session.userId}) assigned slot ${session.slotId} for session ${session.id} did not occupy it within the check period.`,
                severity: AlertSeverity.CRITICAL, // Or choose appropriate severity
                timestamp: new Date(),
                details: {
                    sessionId: session.id,
                    userId: session.userId,
                    slotId: session.slotId,
                    assignedTime: session.entryTime // Or when the assignment happened
                }
            });

            // b. Cancel the Parking Session in Prisma
            await prisma.parkingSession.update({
                where: { id: session.id },
                data: {
                    status: ParkingSessionStatus.CANCELLED, // Mark as cancelled or NO_SHOW
                    exitTime: new Date(),
                    notes: "Cancelled due to not occupying assigned slot."
                }
            });

            // c. Cancel the main expiry timer (Delayed Job)
            if (session.exitCheckJobId) {
                const expiryJob = await sessionLifecycleQueue.getJob(session.exitCheckJobId);
                if (expiryJob) {
                    await expiryJob.remove();
                    console.log(`OccupancyCheck Job ${job.id}: Removed expiry job ${session.exitCheckJobId} for cancelled session ${session.id}.`);
                }
            }

            // d. Free up the Slot in MongoDB
            await ParkingSlot.updateOne(
                { _id: session.slotId, status: SlotStatus.ASSIGNED }, // Add status check for safety
                {
                    $set: {
                        status: SlotStatus.AVAILABLE,
                        current_vehicle: null // Clear vehicle info
                    }
                }
            );
            console.log(`OccupancyCheck Job ${job.id}: Slot ${session.slotId} status reset to AVAILABLE.`);

            return; // Job done
        } else {
            // Slot is OCCUPIED or AVAILABLE or something else.
            // This means either the user arrived correctly, or the slot became available (and the SLOT_AVAILABLE handler should deal with it).
            // In either case, this job's work is done.
            console.log(`OccupancyCheck Job ${job.id}: Slot ${session.slotId} is no longer ASSIGNED (Current: ${slot?.status}). User likely occupied or left. No action needed.`);
            return;
        }

    } catch (error: any) {
        console.error(`❌ CRITICAL ERROR in OccupancyCheck Job ${job.id}: ${error.message}`);
        throw error; // Re-throw to allow BullMQ retry logic
    }
};