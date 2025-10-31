// queues/index.ts
import { Queue } from "bullmq";
import { connection } from '../services/index.js'; // Assuming connection is your IORedis instance

// Consistent names (kebab-case)
export const gateQueue = new Queue('gate-queue', {
    connection,
    defaultJobOptions: { removeOnComplete: 5, removeOnFail: 50 },
});

export const slotEventQueue = new Queue('slot-event-queue', {
    connection,
    defaultJobOptions: { removeOnComplete: 5, removeOnFail: 50 },
});

// Rename ParkingEventQueue to sessionLifecycleQueue for clarity
export const sessionLifecycleQueue = new Queue('session-lifecycle-queue', {
    connection,
    defaultJobOptions: { removeOnComplete: 5, removeOnFail: 50 },
});

export const systemQueue = new Queue('system-queue', {
    connection,
    defaultJobOptions: { removeOnComplete: 5, removeOnFail: 50 },
});

export const paymentQueue = new Queue('payment-queue', { // Renamed PaymentQueue to paymentQueue
    connection,
    defaultJobOptions: {
        // attempts: 5,
        // backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: 10,
        removeOnFail: 100,
    }
});

console.log('BullMQ Queues initialized:', [
    gateQueue.name,
    slotEventQueue.name,
    sessionLifecycleQueue.name,
    systemQueue.name,
    paymentQueue.name,
].join(', '));