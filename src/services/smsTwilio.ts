import twilio from 'twilio';

/**
 * () إرسال رسالة SMS.
 * في التطبيق الفعلي، ستستخدم هنا بوابة إرسال مثل Twilio.
 * @param phoneNumber رقم الهاتف (بالصيغة الدولية مثلاً +20100...).
 * @param message نص الرسالة.
 */
export const sendSmsNotification = async (phoneNumber: string | undefined, message: string): Promise<void> => {

    if (!process.env.TWILIO_PHONE_NUMBER) {
  throw new Error("TWILIO_PHONE_NUMBER is not set in environment variables");
}
    const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
    

    if (!phoneNumber) {
  console.warn("No phone number provided for SMS notification.");
  return;
}

    try {
        await client.messages.create({
            body: message,
            from: process.env.TWILIO_PHONE_NUMBER, // رقمك من Twilio
            to: phoneNumber // لازم يكون بالصيغة الدولية (+20...)
        });
        console.log(`SMS sent successfully to ${phoneNumber}`);
    } catch (error: any) {
        console.error(`Failed to send SMS to ${phoneNumber}:`, error.message);
    }
};