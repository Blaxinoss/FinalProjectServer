import { CONFLICT_FEE, MINIMUM_CHARGE, PENALTY_RATE_PER_MINUTE, REGULAR_RATE_PER_MINUTE } from "../../constants/constants.js";
import type { ParkingSession } from "../../src/generated/prisma/client.js";


function calculateDurationMinutes(start: Date, end: Date): number {
    if (!start || !end || end < start) {
        return 0
    }


    const diffMs = end.getTime() - start.getTime();
    return Math.ceil(diffMs / (1000 * 60));
}


export const calculateBill = (session: ParkingSession): number => {
    // --- 🛡️ Layer 1: Basic Validation ---
    if (!session.entryTime || !session.exitTime) {
        console.error(`Billing Error: Session ${session.id} missing entry or exit time.`);
        return 0;
    }

    if (session.exitTime < session.entryTime) {
         console.error(`Billing Error: Session ${session.id} exit time is before entry time.`);
         return 0; // Invalid data
    }
    

    // --- 1. Calculate Total Duration ---
    const totalMinutes = calculateDurationMinutes(session.entryTime, session.exitTime);
    console.log(`Session ${session.id}: Total duration = ${totalMinutes} minutes.`);

    // --- 2. Calculate Base Cost (Regular Rate) ---
    let amount = totalMinutes * REGULAR_RATE_PER_MINUTE;
    console.log(`Session ${session.id}: Base amount = ${amount} EGP.`);

    if (session.overtimeStartTime) {
        console.log(`Session ${session.id}: Overtime detected, starting calculation.`);
        // Determine the end of the penalty period
        const penaltyEndTime = session.overtimeEndTime || session.exitTime; // Use overTimeEndTime if set, otherwise the session exit
        
        const penaltyMinutes = calculateDurationMinutes(session.overtimeStartTime, penaltyEndTime);

        if (penaltyMinutes > 0) {
            // Calculate the *extra* cost for the penalty period
            const penaltyCostDifference = penaltyMinutes * (PENALTY_RATE_PER_MINUTE - REGULAR_RATE_PER_MINUTE);
            console.log(`Session ${session.id}: Penalty duration = ${penaltyMinutes} mins. Adding difference = ${penaltyCostDifference} EGP.`);
            amount += penaltyCostDifference;
        } else {
             console.warn(`Session ${session.id}: Overtime start time exists, but penalty duration is zero or negative.`);
        }
    }

    // --- 4. Handle Conflict Fee ---
    if (session.involvedInConflict) {
        console.log(`Session ${session.id}: Conflict detected. Adding conflict fee = ${CONFLICT_FEE} EGP.`);
        amount += CONFLICT_FEE;
    }


    // --- 🛡️ Layer 2: Minimum Charge ---
    if (amount < MINIMUM_CHARGE && totalMinutes > 0) {
         console.log(`Session ${session.id}: Calculated amount ${amount} is less than minimum ${MINIMUM_CHARGE}. Adjusting.`);
         amount = MINIMUM_CHARGE;
    } else if (totalMinutes === 0 && amount === 0) {
        // Handle zero duration - maybe still apply minimum if entry/exit same minute? Optional.
        // For now, zero duration = zero cost unless minimum applies differently.
         console.log(`Session ${session.id}: Zero duration, zero cost.`);
         amount = 0; // Ensure it's zero
    }
    // --- 5. Final Amount (Optional: Rounding) ---
    // Example: Round to 2 decimal places
    const finalAmount = Math.round(amount * 100);
    console.log(`Session ${session.id}: Final bill amount = ${finalAmount} EGP.`);

    return finalAmount;
};