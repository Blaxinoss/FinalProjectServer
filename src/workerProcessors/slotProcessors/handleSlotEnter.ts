import type { Job } from "bullmq";
import { ParkingSlot } from "../../mongo_Models/parkingSlot.js";
import { AlertSeverity, AlertType, SlotStatus } from "../../types/parkingEventTypes.js";
import { prisma } from "../../routes/clientRoutes/routes.js";
import { ParkingSessionStatus, SlotType } from "../../src/generated/prisma/index.js"; // Import SlotType
import { sessionLifecycleQueue } from "../../queues/queues.js"; // Corrected import
import { Alert } from "../../mongo_Models/alert.js";
import { sendPushNotification } from "../../services/notifications.js";

import { findSafeAlternativeSlot } from "../Helpers/helpers.js";
import { OCCUPANCY_CHECK_DELAY_AFTER_ENTRY } from "../../constants/constants.js";
import { getAvailableEmergencySlotId } from "./getEmergencySlots.js";

export const handleSlotEnter = async (slot_id: string, plate_number: string | null, timestamp: any) => { // plate_number can be null

    // If no plate number detected, we can't do much matching, maybe just log or create a basic alert
    if (!plate_number) {
        console.warn(`🅿️ Slot ${slot_id} occupied, but no plate number detected.`);
        // Optionally update slot to OCCUPIED without vehicle details, or create an alert
        await ParkingSlot.updateOne({ _id: slot_id }, { $set: { status: SlotStatus.OCCUPIED, 'current_vehicle': null } });
        await Alert.create({
            alert_type: AlertType.CAMERA_OFFLINE,
            title: 'Occupancy Without Plate',
            description: `Slot ${slot_id} became occupied but no license plate was detected.`,
            severity: AlertSeverity.LOW,
            timestamp: new Date(timestamp),
            details: { slotId: slot_id }
        });
        return; // Exit early
    }

    // Use lean() for performance if not modifying the object directly after fetching
    const TargetSlot = await ParkingSlot.findById(slot_id).lean();
    const eventTimestamp = new Date(timestamp); // Ensure it's a Date object

    if (!TargetSlot) {
        console.error(`❌ handleSlotEnter: Couldn't find slot ID [${slot_id}] sent with the event.`);
        // Maybe create a critical alert here?
        throw new Error(`Slot ID [${slot_id}] not found in MongoDB.`);
    }

    switch (TargetSlot.status) {
        // --- Case 1: Slot was ASSIGNED (Expected Scenario or Conflict) ---
        case SlotStatus.ASSIGNED:

            // --- Subcase 1.1: Correct Vehicle Arrived ---
            if (TargetSlot.current_vehicle.plate_number === plate_number) {
                console.log(`✅ Correct vehicle ${plate_number} reached assigned slot ${slot_id}.`);

                // Update MongoDB: Set as OCCUPIED, record actual occupancy time
                await ParkingSlot.updateOne(
                    { _id: slot_id },
                    {
                        $set: {
                            status: SlotStatus.OCCUPIED,
                            'current_vehicle.occupied_since': eventTimestamp
                        },
                        $inc: { 'stats.total_uses_today': 1 }
                    }
                );

                // Cancel the occupancy check job (no longer needed)
                try {
                    const session = await prisma.parkingSession.findFirst({
                        where: { slotId: slot_id, status: ParkingSessionStatus.ACTIVE },
                        select: { id: true, occupancyCheckJobId: true }
                    });
                    if (session?.occupancyCheckJobId) {
                        const occupancyJob = await sessionLifecycleQueue.getJob(session.occupancyCheckJobId);
                        if (occupancyJob) {
                            await occupancyJob.remove();
                            console.log(`🧹 Removed occupancy check job ${session.occupancyCheckJobId} for session ${session.id}.`);
                        }
                    } else {
                        console.warn(`No active session or occupancy check job ID found for slot ${slot_id} to remove the check job.`);
                    }
                } catch (error) {
                    console.error(`Error removing occupancy check job for slot ${slot_id}:`, error);
                }

            }
            // --- Subcase 1.2: WRONG Vehicle Entered Assigned Slot ---
            else {
                const expectedPlate = TargetSlot.current_vehicle.plate_number;
                console.warn(`🚨 WRONG VEHICLE! Vehicle ${plate_number} entered slot ${slot_id}, which was assigned to ${expectedPlate}.`);

                try {

                    // 1. Create Alert for Dashboard
                    await Alert.create({
                        alert_type: AlertType.SLOT_CONFLICT,
                        title: 'Wrong Slot Occupied',
                        description: `Vehicle [${plate_number}] occupied slot [${slot_id}] which was assigned to vehicle [${expectedPlate}].`,
                        severity: AlertSeverity.HIGH,
                        timestamp: eventTimestamp,
                        details: {
                            slotId: slot_id,
                            detectedPlate: plate_number,
                            expectedPlate: expectedPlate,
                            assignedSessionId: TargetSlot.current_vehicle.reservation_id // Assuming this holds session/reservation ID
                        }
                    });

                    // 2. Update MongoDB: Mark Slot as CONFLICTED
                    await ParkingSlot.updateOne({ _id: slot_id }, {
                        $set: {
                            status: SlotStatus.CONFLICT, // <-- Set conflict state
                            'current_vehicle.plate_number': plate_number, // Store actual plate
                            'current_vehicle.occupied_since': eventTimestamp, // Store actual time
                            'conflict_details': { // Store expected info
                                expected_plate: expectedPlate,
                                assigned_session_id: TargetSlot.current_vehicle.reservation_id
                            }
                        },
                        $inc: { 'stats.total_uses_today': 1 } // Still counts as a use
                    });
                    console.log(`🚩 Slot ${slot_id} marked as CONFLICTED. Actual: ${plate_number}, Expected: ${expectedPlate}.`);


                    // 2.1 the slot that the occupier has Assigned but didn't go for it 


                    const violatorVehicle = await prisma.vehicle.findUnique({ where: { plate: plate_number } });

                    if (violatorVehicle) {
                        const violatorSession = await prisma.parkingSession.findFirst({
                            where: { vehicleId: violatorVehicle.id, status: ParkingSessionStatus.ACTIVE },
                            select: { id: true, slotId: true, occupancyCheckJobId: true } // هات المكان الأصلي والجوب
                        });

                        if (violatorSession && violatorSession.slotId && violatorSession.slotId !== slot_id) {

                            await ParkingSlot.updateOne({
                                _id: violatorSession.slotId,
                                status: SlotStatus.ASSIGNED,
                            }, {
                                $set: {
                                    status: SlotStatus.AVAILABLE,
                                    current_vehicle: null
                                }
                            })
                            //make it even available before the affected person search for another slot so it can be possible that he finds it
                            console.log(`🧹 Freed original slot ${violatorSession.slotId} for violator session ${violatorSession.id}.`);

                            await prisma.parkingSession.updateMany({ where: { id: violatorSession?.id }, data: { involvedInConflict: true } });

                            console.log(`Marked session for violating vehicle ${plate_number} as involvedInConflict.`);

                        }
                    } else {
                            console.log(`couldn't mark the violated session ${plate_number}  as involvedInConflict `)
                        throw new Error(`couldn't mark the violated session ${plate_number}  as involvedInConflict `)
                    }


                    // 3. Attempt to rescue the affected user (Victim 'A')
                    const affectedUserSession = await prisma.parkingSession.findFirst({
                        where: { slotId: slot_id, status: ParkingSessionStatus.ACTIVE },
                        include: {
                            user: { select: { id: true /*, pushToken: true*/ } },
                            vehicle: { select: { plate: true } }
                        },
                    });

                    if (!affectedUserSession || !affectedUserSession.user || affectedUserSession.vehicle.plate !== expectedPlate) {
                        // If the session found doesn't match expected plate, log inconsistency but proceed cautiously
                        console.error(`CRITICAL INCONSISTENCY during conflict: Slot ${slot_id} assigned to ${expectedPlate}, but found ACTIVE session ${affectedUserSession?.id} for plate ${affectedUserSession?.vehicle.plate}. Alert created, but cannot reliably redirect.`);
                        // Maybe update the Alert created earlier with session ID if found?
                        break; // Exit case, manual intervention needed via alert
                    }

                    // --- Rescue Logic ---
                    let newSlotId: string | null = null;
                    let notificationTitle = "";
                    let notificationBody = "";
                    let notificationData: object = {};

                    // Cancel the original occupancy check job regardless
                    if (affectedUserSession.occupancyCheckJobId) {
                        const oldOccupancyJob = await sessionLifecycleQueue.getJob(affectedUserSession.occupancyCheckJobId);
                        if (oldOccupancyJob) {
                            await oldOccupancyJob.remove();
                            console.log(`🧹 Removed OLD occupancy check job ${affectedUserSession.occupancyCheckJobId} for conflicted session ${affectedUserSession.id}.`);
                        }
                    }

                    const safeAlternativeSlot = await findSafeAlternativeSlot();

                    if (safeAlternativeSlot) {
                        newSlotId = safeAlternativeSlot.id;
                        console.log(`Found alternative slot ${newSlotId} for affected session ${affectedUserSession.id}.`);

                        // Assign the new slot in MongoDB
                        await ParkingSlot.updateOne({ _id: newSlotId }, {
                            $set: {
                                status: SlotStatus.ASSIGNED,
                                current_vehicle: {
                                    plate_number: affectedUserSession.vehicle.plate,
                                    occupied_since: null,
                                    reservation_id: affectedUserSession.reservationId?.toString()
                                }
                            }
                        });

                        // Schedule NEW occupancy check for the ALTERNATIVE slot
                        const newOccupancyCheckJob = await sessionLifecycleQueue.add(
                            'check-actual-occupancy',
                            { parkingSessionId: affectedUserSession.id },
                            { delay: OCCUPANCY_CHECK_DELAY_AFTER_ENTRY }
                        );
                        console.log(`✨ Scheduled NEW occupancy check job ${newOccupancyCheckJob.id} for redirected session ${affectedUserSession.id} to slot ${newSlotId}.`);


                        // Prepare notification
                        notificationTitle = "🔄 Your Parking Slot has changed";
                        notificationBody = `Apologies! Your original slot ${slot_id} was occupied by mistake. You have been redirected to slot ${newSlotId}.`;
                        notificationData = { screen: 'SessionDetails', newSlotId: newSlotId };

                        // Update Prisma Session with new slot and new job ID
                        await prisma.parkingSession.update({
                            where: { id: affectedUserSession.id },
                            data: {
                                slotId: newSlotId,
                                occupancyCheckJobId: newOccupancyCheckJob.id! // Store the NEW job ID
                            }
                        });




                    } else {
                        // No safe alternative, search for emergency
                        const emergencySlotId = await getAvailableEmergencySlotId();
                        if (emergencySlotId) {
                            newSlotId = emergencySlotId;
                            console.log(`Found available emergency slot ${emergencySlotId} for affected session ${affectedUserSession.id}.`);

                            // Assign emergency slot in MongoDB
                            await ParkingSlot.updateOne({ _id: emergencySlotId }, {
                                $set: {
                                    status: SlotStatus.ASSIGNED,
                                    current_vehicle: {
                                        plate_number: affectedUserSession.vehicle.plate,
                                        occupied_since: null,
                                        reservation_id: affectedUserSession.reservationId?.toString()
                                    }
                                }
                            });

                            // Prepare notification
                            notificationTitle = "⚠️ Redirected to Emergency Slot";
                            notificationBody = `Your original slot ${slot_id} is occupied, and no alternatives are free. Please proceed to emergency slot ${emergencySlotId}.`;
                            notificationData = { screen: 'SessionDetails', newSlotId: emergencySlotId };

                            // Update Prisma Session ONLY with new slot ID (NO occupancy check job for emergency)
                            await prisma.parkingSession.update({
                                where: { id: affectedUserSession.id },
                                data: {
                                    slotId: emergencySlotId,
                                    occupancyCheckJobId: null // Explicitly clear/nullify occupancy check
                                }
                            });

                        } else {
                            // No alternative, no emergency
                            console.error(`‼️ CRITICAL: No alternative or emergency slots available for affected session ${affectedUserSession.id}.`);
                            notificationTitle = "⚠️ Critical Parking Issue!";
                            notificationBody = `Your original slot ${slot_id} is occupied, and NO alternative or emergency slots are available. Please contact support immediately.`;
                            notificationData = { screen: 'EmergencyHelp' };
                            // Optional: Update session status
                            // await prisma.parkingSession.update({ where: { id: affectedUserSession.id }, data: { status: ParkingSessionStatus.CONFLICT } });
                        }
                    }

                    // Send the prepared notification
                    // await sendPushNotification(
                    //     affectedUserSession.userId,
                    //     notificationTitle,
                    //     notificationBody,
                    //     notificationData
                    // );



                    // Optional: Mark the affected user's session too
                    // await prisma.parkingSession.update({ where: { id: affectedUserSession.id }, data: { involvedInConflict: true }});


                } catch (error) {
                    console.error(`Error handling affected user for slot conflict at ${slot_id}:`, error);
                    // Let the error propagate so the job fails if rescue fails critically
                    throw error;
                }
            }
            break;

        // --- Case 2: Car entered an AVAILABLE slot ---
        case SlotStatus.AVAILABLE:
            console.warn(`🅿️ UNAUTHORIZED PARKING! Vehicle ${plate_number} entered AVAILABLE slot ${slot_id}.`);
            await Alert.create({
                alert_type: AlertType.SLOT_CONFLICT,
                title: 'Wrong Available Slot Occupied',
                description: `Vehicle [${plate_number}] occupied slot [${slot_id}] which was Available and not Assigned.`,
                severity: AlertSeverity.HIGH,
                timestamp: eventTimestamp,
                details: {
                    slotId: slot_id,
                    detectedPlate: plate_number,
                }
            });

            await ParkingSlot.updateOne(
                { _id: slot_id },
                {
                    $set: {
                        status: SlotStatus.OCCUPIED,
                        current_vehicle: {
                            plate_number: plate_number,
                            occupied_since: eventTimestamp,
                            reservation_id: null,
                            // is_unauthorized: true // Optional flag
                        }
                    },
                    $inc: { 'stats.total_uses_today': 1 }
                }
            );
            break;

        // --- Case 3: Handling Duplicates / Weird States ---
        case SlotStatus.OCCUPIED:
            if (TargetSlot.current_vehicle?.plate_number === plate_number) {
                console.log(`🔄 Duplicate OCCUPIED event for vehicle ${plate_number} in slot ${slot_id}. Ignoring.`);
            } else {
                console.error(`‼️ CRITICAL STATE! Vehicle ${plate_number} detected entering slot ${slot_id} already OCCUPIED by ${TargetSlot.current_vehicle?.plate_number}.`);
                await Alert.create({
                    alert_type: AlertType.SLOT_CONFLICT,
                    title: 'Impossilbe scenario how occupied an occupied slot',
                    description: `Vehicle [${plate_number}] occupied slot [${slot_id}] which was already occupied, should never happen`,
                    severity: AlertSeverity.HIGH,
                    timestamp: eventTimestamp,
                    details: {
                        slotId: slot_id,
                        detectedPlate: plate_number,
                    }
                });
            }
            break;

        // --- Case 4: CONFLICTED slot (Maybe ignore new entries?) ---
        case SlotStatus.CONFLICT:
            console.warn(` Vehicle ${plate_number} attempted to enter slot ${slot_id} which is already in CONFLICTED state. Ignoring event.`);
            // Or create another alert? For now, ignoring seems safest.
            break;


        case SlotStatus.MAINTENANCE:
        case SlotStatus.DISABLED: // لو بتستخدم الحالة دي
            console.error(`‼️ VIOLATION! Vehicle ${plate_number} entered slot ${slot_id} which is marked as ${TargetSlot.status}.`);
            // 1. إنشاء Alert عالي الأهمية
            await Alert.create({
                alert_type: AlertType.VIOLATION,
                title: `Entry into ${TargetSlot.status} Slot`,
                description: `Vehicle [${plate_number}] entered slot [${slot_id}] which is currently marked as ${TargetSlot.status}.`,
                severity: AlertSeverity.CRITICAL,
                timestamp: eventTimestamp,
                details: {
                    slotId: slot_id,
                    detectedPlate: plate_number,
                    slotStatus: TargetSlot.status
                }
            });
            // 2. ‼️ لا تغير حالة المكان في MongoDB ‼️
            // لازم يفضل MAINTENANCE أو DISABLED عشان المشكلة الأصلية متتنسيش
            break;


        default:
            // أي حالة تانية غير متوقعة
            console.warn(`Unhandled slot status [${TargetSlot.status}] for OCCUPIED event at slot ${slot_id}.`);
            await Alert.create({
                alert_type: AlertType.VIOLATION,
                title: 'Unhandled Slot Status on Entry',
                description: `Vehicle [${plate_number}] entered slot [${slot_id}] which had an unexpected status: ${TargetSlot.status}.`,
                severity: AlertSeverity.CRITICAL,
                timestamp: eventTimestamp,
                details: {
                    slotId: slot_id,
                    detectedPlate: plate_number,
                    slotStatus: TargetSlot.status
                }
            });
            break;
    }
};