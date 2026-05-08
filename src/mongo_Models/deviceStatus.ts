import mongoose, { Schema, Document } from 'mongoose';

export interface IDeviceStatus extends Document {
  deviceId: string;
  name: string;
  type: "SENSOR" | "CAMERA" | "GATE";
  status: 'online' | 'offline';
  slotId?: string;
  lastSeen: Date;
  cpuTemp?: number;
}

const DeviceStatusSchema: Schema = new Schema(
  {
 deviceId: { type: String, required: true, unique: true, index: true },
    name: { type: String, default: function() { return this.deviceId; } },
    type: { type: String, enum: ["SENSOR", "CAMERA", "GATE"], default: "SENSOR" },
    status: { type: String, required: true, enum: ['online', 'offline'], default: 'offline' },
    slotId: { type: String, default: null },
    lastSeen: { type: Date, required: false, default: Date.now }, 
    cpuTemp: { type: Number },
  },
  { timestamps: true }
);

export default mongoose.model<IDeviceStatus>('DeviceStatus', DeviceStatusSchema);