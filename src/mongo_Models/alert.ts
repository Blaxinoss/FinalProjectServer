
import mongoose, { Model, Schema } from "mongoose";
import  { AlertSeverity, AlertStatus, AlertType } from "../types/parkingEventTypes.js";

export interface IAlert extends Document {
  alert_type: AlertType;
  severity: AlertSeverity;
  slot_id?: string;
  plate_number?: string;
  description: string;
  details?: any;
  image_url?: string;
  status: AlertStatus;
  resolved_by?: string;
  resolved_at?: Date;
  timestamp: Date;
  createdAt: Date;
  updatedAt: Date;
}

const alertSchema = new Schema<IAlert>({
  alert_type: {
    type: String,
    enum: Object.values(AlertType),
    required: true,
    index: true
  },
  severity: {
    type: String,
    enum: Object.values(AlertSeverity),
    default: AlertSeverity.MEDIUM
  },
  slot_id: {
    type: String,
    index: true
  },
  plate_number: String,
  description: {
    type: String,
    required: true
  },
  details: Schema.Types.Mixed,
  image_url: String,
  status: {
    type: String,
    enum: Object.values(AlertStatus),
    default: AlertStatus.PENDING,
    index: true
  },
  resolved_by: String,
  resolved_at: Date,
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true,
  collection: 'alerts'
});

alertSchema.index({ status: 1, severity: -1, timestamp: -1 });

export const Alert: Model<IAlert> = mongoose.model<IAlert>('Alert', alertSchema);
