import mysql from "mysql2/promise";
import { config } from "../configs/index.js";

let pool: mysql.Pool;
export const connectMySQL = async () => {
    try {
        pool = await mysql.createPool({
            host: config.mysql.host,
            user: config.mysql.user,
            password: config.mysql.password,
            database: config.mysql.database,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
        });
        console.log('MySQL DB Connected Successfully')


    } catch (error:any) {
        console.log('error connecting to Mysql DB exiting...',error.message)
        process.exit(1);
    }

}

export const getMySQLPool = () => {
    if (!pool) throw new Error("MySQL pool not initialized");
    return pool;
};