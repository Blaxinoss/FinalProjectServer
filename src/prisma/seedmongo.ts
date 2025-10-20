// mongo-seed.js

import { MongoClient } from 'mongodb';
import mongoose from 'mongoose';
import { ParkingSlot } from '../mongo_Models/parkingSlot.js';




// --- Connection Details ---
// استبدل هذا بالـ connection string الخاص بقاعدة بيانات MongoDB عندك
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/garage';

async function seedMongo() {
    console.log('🌱 Starting MongoDB seeding...');
    
    await mongoose.connect(MONGO_URI);
    console.log('🔌 Connected to MongoDB.');

    try {
        // --- 1. Clean up existing data ---
        console.log('🧹 Clearing old slot statuses...');
        await ParkingSlot.deleteMany({});

        // --- 2. Define the initial slot statuses ---
        // هذه البيانات تطابق تمامًا البيانات التي أنشأناها في Prisma
        const slotsToCreate = [
            // الحالة الطبيعية: مكان عمرو فارغ وجاهز
            { _id: 'A-01', status: 'available' },
            
            // مكان بديل فارغ وجاهز
            { _id: 'A-02', status: 'available' },

            // **الحالة الأهم**: مكان كريم (B-01) مشغول حاليًا!
            // هذا ما سيجبر النظام على البحث عن بديل.
            { _id: 'B-01', status: 'occupied' },

            // مكان بديل آخر فارغ وجاهز
            { _id: 'B-02', status: 'available' },

            // مكان آخر فارغ وجاهز
            { _id: 'C-01', status: 'available' },
        ];

        // --- 3. Insert the new data ---
        console.log('🅿️ Inserting new slot statuses...');
        await ParkingSlot.insertMany(slotsToCreate);

        console.log('✅ MongoDB seeding finished successfully!');

    } catch (error) {
        console.error('❌ An error occurred while seeding MongoDB:', error);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Disconnected from MongoDB.');
    }
}

seedMongo();