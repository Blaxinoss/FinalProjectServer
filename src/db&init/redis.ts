import * as Redis from "ioredis";
import { config } from "../configs/index.js";

let redisClient: Redis.Redis | null = null;

export const connectRedis = async() => {
    if (redisClient) return redisClient;
    redisClient = new Redis.Redis({ host: config.redis.host, port: config.redis.port , retryStrategy: (times) => {
            console.log(`Retrying Redis connection, attempt ${times} host ${config.redis.host}:${config.redis.port}`);
            return Math.min(times * 500, 2000); // محاولة كل 50ms حتى 2s
        },});

    redisClient.on("connect", () => console.log("Redis connected"));
    redisClient.on("error", (err: any) => {
        console.error("Redis error:", err);
                    console.log(`host ${config.redis.host}:${config.redis.port}`);

    });

    return redisClient;
};

export const getRedisClient = async() => {
    if (!redisClient) throw new Error("Redis not initialized");
    return redisClient;
};
