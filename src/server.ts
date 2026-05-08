import express from "express";
import type { Application } from "express";
import { config } from "./configs/index.js";
import { createServer } from "http";
import { connectRedis, getRedisClient } from "./db&init/redis.js";
import { mongoConnect } from "./db&init/mongo.js";
import { connectMQTT } from "./db&init/mqtt.js";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { gateQueue, paymentQueue, sessionLifecycleQueue, slotEventQueue, systemQueue } from "./queues/queues.js";
import { ExpressAdapter } from "@bull-board/express";
import "dotenv/config";
import { getSocketServer, initSocket } from "./db&init/socket.js";
import mainRouter from "./routes/realRouters.js";
import { createEmitters } from "./db&init/redisWorkerEmitterWithClient.js";
import cors from 'cors'
import webHookRouter from './webhooks/webHookRoute.js'

const app: Application = express();
const httpServer = createServer(app);
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/admin/queues");
const corsOptions = {
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning'],
};

app.use(cors(corsOptions));

app.use('/webhooks', webHookRouter)

app.use(express.json());

await mongoConnect();
// await connectMySQL();
// await getMySQLPool();


// await prisma.paymentTransaction.deleteMany();
// await prisma.parkingSession.deleteMany();
// await prisma.reservation.deleteMany();
// await prisma.vehicle.deleteMany();
// await prisma.parkingSlot.deleteMany();
// await prisma.user.deleteMany();
// console.log('database do ne')

await connectMQTT();
await connectRedis(); // new Redis.Redis === 1 + get Method
await getRedisClient(); // the same client as above from the get Method
initSocket(httpServer) // redis.duplicate() new Redis.Redis === 2 + attach the adapter with the socket server
createEmitters(); // create Emitter with the same client as above from the get Method


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


app.use('/api', mainRouter);


app.get('/sayhi', (req, res) => {
    res.send('Hello from our parking system Api ^^');
})




httpServer.listen(config.port, () => {
    console.log(`Server running on port ${config.port} at http://localhost:${config.port}`);
    const socketIO = getSocketServer()
    if (socketIO) {
        console.log("✅ Socket.io Engine is attached and waiting for connections.");
    }
});

