import mongoose from "mongoose"
import { config } from "../configs/index.js"



export const mongoConnect = async () => {
    try {
        await mongoose.connect(config.mongoUri)
        console.log('MongoDB connected Successfully')
    } catch (error) {
        console.error("MongoDB connection error:", error);
        process.exit(1)
    }

}


