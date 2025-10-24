// mongo-seed.js
import mongoose, { Model } from 'mongoose';
// Adjust the path to your actual types file

import { SlotStatus } from '../types/parkingEventTypes.js';
// --- Interfaces and Schema (Make sure these match your actual definitions) ---
export interface ICurrentVehicle { plate_number?: string; occupied_since?: Date; reservation_id?: string; }
export interface ISlotStats { total_uses_today?: number; average_duration_minutes?: number; last_cleaned?: Date; }
export interface IConflictDetails { expected_plate?: string; assigned_session_id?: string; }
export interface IViolatingVehicle { plate_number?: string; occupied_since?: Date; }
export interface IParkingSlot extends mongoose.Document {
    _id: string; status: SlotStatus; current_vehicle?: ICurrentVehicle | null; // Make optional/nullable
    stats?: ISlotStats; conflict_details?: IConflictDetails | null; violating_vehicle?: IViolatingVehicle | null;
}
const ParkingSlotSchema = new mongoose.Schema<IParkingSlot>({
    _id: { type: String, required: true },
    status: { type: String, enum: Object.values(SlotStatus), required: true, default: SlotStatus.AVAILABLE },
    current_vehicle: {
        _id: false, // Don't create an _id for the subdocument
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

ParkingSlotSchema.index({ 'current_vehicle.plate_number': 1 });

const ParkingSlot: Model<IParkingSlot> = mongoose.models.ParkingSlot || mongoose.model<IParkingSlot>("ParkingSlot", ParkingSlotSchema);
// --- Connection Details ---
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/garage'; // Use your DB name

async function seedMongo() {
    console.log('🌱 Starting MongoDB seeding...');
    await mongoose.connect(MONGO_URI);
    console.log('🔌 Connected to MongoDB.');

    try {
        console.log('🧹 Clearing old slot statuses...');
        await ParkingSlot.deleteMany({});

        const now = Date.now();
        const defaultStats = { total_uses_today: 0 }; // Simplified default stats

        const slotsToCreate = [
            { _id: 'A-01', status: SlotStatus.AVAILABLE, current_vehicle: null, conflict_details: null, violating_vehicle: null, stats: defaultStats },
            { _id: 'A-02', status: SlotStatus.AVAILABLE, current_vehicle: null, conflict_details: null, violating_vehicle: null, stats: defaultStats },
            {
                _id: 'B-01', status: SlotStatus.OCCUPIED,
                current_vehicle: { plate_number: 'ن ن ن 333', occupied_since: new Date(now - 15 * 60000) },
                conflict_details: null, violating_vehicle: null, stats: defaultStats
            },
            { _id: 'B-02', status: SlotStatus.AVAILABLE, current_vehicle: null, conflict_details: null, violating_vehicle: null, stats: defaultStats },
            { _id: 'C-01', status: SlotStatus.AVAILABLE, current_vehicle: null, conflict_details: null, violating_vehicle: null, stats: defaultStats },
            { _id: 'EMG-01', status: SlotStatus.AVAILABLE, current_vehicle: null, conflict_details: null, violating_vehicle: null, stats: defaultStats },
        ];

        console.log('🅿️ Inserting initial slot statuses...');
        // Using create instead of insertMany to better handle defaults if schema changes
        await ParkingSlot.create(slotsToCreate);

        console.log('✅ MongoDB seeding finished successfully!');

    } catch (error) {
        console.error('❌ An error occurred while seeding MongoDB:', error);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Disconnected from MongoDB.');
    }
}

seedMongo();