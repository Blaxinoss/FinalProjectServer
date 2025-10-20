import { Job, Worker } from "bullmq";
import { parkingEventProcessor } from "../workerProcessors/parkingEventProcessor.js";
import { connection } from "../services/index.js";
import { mongoConnect } from "../db&init/mongo.js";
import mqtt from "mqtt";

import { config } from "../configs/index.js";

await mongoConnect();
const client = await mqtt.connect(config.mqttBroker, config.mqttOptions).on("connect", () => {
    console.log("✅ MQTT connected successfully inside Worker");
});

export const getMQTTClient_IN_WORKER = () => {
  if (client) {
    return client;
  } else {
    throw new Error(
      "MQTT client not initialized.INside the worker Did you call connectMQTT() first?"
    );
  }
};


const parkingEventWorker = new Worker('ParkingEventQueue',parkingEventProcessor,{
    connection,
    concurrency:1
})

parkingEventWorker.on('ready',()=>{
    console.log('🚗 Parking Event Worker is ready and listening for jobs...');
})

parkingEventWorker.on("active", (job: Job) => {
  console.log(`🚗 Parking Event worker started on job ${job?.id}`);
});

parkingEventWorker.on("completed", (job: Job, res) => {
  const duration =
    job?.finishedOn && job?.processedOn
      ? ((job.finishedOn - job.processedOn) / 1000).toFixed(2)
      : "undefined";

  console.log(
    `✅ parking Event Worker finished job ${job.id} in ${duration !== "undefined" ? duration + "s" : "unknown time"} with result: ${res}`
  );
});


parkingEventWorker.on("failed", (job: Job | undefined, err: any) => {
  console.error(`❌ Parking Event job ${job?.id} failed with error: ${err.message}`);
});

parkingEventWorker.on("stalled", (jobId) => {
  console.warn(`⚠️ Parking Event job ${jobId} got stalled!`);
});

parkingEventWorker.on("error", (err: any) => {
  console.error(`🚨 Error connecting to the Parking Event Worker: ${err.message}`);
});






// const paymentWorker = new Worker('PaymentQueue',paymentSessionProcessor,{
//     connection,
//     concurrency:1,
// })


// paymentWorker.on("active", (job: Job) => {
//   console.log(`💰 Payment Worker started on job ${job?.id}`);
// });

// paymentWorker.on("completed", (job: Job, res) => {
//   const duration =
//     job?.finishedOn && job?.processedOn
//       ? ((job.finishedOn - job.processedOn) / 1000).toFixed(2)
//       : "undefined";

//   console.log(
//     `✅ payment Worker finished job ${job.id} in ${duration !== "undefined" ? duration + "s" : "unknown time"} with result: ${res}`
//   );
// });

// paymentWorker.on("failed", (job: Job | undefined, err: any) => {
//   console.error(`❌ Payment job ${job?.id} failed with error: ${err.message}`);
// });

// paymentWorker.on("stalled", (jobId) => {
//   console.warn(`⚠️ Payment job ${jobId} got stalled!`);
// });

// paymentWorker.on("error", (err: any) => {
//   console.error(`🚨 Error connecting to the Payment Worker: ${err.message}`);
// });






// const parkingSessionWorker = new Worker('ParkingSessionQueue',parkingSessionProcessor,{
//     connection,
//     concurrency:1
// })

// parkingSessionWorker.on("active", (job: Job) => {
//   console.log(`🚗 Parking Session worker started on job ${job?.id}`);
// });

// parkingSessionWorker.on("completed", (job: Job, res) => {
//   const duration =
//     job?.finishedOn && job?.processedOn
//       ? ((job.finishedOn - job.processedOn) / 1000).toFixed(2)
//       : "undefined";

//   console.log(
//     `✅ parking Session Worker finished job ${job.id} in ${duration !== "undefined" ? duration + "s" : "unknown time"} with result: ${res}`
//   );
// });


// parkingSessionWorker.on("failed", (job: Job | undefined, err: any) => {
//   console.error(`❌ Parking Session job ${job?.id} failed with error: ${err.message}`);
// });

// parkingSessionWorker.on("stalled", (jobId) => {
//   console.warn(`⚠️ Parking Session job ${jobId} got stalled!`);
// });

// parkingSessionWorker.on("error", (err: any) => {
//   console.error(`🚨 Error connecting to the Parking Session Worker: ${err.message}`);
// });
