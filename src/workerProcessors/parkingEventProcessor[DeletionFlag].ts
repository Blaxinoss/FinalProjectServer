// import { Job } from 'bullmq';
// import { HandleDeviceStatus } from './systemProcessors/deviceStatusHandlers.js';
// import { handleGateEntryRequest } from './gateProcessors/handleGateEventRequest.js';
// import { handleSessionExpiry } from './workerHandlers/handleSessionExpiry.js';
// import { handleGracePeriodExpiry } from './workerHandlers/handleGracePeriodExpiry.js';
// // قم باستيراد أي services أو موديلات تحتاجها هنا
// // import DeviceService from '../services/deviceService';
// // import ParkingEventService from '../services/parkingEventService';

// // هذه هي الدالة التي ستقوم بتمريره'ا للـ Worker
// export const parkingEventProcessor = async (job: Job) => {
//   console.log(`🧠 Processing job: ${job.name} with data:`, job.data);

//   switch (job.name) {
    
//     // case 'raspberry-status':
//     //     return await HandleDeviceStatus(job);

//     // case 'gate-event-request':
//     //     return await handleGateEntryRequest(job);
        

//     // case 'check-session-expiry':
//     //   return await handleSessionExpiry(job);

//     // case 'check-grace-period-expiry':
//     //   // استدعاء الدالة المناسبة لمعالجة انتهاء فترة السماح
//     //   return await handleGracePeriodExpiry(job);

//     default:
//       // حالة مهمة للتعامل مع أي أسماء مهام غير متوقعة
//       throw new Error(`Unknown job name: ${job.name}`);
//   }
// };