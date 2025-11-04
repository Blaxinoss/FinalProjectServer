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
    console.log('🌱 Starting MongoDB seeding (Clean State)...');
    await mongoose.connect(MONGO_URI);
    console.log('🧹 Clearing old slot statuses...');
    await ParkingSlot.deleteMany({});

    const defaultState = {
        status: SlotStatus.AVAILABLE,
        current_vehicle: null,
        conflict_details: null,
        violating_vehicle: null,
        stats: { total_uses_today: 0 }
    };

    const slotsToCreate = [
        { _id: 'A-01', ...defaultState },
        { _id: 'A-02', ...defaultState },
        { _id: 'B-01', ...defaultState },
        { _id: 'EMG-01', ...defaultState },
    ];

    await ParkingSlot.create(slotsToCreate);
    console.log('✅ MongoDB seeding finished successfully! (All slots AVAILABLE)');
    await mongoose.disconnect();
}

seedMongo();