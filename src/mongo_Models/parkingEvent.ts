import mongoose, { Model } from "mongoose";

import { EventType, LightingCondition, ViolationType, WeatherCondition } from "../types/parkingEventTypes.js";

interface IEnvironment{
    lightingCondition:LightingCondition;
    weatherCondition:WeatherCondition;
}

interface IViolationDetails{
    violationType: ViolationType;
    description?: string;
    imageUrl?: string;
}


export interface IParkingEvent extends Document {
  slot_id: string;
  event_type: EventType;
  plate_number?: string;
  timestamp: Date;
  camera_id: string;
  confidence: number;
  environment: IEnvironment;
  violation_details?: IViolationDetails;
  processed: boolean;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}



const parkingEventSchema = new mongoose.Schema<IParkingEvent>(
    {
        slot_id: { type: String, required: true ,index:true},
        event_type: { type: String, enum: Object.values(EventType), required: true },
        plate_number: { type: String ,default:null,trim:true},
        camera_id: { type: String, required: true },
        timestamp:{type:Date,required:true,default:Date.now,index:true},
        confidence: { type: Number, required: true, min: 0, max: 1 },
        environment: {
            lightingCondition: { type: String, enum: Object.values(LightingCondition),default:LightingCondition.NORMAL },
            weatherCondition: { type: String, enum: Object.values(WeatherCondition), default: WeatherCondition.UNKNOWN },
    },
    violation_details: {
    type: {
      type: String,
      enum: Object.values(ViolationType)
    },
    description: String,
    image_url: String
  },
    processed: {
    type: Boolean,
    default: false
  },
    notes: String,
},{
    timestamps: true,
  collection: 'parking_events'
}
)

parkingEventSchema.index({ slot_id: 1, timestamp: -1 });
parkingEventSchema.index({ event_type: 1, timestamp: -1 });
parkingEventSchema.index({ plate_number: 1, timestamp: -1 });


export const ParkingEvent: Model<IParkingEvent>  = mongoose.model<IParkingEvent>("parkingEvent",parkingEventSchema);

// const one = new ParkingEvent({
//     slot_id: "A1",
//     event_type: EventType.OCCUPIED,
//     plate_number: "XYZ123",
//     camera_id: "CAM001",
//     confidence: 0.95,
//     environment: {
//         lightingCondition: LightingCondition.BRIGHT,
//         weatherCondition: WeatherCondition.CLEAR
//     },
//     timestamp: new Date(),
//     processed: false,
//     notes: "First event"
// });