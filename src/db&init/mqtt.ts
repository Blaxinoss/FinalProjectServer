import mqtt from "mqtt";
import { config } from "../configs/index.js";
import { gateQueue, slotEventQueue, systemQueue } from "../queues/queues.js";
import { getSocketServer } from "./socket.js";
import { VERIFYING_PLATE_GATE_ENTRY } from "../constants/constants.js";

let client: mqtt.MqttClient;
let isSubscribed = false; //


export const connectMQTT = () => {
  if (client && client.connected) {
    console.log("MQTT client already connected");
    return client;
  }

  client = mqtt.connect(config.mqttBroker, config.mqttOptions);

  client.on("connect", () => {
    console.log("✅ MQTT connected successfully");

    // ⭐ اعمل subscribe مرة واحدة بس
    if (!isSubscribed) {
      // ❌ امسح الـ duplicate: مش محتاج الاتنين!
      client.subscribe("garage/#", (err) => {
        if (err) {
          console.error("❌ Subscribe error:", err);
        } else {
          console.log("📡 Subscribed to garage/# topic");
          isSubscribed = true; // ⭐ علّم إننا عملنا subscribe
        }
      });
    }
  });

  client.on("message", async (topic, payload) => {

    console.log(`📩 Message received on topic ${topic}`);
    const payloadStr = payload.toString();

    try {
      const parsed = JSON.parse(payloadStr);

      if (topic.includes("raspberry-status")) {
        console.log("🍓 RaspberryStatus message -> system-queue");
        // Add to system queue (if you created it)
        await systemQueue.add("raspberry-status", parsed);

        // } else if (topic.includes("parking-event")) {
        //   console.log("🚗 ParkingEvent message -> slot-event-queue");
        //   // Add to slot event queue
        //   await slotEventQueue.add("ParkingEvent", parsed);

      } else if (topic === "garage/gate/entry/request") {
        const socketServer = getSocketServer()

        console.log("🚪 Gate Entry Request message -> gate-queue");
        // Add to gate queue
        if (parsed.plateNumber) {
          socketServer.to(`user_${parsed.plateNumber}`).emit(VERIFYING_PLATE_GATE_ENTRY, {
            status: "VERIFYING",
            plate: parsed.plateNumber,
          })
        }
        await gateQueue.add("gate-event-entry-request", parsed);

      }
      else if (topic === "garage/slots/event") {
        console.log("📍 Slot Event Request message -> slot-event-queue");
        await slotEventQueue.add('slot-event', parsed, { priority: 3 });
      }
      else if (topic === "garage/gate/exit/request") {
        console.log("🚪 Gate Entry Request message -> gate-queue");
        await gateQueue.add("gate-event-exit-request", parsed);

      }



    } catch (err: any) {
      console.error("❌ Failed to parse MQTT payload:", err.message);
      console.error("Raw payload:", payloadStr);
    }
  });

  client.on("error", (err) => {
    console.error("🚨 MQTT connection error:", err);
  });

  client.on("reconnect", () => {
    console.log("🔄 MQTT Reconnecting...");
  });

  client.on("offline", () => {
    console.log("zzz MQTT Client Offline");
  });

  // ⭐ لو الـ connection انقطع، reset الـ flag
  client.on("close", () => {
    console.log("⚠️ MQTT connection closed");
    isSubscribed = false;
  });

  return client;
};

export const getMQTTClient = () => {
  if (client) {
    return client;
  } else {
    throw new Error(
      "MQTT client not initialized. Did you call connectMQTT() first?"
    );
  }
};