import type { Job } from "bullmq";
import deviceStatus from "../../mongo_Models/deviceStatus.js";

export const handleDeviceStatus = async (job: Job) => {
    try {
        // 1. استخراج البيانات
        const { deviceId, status, lastSeen, cpuTemp } = job.data;
        // 2. تنفيذ عملية الـ Upsert
        await deviceStatus.updateOne(
          { deviceId: deviceId }, // الشرط: ابحث عن هذا الجهاز
          { 
            $set: { // البيانات التي سيتم تحديثها
              status: status,
              lastSeen: new Date(lastSeen),
              cpuTemp: cpuTemp,
              // ... أي بيانات أخرى
            }
          },
          { upsert: true } // الخيار الأهم: إذا لم تجده، قم بإنشائه
        );

        console.log(`✅ Status for device ${deviceId} has been updated.`);
        return { success: true, deviceId };

      } catch (error: any) {
        console.error(`Error processing 'raspberry-status': ${error.message}`);
        throw error;
      }}
