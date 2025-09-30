import dotenv from "dotenv";
dotenv.config({})
console.log('read')


export const config = {
    port: process.env.PORT || 5000,
    mongoUri: process.env.MONGO_URI || "",
    mysql: {
        host: process.env.MYSQL_HOST || "localhost",
        user: process.env.MYSQL_USER || "root",
        password: process.env.MYSQL_PASSWORD || "",
        database: process.env.MYSQL_DB || "garage",
    },
    jwtSecret: process.env.JWT_SECRET || "secret",
    redis: {
        host: process.env.REDIS_HOST || "127.0.0.1",
        port: Number(process.env.REDIS_PORT) || 6379,
    },
    mqttBroker: process.env.MQTT_BROKER_URL || "mqtt://localhost",
};