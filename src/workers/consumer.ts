// consumer.ts OR workers/index.ts (main worker file)

import { Job, Worker } from "bullmq";
import { connection } from "../services/index.js"; // Your Redis connection
import { mongoConnect } from "../db&init/mongo.js";
import mqtt from "mqtt";
import { config } from "../configs/index.js";

// --- Import your actual processor functions ---
// You need to create these files/functions based on our previous logic
import { handleGateEntryRequest } from "../workerProcessors/gateProcessors/handleGateEventRequest.js";
import { handleDeviceStatus } from "../workerProcessors/systemProcessors/deviceStatusHandlers.js";
import {  handleGracePeriodExpiry } from "../workerProcessors/sessionProcessors/handleGracePeriodExpiry.js";
import { handleSessionExpiry } from "../workerProcessors/sessionProcessors/handleSessionExpiry.js";
import { handleSlotEvent } from "../workerProcessors/slotProcessors/handleSlotEvent.js";
import { handlePayment } from "../workerProcessors/paymentProcessors/handlePayment.js";
import { connectRedis } from "../db&init/redis.js";
import { handleGateExitRequest } from "../workerProcessors/gateProcessors/handleGateExitRequest.js";
// import { handlePayment } from "./workerProcessors/paymentProcessor.js"; // Assuming you have this

export const redisWorker = await connectRedis();

// --- Initialize DBs and MQTT ---
await mongoConnect();
const client = mqtt.connect(config.mqttBroker, config.mqttOptions);

client.on("connect", () => {
    console.log("✅ MQTT connected successfully inside Worker");
    // Subscribe to topics if needed within the worker itself
    client.subscribe("garage/#"); // Example
    console.log('📡 Subscribed to garage/# topic')
});

client.on("error", (err) => {
    console.error("MQTT connection error in Worker:", err);
});

// Function to safely get MQTT client
export const getMQTTClient_IN_WORKER = () => {
    if (client && client.connected) {
        return client;
    } else {
        // Consider attempting reconnection or throwing a more specific error
        console.error("MQTT client not ready in Worker.");
        // Returning client anyway, but caller should check .connected
        return client;
        // Or: throw new Error("MQTT client not connected in Worker.");
    }
};

console.log("Initializing BullMQ Workers...");

// --- Define Workers for each Queue with Priorities ---

const gateWorker = new Worker('gate-queue', async (job: Job) => {
    if (job.name === 'gate-event-entry-request') {
        return handleGateEntryRequest(job); // From gateProcessor.js
    }else if(job.name ==='gate-event-exit-request'){
        return handleGateExitRequest(job)
    }
    // Handle other job names if any in this queue
}, {
    connection,
    concurrency: 5, // Allow juggling multiple gate requests
});

const slotEventWorker = new Worker('slot-event-queue', async (job: Job) => {
    if (job.name === 'slot-event') {
        return handleSlotEvent(job)
    }
    // Handle other job names if any
}, {
    connection,
    concurrency: 5,
});

const sessionLifecycleWorker = new Worker('session-lifecycle-queue', async (job: Job) => {
    if (job.name === 'check-session-expiry') {
        return handleSessionExpiry(job); // From sessionProcessor.js
    } else if (job.name === 'check-grace-period-expiry') {
        return handleGracePeriodExpiry(job); // From sessionProcessor.js
    }
    // Handle other job names if any
}, {
    connection,
    concurrency: 5,
    
});

const paymentWorker = new Worker('payment-queue', async (job: Job) => {
    // Assuming one job type for now
    return handlePayment(job); // From paymentProcessor.js
}, {
    connection,
    concurrency: 2, // Payment might involve external APIs, lower concurrency can be safer
});

const systemWorker = new Worker('system-queue', async (job: Job) => {
    if (job.name === 'raspberry-status') {
        return handleDeviceStatus(job); // From slotEventProcessor.js or a dedicated systemProcessor.js
    }
}, {
    connection,
    concurrency: 1, // System tasks might be less frequent
});

// --- Generic Event Listeners (Apply to all workers) ---
const workers = [gateWorker, slotEventWorker, sessionLifecycleWorker, paymentWorker, systemWorker];

workers.forEach(worker => {
    worker.on('ready', () => {
        console.log(`🚦 Worker [${worker.name}] is ready.`);
    });
    worker.on('active', (job) => {
        console.log(`⚡ Worker [${worker.name}] started job ${job.id} (${job.name})`);
    });
    worker.on('completed', (job, result) => {
        const duration = job?.finishedOn && job?.processedOn ? ((job.finishedOn - job.processedOn) / 1000).toFixed(2) : "?";
        console.log(`✅ Worker [${worker.name}] finished job ${job.id} (${job.name}) in ${duration}s.`); // Result might be large, log selectively if needed
    });
    worker.on('failed', (job, err) => {
        console.error(`❌ Worker [${worker.name}] failed job ${job?.id} (${job?.name}):`, err.message);
    });
    worker.on('error', err => {
        console.error(`🚨 Worker [${worker.name}] reported an error:`, err.message);
    });
    worker.on('stalled', (jobId) => {
        console.warn(`⚠️ Worker [${worker.name}] job ${jobId} stalled!`);
    });
});

console.log("🚀 All workers initialized and listening...");

// Keep the process alive (important for workers)
process.on('SIGINT', async () => {
    console.log('Shutting down workers...');
    await Promise.all(workers.map(w => w.close()));
    await client.endAsync(); // Close MQTT connection
    await connection.quit(); // Close Redis connection
    console.log('Workers shut down.');
    process.exit(0);
});