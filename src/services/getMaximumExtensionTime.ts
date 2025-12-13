import { GRACE_PERIOD_EARLY_ENTERANCE_MINUTES, GRACE_PERIOD_TO_LEAVE_AFTER_SESSION_END_TIME, MAX_ALLOWED_HOURS_TO_EXTEND_SESSION } from "../constants/constants.js";
import { prisma } from "../routes/prsimaForRouters.js";
import { ReservationsStatus } from "../../src/generated/prisma/client.js";


export const getMaximumExtensionTime = async (slotId: string): Promise<Date> => {


    const upcomingReservation = await prisma.reservation.findFirst({
        where:{slotId:slotId,
            startTime:{gt:new Date()},
            status:ReservationsStatus.CONFIRMED
        },
        orderBy:{startTime:'asc'},
    })

   if (!upcomingReservation) {
        // لا يوجد حجوزات قادمة، اسمح بالتمديد MAX_ALLOWED_HOURS_TO_EXTEND_SESSION  ساعة من الآن
        return new Date(Date.now() + MAX_ALLOWED_HOURS_TO_EXTEND_SESSION * 60 * 60 * 1000); 
    }

    const entryGraceMs = (GRACE_PERIOD_EARLY_ENTERANCE_MINUTES * 60000);
    const exitGraceMs = (GRACE_PERIOD_TO_LEAVE_AFTER_SESSION_END_TIME * 60000);

    
    const maxAllowedTimestamp = upcomingReservation.startTime.getTime() - entryGraceMs - exitGraceMs;   

    return new Date(maxAllowedTimestamp);


}