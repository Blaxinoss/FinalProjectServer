import RedisImport from "ioredis";

const Redis = RedisImport as any as typeof RedisImport["default"]
export const connection = new Redis({
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10)
});