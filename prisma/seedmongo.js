// mongo-seed.js
import mongoose from 'mongoose';

// --- 1. Define Constants (Instead of Enum) ---
// تأكد أن هذه القيم تطابق القيم المستخدمة في الـ Backend عندك
const SlotStatus = {
    AVAILABLE: 'AVAILABLE',
    OCCUPIED: 'OCCUPIED',
    RESERVED: 'RESERVED',
    CONFLICT: 'CONFLICT',
    VIOLATION: 'VIOLATION'
};

// --- 2. Schema Definition ---
const ParkingSlotSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    status: { 
        type: String, 
        enum: Object.values(SlotStatus), 
        required: true, 
        default: SlotStatus.AVAILABLE 
    },
    current_vehicle: {
        plate_number: { type: String, trim: true, default: null },
        occupied_since: { type: Date, default: null },
        reservation_id: { type: String, default: null }
    },
    conflict_details: {
        expected_plate: { type: String, default: null },
        assigned_session_id: { type: String, default: null }
    },
    violating_vehicle: {
        plate_number: { type: String, trim: true, default: null },
        occupied_since: { type: Date, default: null }
    },
    stats: {
        total_uses_today: { type: Number, default: 0 },
        average_duration_minutes: { type: Number, default: 0 },
        last_cleaned: { type: Date, default: null }
    }
}, { 
    timestamps: true, 
    collection: 'parking_slots',
    _id: false // لأننا بنستخدم String ID يدوي (A-01, A-02)
});

// Indexing for faster lookups
ParkingSlotSchema.index({ 'current_vehicle.plate_number': 1 });

const ParkingSlot = mongoose.models.ParkingSlot || mongoose.model("ParkingSlot", ParkingSlotSchema);

// --- 3. Connection & Seeding Logic ---
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/garage';

async function seedMongo() {
    try {
        console.log('🌱 Starting MongoDB seeding (Clean State)...');
        
        await mongoose.connect(MONGO_URI);
        console.log('Connected to MongoDB.');

        console.log('🧹 Clearing old slot data...');
        await ParkingSlot.deleteMany({});

        const defaultState = {
            status: SlotStatus.AVAILABLE,
            current_vehicle: null,
            conflict_details: null,
            violating_vehicle: null,
            stats: { total_uses_today: 0 }
        };

        // مسميات الـ IDs اللي إنت شغال بيها في الـ Mask والـ Garage Loop
        const slotsToCreate = [
            { _id: 'A-01', ...defaultState },
            { _id: 'A-02', ...defaultState },
            { _id: 'B-01', ...defaultState },
            { _id: 'EMG-01', ...defaultState },
        ];

        await ParkingSlot.insertMany(slotsToCreate);
        
        console.log('✅ MongoDB seeding finished successfully! (All slots set to AVAILABLE)');
    } catch (error) {
        console.error('❌ Seeding error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB.');
    }
}

seedMongo();