import express from "express";
import type { Application } from "express";
import { config } from "./configs/index.js";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { connectRedis, getRedisClient } from "./db&init/redis.js";
import { mongoConnect } from "./db&init/mongo.js";
import { connectMySQL, getMySQLPool } from "./db&init/mysql.js";
import { connectMQTT } from "./db&init/mqtt.js";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import {gateQueue,paymentQueue,sessionLifecycleQueue,slotEventQueue,systemQueue } from "./queues/queues.js";
import { ExpressAdapter } from "@bull-board/express";

const app: Application = express();
const httpServer = createServer(app);
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/admin/queues");

const io = new SocketIOServer(httpServer);
app.use(express.json());

await mongoConnect();
await connectMySQL();
const pool = await getMySQLPool();

const mqttClient = await connectMQTT();
const redisClient = await connectRedis();
const client = await getRedisClient();

import mainRouter from "./routes/realRouters.js";
import { prisma } from "./routes/prsimaForRouters.js";
import { userRole } from "../src/generated/prisma/index.js";


createBullBoard({
  queues: [new BullMQAdapter(systemQueue),
    new BullMQAdapter(slotEventQueue),
    new BullMQAdapter(paymentQueue),
    new BullMQAdapter(gateQueue),
        new BullMQAdapter(sessionLifecycleQueue)


  ],
  serverAdapter,
});

app.use("/admin/queues", serverAdapter.getRouter());

// app.use('/', (req, res) => {
//     res.send('Welcome to the Parking Management System API');
// });

app.use('/api', mainRouter);

if(await prisma.user.findUnique({where:{email:"abdullahismael078@gmail.com"}})===null){
let res = await prisma.user.create({
    data:{
        name:"Test User",
        email:"abdullahismael078@gmail.com",
        phone:"01022223333",
        NationalID:"12345678901234",
        address:"123 Test St, Test City",
        licenseNumber:"D1234567",
        licenseExpiry:new Date("2030-12-31"),
        role:userRole.ADMIN,
        uuid:"ekE0K8svqrXptFhCyfSoZcig7ko2",
    }
})
}

io.on("connection", (socket) => {
    console.log("Socket connected:", socket.id);
    socket.on("disconnect", () => console.log("Socket disconnected:", socket.id));
});

httpServer.listen(config.port, () => {
    console.log(`Server running on port ${config.port} at http://localhost:${config.port}`);
});
