import { Job } from 'bullmq';
import { HandleDeviceStatus } from './workerHandlers/deviceStatusHandlers.js';
import { handleGateEntryRequest } from './workerHandlers/handleGateEventRequest.js';
// قم باستيراد أي services أو موديلات تحتاجها هنا
// import DeviceService from '../services/deviceService';
// import ParkingEventService from '../services/parkingEventService';

// هذه هي الدالة التي ستقوم بتمريرها للـ Worker
export const parkingEventProcessor = async (job: Job) => {
  console.log(`🧠 Processing job: ${job.name} with data:`, job.data);

  switch (job.name) {
    
    case 'raspberry-status':
        await HandleDeviceStatus(job);
        break;

    case 'gate-event-request':
        return await handleGateEntryRequest(job);
        break;

    default:
      // حالة مهمة للتعامل مع أي أسماء مهام غير متوقعة
      throw new Error(`Unknown job name: ${job.name}`);
  }
};