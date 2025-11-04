import * as Redis from "ioredis";
import { config } from "../configs/index.js";

let redisClient: Redis.Redis | null = null;

export const connectRedis = async() => {
    if (redisClient) return redisClient;
    redisClient = new Redis.Redis({ host: config.redis.host, port: config.redis.port });

    redisClient.on("connect", () => console.log("Redis connected"));
    redisClient.on("error", (err: any) => {
        console.error("Redis error:", err);
        process.exit(1);
    });

    return redisClient;
};

export const getRedisClient = async() => {
    if (!redisClient) throw new Error("Redis not initialized");
    return redisClient;
};
