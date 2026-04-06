import mongoose, { Model } from "mongoose";
import { SlotStatus } from "../types/parkingEventTypes.js";
import { getEmitter } from "../db&init/redisWorkerEmitterWithClient.js";
import { SLOT_STATUS_CHANGED_MESSAGE } from "../constants/constants.js";

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


export interface IConflictDetails {
  expected_plate: string;
  assigned_session_id?: string;
}

export interface IParkingSlot extends Document {
  _id: string;
  status: SlotStatus;
  current_vehicle: ICurrentVehicle;
  stats: ISlotStats;
  conflict_details?: IConflictDetails;

}




const ParkingSlotSchema = new mongoose.Schema<IParkingSlot>({

  _id: { type: String, required: true }, // slot_id
  status: { type: String, enum: Object.values(SlotStatus), required: true, default: SlotStatus.AVAILABLE },
  current_vehicle: {
    plate_number: { type: String, trim: true },
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
}, { timestamps: true, collection: 'parking_slots' });


ParkingSlotSchema.index({ 'current_vehicle.plate_number': 1 });



ParkingSlotSchema.post('updateOne', function () {
  const filter = this.getQuery();
  const update: any = this.getUpdate();
  const slotId = filter._id || filter.id;

  // 3. نستخرج الحالة الجديدة (سواء كنت باعتها جوه $set أو مباشر)
  let newStatus = null;
  if (update.$set && update.$set.status) {
    newStatus = update.$set.status;
  } else if (update.status) {
    newStatus = update.status;
  }

  // 4. لو فعلاً التحديث كان بيغير الـ status، ابعت الإيفينت!
  if (slotId && newStatus) {
    const Emitter = getEmitter();
    Emitter.emit(SLOT_STATUS_CHANGED_MESSAGE, {
      slotId: slotId,
      newStatus: newStatus
    });
    console.log(`📡 [Mongoose Hooks] Slot ${slotId} status broadcasted as ${newStatus}`);
  }
});


export const ParkingSlot: Model<IParkingSlot> = mongoose.model<IParkingSlot>("parkingSlot", ParkingSlotSchema);
