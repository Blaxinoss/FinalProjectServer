import dotenv from "dotenv";
import path from "path";
import fs from 'fs';
dotenv.config({})
import { fileURLToPath } from 'url';
import type { IClientOptions } from "mqtt";

// عشان نعرف مسار الملف الحالي (index.ts)

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const CERT_DIR = path.join(__dirname, '../certs');
export const config = {
    port: process.env.PORT || 3000,
    mongoUri: process.env.MONGO_URL || "mongodb://localhost:27017/garage",
    mysql: {
        host: process.env.MYSQL_HOST || "localhost",
        user: process.env.MYSQL_USER || "root",
        password: process.env.MYSQL_PASSWORD || "",
        database: process.env.MYSQL_DB || "garage",
    },
    jwtSecret: process.env.JWT_SECRET || "secret",
    redis: {
        host: process.env.REDIS_HOST || "my-redis-queue",
        port: Number(process.env.REDIS_PORT) || 6379,
    },
 mqttBroker:`mqtts://${process.env.AWS_MQTT_ENDPOINT}`,
  mqttOptions: <IClientOptions>{
    key: fs.readFileSync(path.join(CERT_DIR,'610e9ceefe0c8e1c6207671f035f5b47a9a94f92fc33ce0f3778d8525c6ccf97-private.pem.key')),
    cert: fs.readFileSync(path.join(CERT_DIR,'610e9ceefe0c8e1c6207671f035f5b47a9a94f92fc33ce0f3778d8525c6ccf97-certificate.pem.crt')),
    ca: fs.readFileSync(path.join(CERT_DIR,'AmazonRootCA1.pem')),
    clientId: `BackendServer`,
    clean: true,
    protocolId:'MQTT',
    reconnectPeriod: 5000,
    port: 8883,
    connectTimeout: 30000,
    rejectUnauthorized:true,
    keepalive: 60,
  },};