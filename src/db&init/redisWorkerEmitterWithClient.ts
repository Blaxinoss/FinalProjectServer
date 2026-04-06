import { Emitter } from "@socket.io/redis-emitter";
import type { Emitter as EmitterType } from "@socket.io/redis-emitter";
import { getRedisClient } from "./redis.js";

let emitter: EmitterType | null = null;

export const createEmitters = async () => {
    if (emitter) {
        return emitter;
    }

    const client = await getRedisClient();

    emitter = new Emitter(client);

    console.log("✅ Redis Emitter created and ready! (Reusing existing client)");
    return emitter;
};

export const getEmitter = (): EmitterType => {
    if (!emitter) {
        throw new Error("❌ Couldn't find a ready emitter. Did you call createEmitters()?");
    }
    return emitter;
};