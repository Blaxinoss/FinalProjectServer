// mongo-slots-seed.ts
import mongoose, { Model } from 'mongoose';
import { SlotStatus } from '../../dist/src/types/parkingEventTypes.js'; // تأكد من المسار



const ParkingSlotSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    status: { type: String, enum: Object.values(SlotStatus), required: true, default: SlotStatus.AVAILABLE },
    current_vehicle: {
        _id: false,
        plate_number: { type: String, trim: true, default: null },
        occupied_since: { type: Date, default: null },
        reservation_id: { type: String, default: null }
    },
    conflict_details: {
        _id: false,
        expected_plate: { type: String, default: null },
        assigned_session_id: { type: String, default: null }
    },
    violating_vehicle: {
        _id: false,
        plate_number: { type: String, trim: true, default: null },
        occupied_since: { type: Date, default: null }
    },
    stats: {
        _id: false,
        total_uses_today: { type: Number, default: 0 },
        average_duration_minutes: { type: Number, default: 0 },
        last_cleaned: { type: Date, default: null }
    }
}, { timestamps: true, collection: 'parking_slots', _id: false });

// إضافة الاندكس لتسريع البحث برقم اللوحة
ParkingSlotSchema.index({ 'current_vehicle.plate_number': 1 });

const ParkingSlot = mongoose.models.ParkingSlot || mongoose.model("ParkingSlot", ParkingSlotSchema);

// رابط الاتصال بقاعدة البيانات (تأكد من تعديله لو متغير عندك)
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/garage';

async function seedMongo() {
    console.log('🌱 Starting MongoDB Slots Seeding...');

    try {
        await mongoose.connect(MONGO_URI);
        console.log('🔗 Connected to MongoDB successfully.');

        // 1. مسح الأماكن القديمة
        console.log('🧹 Clearing old parking slots from MongoDB...');
        await ParkingSlot.deleteMany({});

        // 2. تجهيز الـ Default State لكل مكان
        const defaultState = {
            status: SlotStatus.AVAILABLE,
            current_vehicle: null,
            conflict_details: null,
            violating_vehicle: null,
            stats: { total_uses_today: 0 }
        };

        // 3. إنشاء الـ 10 أماكن الجداد (نفس الـ IDs اللي في Prisma)
        const slotsToCreate = [
            { _id: 'A-01', ...defaultState },
            { _id: 'A-02', ...defaultState },
            { _id: 'A-03', ...defaultState },
            { _id: 'A-04', ...defaultState },
            { _id: 'B-01', ...defaultState },
            { _id: 'B-02', ...defaultState },
            { _id: 'B-03', ...defaultState },
            { _id: 'B-04', ...defaultState },
            { _id: 'EMG-01', ...defaultState },
            { _id: 'EMG-02', ...defaultState },
        ];

        console.log('🅿️ Creating 10 new parking slots in Mongo...');
        await ParkingSlot.insertMany(slotsToCreate); // استخدمت insertMany لأنها أسرع وبتعمل Validate للداتا

        console.log('✅ MongoDB Slots seeding finished successfully! (All slots AVAILABLE)');
    } catch (error) {
        console.error('❌ MongoDB seed failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Disconnected from MongoDB.');
    }
}

seedMongo();