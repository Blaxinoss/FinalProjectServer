
const router: Router = Router();
import { Router, type Request, type Response } from "express";
import { prisma } from '../prsimaForRouters.js';
import bcrypt from 'bcrypt';

router.post("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const { 
      name, phone, email, 
      NationalID, address, licenseNumber, 
      licenseExpiry, role,
      idToken // استقبل التوكن بدلاً من الباسورد
    } = req.body;

    // 1. التحقق من الحقول المطلوبة (بدون باسورد)
    if (!name || !phone || !email || !idToken || !NationalID || !address || !licenseExpiry || !licenseNumber) {
      res.status(400).json({ success: false, message: "Missing required fields" });
      return;
    }

    // 2. التحقق من صحة التوكن واستخراج الـ UID من فايربيز
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (authError) {
      res.status(401).json({ success: false, message: "Invalid Firebase token" });
      return;
    }

    const firebaseUid = decodedToken.uid;

    // 3. إنشاء المستخدم في MariaDB بربطه بـ UUID فايربيز
    const newUser = await prisma.user.create({
      data: { 
          name,
          phone,
          email,
          uuid: firebaseUid, // نخزن الـ UID القادم من فايربيز هنا
          NationalID,
          address,
          licenseExpiry: new Date(licenseExpiry),
          licenseNumber,
          ...(role && { role }), 
      },
      select: {
          id: true,
          name: true,
          email: true,
          uuid: true, // مهم للتأكد من الربط
          role: true,
          createdAt: true
      }
    });

    res.status(201).json({
      success: true, 
      message: "User synced with database successfully",
      user: newUser,
    });
  
  } catch (error: any) {
    if (error.code === 'P2002') {
        res.status(409).json({ message: `Unique constraint failed on: ${error.meta.target}` });
        return;
    }
    res.status(500).json({ message: error.message });
  }
});

export default router;