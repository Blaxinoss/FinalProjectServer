import mongoose, { Schema, Document } from 'mongoose';

// واجهة (Interface) لتحديد شكل الـ Document في TypeScript
export interface IDeviceStatus extends Document {
  deviceId: string;
  status: 'online' | 'offline';
  lastSeen: Date;
  cpuTemp?: number;
  // يمكنك إضافة أي بيانات أخرى تهمك هنا
  // مثلاً: uptime_seconds: number;
}

// الـ Schema الفعلي الذي سيتم تطبيقه في MongoDB
const DeviceStatusSchema: Schema = new Schema(
  {
    deviceId: {
      type: String,
      required: true,
      unique: true, // كل جهاز له Document واحد فقط
      index: true, // لتحسين سرعة البحث
    },
    status: {
      type: String,
      required: true,
      enum: ['online', 'offline'], // نقبل فقط هذه القيم
      default: 'offline',
    },
    lastSeen: {
      type: Date,
      required: true,
    },
    cpuTemp: {
      type: Number,
      required: false, // ليس إجباريًا
    },
  },
  {
    // إضافة timestamps تلقائيًا (createdAt, updatedAt)
    timestamps: true,
  }
);

// تصدير الموديل ليمكننا استخدامه في باقي أجزاء التطبيق
export default mongoose.model<IDeviceStatus>('DeviceStatus', DeviceStatusSchema);