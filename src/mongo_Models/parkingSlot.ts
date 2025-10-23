import mongoose, { Model } from "mongoose";
import { SlotStatus } from "../types/parkingEventTypes.js";


export interface ISlotStats {
  total_uses_today: number;
  average_duration_minutes: number;
  last_cleaned?: Date;
}

export interface ICurrentVehicle {
  plate_number?: string;
  occupied_since?: Date;
  expected_exit?: Date;
  reservation_id?: string;
}


interface ISlot{
    slot_id:string;
    status:SlotStatus;
    current_vehicle?:ICurrentVehicle;
  stats: ISlotStats;
}
export interface IConflictDetails { // <--- ✅ Interface جديد
  expected_plate: string;
  assigned_session_id?: string; // أو رقم لو الـ ID عندك رقم
}

export interface IParkingSlot extends Document {
  _id: string; // slot_id
  status: SlotStatus;
  current_vehicle: ICurrentVehicle;
  stats: ISlotStats;  
  conflict_details?: IConflictDetails; // <--- ✅ إضافة الحقل الاختياري

}




const ParkingSlotSchema = new mongoose.Schema<IParkingSlot>({

  _id: { type: String, required: true }, // slot_id
  status: { type: String, enum: Object.values(SlotStatus), required: true, default: SlotStatus.AVAILABLE },
  current_vehicle: {
    plate_number: { type: String,trim: true },
    occupied_since: { type: Date },
    reservation_id: { type: String }
  },
  conflict_details: {
    expected_plate: { type: String },
    assigned_session_id: { type: String } // أو Number حسب ID الجلسة
  },
  stats: {
    total_uses_today: { type: Number, default: 0 },
    average_duration_minutes: { type: Number, default: 0 },
    last_cleaned: { type: Date }
  }
}, { timestamps: true,collection: 'parking_slots' });


ParkingSlotSchema.index({ 'current_vehicle.plate_number': 1 });





export const ParkingSlot: Model<IParkingSlot> = mongoose.model<IParkingSlot>("parkingSlot", ParkingSlotSchema);
