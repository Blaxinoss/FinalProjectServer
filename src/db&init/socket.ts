
import type { Server as HttpServer } from "http";
import { Server } from "socket.io";
import { getRedisClient } from "./redis.js";
import { createAdapter } from "@socket.io/redis-adapter";


let socketServer: Server;

export async function initSocket(server: HttpServer) {


    const PubClient = await getRedisClient();
    const SubClient = PubClient.duplicate();

    socketServer = new Server(server, {
        cors: {
            origin: "*",
        }
    })

    const adapter = createAdapter(PubClient, SubClient)
    socketServer.adapter(adapter);


    socketServer.on("connection", (socket) => {
        console.log("a user has connected to the socket server", socket.id);

        const userId = socket.handshake.auth.userId;
        const plateNumber = socket.handshake.auth.plateNumber;

        if (userId) {

            const userRoom = `user_${userId}`
            const userRoom2 = `user_${plateNumber}`
            socket.join([userRoom, userRoom2]);
            console.log(`✅ User ${userId} joined their private room: ${userRoom}`);
        } else {
            console.log(`⚠️ Socket connected without userId: ${socket.id}`);
        }

        socket.on('custom_ping', () => {
            socket.emit('custom_pong', { message: "hello from socket" })
        })

        socket.on("disconnect", (reason) => {
            console.log(`user has disconnected from the socket server ${socket.id} with reason : ${reason}`)
        })

    })

}

export function getSocketServer() {
    if (!socketServer) {
        throw new Error("Socket server is not initialized yet!");
    }
    return socketServer;
}

