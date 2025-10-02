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


export interface IParkingSlot extends Document {
  _id: string; // slot_id
  status: SlotStatus;
  current_vehicle: ICurrentVehicle;
  stats: ISlotStats;  
  // Methods
  markAsOccupied(plateNumber: string, reservationId?: string): Promise<IParkingSlot>;
  markAsAvailable(): Promise<IParkingSlot>;
  isAvailable(): boolean;
}




const ParkingSlotSchema = new mongoose.Schema<IParkingSlot>({

  _id: { type: String, required: true }, // slot_id
  status: { type: String, enum: Object.values(SlotStatus), required: true, default: SlotStatus.AVAILABLE },
  current_vehicle: {
    plate_number: { type: String,trim: true },
    occupied_since: { type: Date },
    expected_exit: { type: Date },
    reservation_id: { type: String }
  },
  stats: {
    total_uses_today: { type: Number, default: 0 },
    average_duration_minutes: { type: Number, default: 0 },
    last_cleaned: { type: Date }
  }
}, { timestamps: true,collection: 'parking_slots' });


ParkingSlotSchema.index({ 'current_vehicle.plate_number': 1 });


ParkingSlotSchema.methods.markAsOccupied = async function(plate_number:string,reservation_id?:string):Promise<IParkingSlot> {
  if (this.status === SlotStatus.OCCUPIED) {
    throw new Error('Slot is already occupied');
  }
  this.status = SlotStatus.OCCUPIED;
  this.current_vehicle = {
    plate_number,
    occupied_since: new Date(),
    reservation_id
  };
  return await this.save();
}


ParkingSlotSchema.methods.markAsAvailable = async function():Promise<IParkingSlot> {

  if(this.status === SlotStatus.AVAILABLE){
    throw new Error('Slot is already available');
  }

  this.status = SlotStatus.AVAILABLE;
  this.current_vehicle = {};
  this.stats.total_uses_today +=1;
  this.stats.last_cleaned = new Date();
  // this.stats.average_duration_minutes = whhat;
  return await this.save();
  


}

ParkingSlotSchema.methods.isAvailable = function():boolean {
  return this.status === SlotStatus.AVAILABLE;
} 


ParkingSlotSchema.statics.findAvailableSlots = async function():Promise<IParkingSlot[]> {
  return await this.find({ status: SlotStatus.AVAILABLE },{sort:{_id:1}});
}


export const ParkingSlot: Model<IParkingSlot> = mongoose.model<IParkingSlot>("parkingSlot", ParkingSlotSchema);
