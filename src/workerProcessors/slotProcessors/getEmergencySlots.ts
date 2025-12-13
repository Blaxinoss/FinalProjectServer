import { ParkingSlot as MongoParkingSlot } from "../../mongo_Models/parkingSlot.js"; // Alias for clarity
import {prisma} from '../../routes/prsimaForRouters.js';
import { SlotStatus } from "../../types/parkingEventTypes.js";
import { SlotType } from "../../generated/prisma/client.js"; // Use Prisma enum

export const getAvailableEmergencySlotId = async (): Promise<string | null> => { // Renamed for clarity
    // 1. هات IDs أماكن الطوارئ من Prisma
    const emergencyPrismaSlots = await prisma.parkingSlot.findMany({
        where: { type: SlotType.EMERGENCY },
        select: { id: true }
    });
    const emergencySlotIds = emergencyPrismaSlots.map(slot => slot.id);

    if (emergencySlotIds.length === 0) {
        console.log("No emergency slots defined in Prisma.");
        return null;
    }

    // 2. اسأل MongoDB: مين من الـ IDs دي حالته AVAILABLE؟
    const availableEmergencyMongoSlot = await MongoParkingSlot.findOne({ // Use findOne to get just the first one
        _id: { $in: emergencySlotIds },
        status: SlotStatus.AVAILABLE
    }).select('_id').lean(); // Get only the ID

    if (availableEmergencyMongoSlot) {
        const availableId = availableEmergencyMongoSlot._id.toString();
        console.log(`Found available emergency slot: ${availableId}`);
        return availableId; // ⬅️ رجع الـ ID مباشرةً
    } else {
        console.log("No available emergency slots found in MongoDB.");
        return null;
    }
}