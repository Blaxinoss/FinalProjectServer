import express from "express";
import type { Application } from "express";
import { config } from "./configs/index.js";
import routes from './routes/routes.js';
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { connectRedis, getRedisClient } from "./db&init/redis.js";
import { mongoConnect } from "./db&init/mongo.js";
import { connectMySQL, getMySQLPool } from "./db&init/mysql.js";
import { connectMQTT } from "./db&init/mqtt.js";

const app: Application = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer);
app.use(express.json());
app.use("/api", routes);

await mongoConnect();
await connectMySQL();
const pool = getMySQLPool();

const mqttClient = connectMQTT();
const redisClient = connectRedis();
const client = getRedisClient();



io.on("connection", (socket) => {
    console.log("Socket connected:", socket.id);
    socket.on("disconnect", () => console.log("Socket disconnected:", socket.id));
});

httpServer.listen(config.port, () => {
    console.log(`Server running on port ${config.port}`);
});
