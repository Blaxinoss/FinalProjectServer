// // services/notificationService.ts

import { prisma } from "../routes/prsimaForRouters.js";
import { admin } from "./firebaseAdmin.js";

// import { prisma } from "../routes/prsimaForRouters.js";
// import axios from 'axios'; // ⬅️ 1. استدعاء axios

// export const sendPushNotification = async (
//     userId: number, 
//     title: string, 
//     body: string, 
//     data: object = {}
// ) => {
    
//     // 1. جلب التوكن (كما هو)
//     const user = await prisma.user.findUnique({
//         where: { id: userId },
//         select: { pushToken: true }
//     });

//     if (!user || !user.pushToken || !user.pushToken.startsWith('ExponentPushToken[')) {
//         console.warn(`User ${userId} does not have a valid push token. Skipping notification.`);
//         return;
//     }

//     // 2. تجهيز الرسالة (كما هي)
//     const message = {
//         to: user.pushToken,
//         sound: 'default',
//         title: title,
//         body: body,
//         data: data,
//     };

//     // 3. إرسال الطلب (هنا التغيير)
//     try {
//         // ⬅️ 2. استخدام axios.post
//         await axios.post('https://exp.host/--/api/v2/push/send', message, {
//             // axios ذكي كفاية إنه يحط الـ headers دي لوحده
//             // لكن إضافتها للتأكيد لا تضر
//             headers: {
//                 'Accept': 'application/json',
//                 'Accept-encoding': 'gzip, deflate',
//                 'Content-Type': 'application/json',
//             },
//         });

//         console.log(`Push notification sent successfully to user ${userId}`);

//     } catch (error: any) {
//         // ⬅️ 3. الـ catch ده هيلقط أخطاء الشبكة + أخطاء السيرفر (4xx/5xx)
//         if (axios.isAxiosError(error)) {
//             console.error(`Axios error sending notification to user ${userId}:`, error.response?.data);
//         } else {
//             console.error(`Failed to send push notification to user ${userId}:`, error.message);
//         }
//     }
// };


// index.js (تابع)

// مثال على رمز تسجيل يجب أن يكون لديك من الفرونت إند
// يجب أن تحصل على هذا الرمز من قاعدة بياناتك

export async function sendFCMNotification(token:string,   title: string, 
     body: string,data?:object) {
  try {

   
    const response = await admin.messaging().send({
      token: token,
      notification: {
        title,
        body,
      },
      
    });

    console.log('notification sent successfuly ✅', response);
    // يمكنك هنا تسجيل النجاح في قاعدة البيانات أو سجلات الخادم
    return response;

  } catch (error:any) {
    console.error('An error occured while sending the notifcation❌', error);
    if (error.code === 'messaging/invalid-registration-token' || error.code === 'messaging/registration-token-not-registered') {
        console.log(`this token is not valid anymore and should be deleted: ${token}`);
    }
    
    throw error;
  }
}
