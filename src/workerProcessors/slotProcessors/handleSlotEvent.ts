import { Job } from 'bullmq';
// Assuming you have these defined elsewhere:
import { handleSlotEnter } from '../slotProcessors/handleSlotEnter.js';
import { handleSlotExit } from '../slotProcessors/handleSlotExit.js';

export const handleSlotEvent = async (job: Job) => {
    // Extract all relevant data from the job
    const { slot_id, plate_number, event_type, timestamp, ...otherData } = job.data;

    // Basic validation
    if (!slot_id || !event_type) {
        throw new Error('❌ Slot Event Job ${job.id}: Missing slot_id or event_type.')
    }

    try {
        switch (event_type) { // Use event_type based on your previous examples
            case "OCCUPIED": // Assuming OCCUPIED maps to enter
            case "enter": // Keep both if needed
                console.log(`Job ${job.id}: Handling slot enter event for ${slot_id}`);
                // Pass the necessary data to the handler
                return await handleSlotEnter(slot_id, plate_number, timestamp);

            case "AVAILABLE": // Assuming AVAILABLE maps to exit
            case "exit": // Keep both if needed
                console.log(`Job ${job.id}: Handling slot exit event for ${slot_id}`);
                // Pass the necessary data to the handler
                return await handleSlotExit(slot_id, timestamp); // plate_number might not be available on exit

            default:
                console.warn(`Job ${job.id}: Unknown slot event type: ${event_type}`);
                return; // Ignore unknown event types
        }

    } catch (error: any) {
        console.error(`❌ CRITICAL ERROR processing Slot Event Job ${job.id} (${event_type} for ${slot_id}): ${error.message}`);
        // Re-throw the error so BullMQ knows the job failed
        throw error;
    }
};