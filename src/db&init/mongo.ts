import mongoose from "mongoose"
import { config } from "../configs/index.js"



export const mongoConnect = async () => {
    try {
        console.log("Mongo URI from config:", config.mongoUri);
        await mongoose.connect(config.mongoUri)
        console.log('MongoDB connected Successfully')
    } catch (error) {
        console.error("MongoDB connection error:", error);
        process.exit(1)
    }

}


