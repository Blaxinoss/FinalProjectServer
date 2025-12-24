
const router: Router = Router();
import { Router, type Request, type Response } from "express";
import { prisma } from '../prsimaForRouters.js';
import { admin } from "../../services/firebaseAdmin.js";


router.post("/test-sync", async (req: Request, res: Response): Promise<void> => {
  try {
    const { 
      name, phone, email, 
      NationalID, address, licenseNumber, 
      licenseExpiry, role,
      uuid // استقبل الـ UUID مباشرة من Postman
    } = req.body;

    // 1. التحقق من وجود الحقول
    if (!uuid || !email) {
       res.status(400).json({ message: "Missing uuid or email" });
       return;
    }

    // 2. الفيريفاي: اسأل فايربيز "هل الـ UUID ده حقيقي؟"
    try {
      const firebaseUser = await admin.auth().getUser(uuid);
      console.log("Verified: User exists in Firebase with email:", firebaseUser.email);
    } catch (authError) {
      // لو الـ UUID غلط أو مش موجود في فايربيز، جوجل هترمي Error
      res.status(404).json({ success: false, message: "This UUID does not exist in Firebase Console" });
      return;
    }

    // 3. عملية الـ Upsert (لو موجود حدثه، لو مش موجود سجل جديد)
    const user = await prisma.user.upsert({
      where: { uuid: uuid },
      update: {
        name,
        phone,
        email,
        address,
        // تحديث باقي البيانات لو حبيت
      },
      create: { 
        name,
        phone,
        email,
        uuid: uuid, // الـ UUID اللي جبناه من فايربيز
        NationalID,
        address,
        licenseExpiry: new Date(licenseExpiry),
        licenseNumber,
        ...(role && { role }), 
      },
    });

    res.status(201).json({
      success: true, 
      message: "User verified in Firebase and synced to DB",
      user: user,
    });
  
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});


// router.post("/", async (req: Request, res: Response): Promise<void> => {
//   try {
//     const { 
//       name, phone, email, 
//       NationalID, address, licenseNumber, 
//       licenseExpiry, role,
//       idToken // استقبل التوكن بدلاً من الباسورد
//     } = req.body;

//     // 1. التحقق من الحقول المطلوبة (بدون باسورد)
//     if (!name || !phone || !email || !idToken || !NationalID || !address || !licenseExpiry || !licenseNumber) {
//       res.status(400).json({ success: false, message: "Missing required fields" });
//       return;
//     }

//     // 2. التحقق من صحة التوكن واستخراج الـ UID من فايربيز
//     let decodedToken;
//     try {
//       decodedToken = await admin.auth().verifyIdToken(idToken);
//     } catch (authError) {
//       res.status(401).json({ success: false, message: "Invalid Firebase token" });
//       return;
//     }

//     const firebaseUid = decodedToken.uid;

//     // 3. إنشاء المستخدم في MariaDB بربطه بـ UUID فايربيز
//     const newUser = await prisma.user.create({
//       data: { 
//           name,
//           phone,
//           email,
//           uuid: firebaseUid, // نخزن الـ UID القادم من فايربيز هنا
//           NationalID,
//           address,
//           licenseExpiry: new Date(licenseExpiry),
//           licenseNumber,
//           ...(role && { role }), 
//       },
//       select: {
//           id: true,
//           name: true,
//           email: true,
//           uuid: true, // مهم للتأكد من الربط
//           role: true,
//           createdAt: true
//       }
//     });

//     res.status(201).json({
//       success: true, 
//       message: "User synced with database successfully",
//       user: newUser,
//     });
  
//   } catch (error: any) {
//     if (error.code === 'P2002') {
//         res.status(409).json({ message: `Unique constraint failed on: ${error.meta.target}` });
//         return;
//     }
//     res.status(500).json({ message: error.message });
//   }
// });

export default router;