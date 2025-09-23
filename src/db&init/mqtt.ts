import mqtt from "mqtt";
import { config } from "../configs/index.js";

export const connectMQTT = () => {
    const client = mqtt.connect(config.mqttBroker);

    client.on("connect", () => console.log("MQTT connected"));

    client.on("error", (err) => {
        console.error("MQTT connection error:", err);
        client.end();
        process.exit(1);
    });

    return client;
};
