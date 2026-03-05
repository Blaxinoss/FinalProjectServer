import { Router, type Request, type Response } from "express";
import { prisma } from '../prsimaForRouters.js';
import { admin } from "../../services/firebaseAdmin.js";
import { authenticateUser } from "../../middleware/AuthenticateUser.js";

const router = Router();


router.get("/", async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id!;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { ParkingSessions: true, Vehicles: true },
    });

    res.status(200).json({ user });
  } catch (error: any) {
    res.status(500).json({
      code: error.code || null,
      message: `Error while fetcching the user cars: ${error.message || "Unknown error"}`
    });
  }
});



/**
 * 1️⃣ الخطوة الأولى في الـ Onboarding: إنشاء الحساب وحقن الـ UUID
 * المسار: POST /api/users/signup
 * ⚠️ هذا الراوت (لا يمر) على الميدل وير، لأنه هو اللي بيكريت اليوزر أساساً
 */
router.post("/signup", async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      name, phone, email,
      NationalID, address, licenseNumber,
      licenseExpiry,
      idToken
    } = req.body;

    // 1. التحقق من الحقول المطلوبة
    if (!name || !phone || !email || !idToken || !NationalID || !address || !licenseExpiry || !licenseNumber) {
      res.status(400).json({ success: false, message: "Missing required fields" });
      return;
    }

    // 2. التحقق من صحة التوكن واستخراج الـ UID السري من فايربيز
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (authError) {
      res.status(401).json({ success: false, message: "Invalid Firebase token" });
      return;
    }

    const firebaseUid = decodedToken.uid;

    // 3. إنشاء المستخدم في MySQL وحقن الـ UUID
    const newUser = await prisma.user.create({
      data: {
        name,
        phone,
        email,
        uuid: firebaseUid, // 💉 حقن الـ UID هنا
        NationalID,
        address,
        licenseExpiry: new Date(licenseExpiry),
        licenseNumber,
      },
      select: {
        id: true,
        name: true,
        email: true,
        uuid: true,
        role: true,
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

/**
 * 2️⃣ الخطوة التانية في الـ Onboarding: إضافة العربية
 * المسار: POST /api/vehicles
 * 🔒 (يجب أن يمر على الميدل وير authenticateUser لأنه يحتاج req.user.id)
 */
router.post("/vehicle", authenticateUser, async (req: Request, res: Response): Promise<void> => {
  try {
    const { plate, color } = req.body;
    const userId = req.user?.id!; // الميدل وير هو اللي جاب الـ id ده

    if (!plate || !color || !userId) {
      res.status(400).json({ success: false, message: "Missing required fields for creating a vehicle" });
      return;
    }

    const newVehicle = await prisma.vehicle.create({
      data: { plate, color, userId },
    });

    res.status(201).json({ success: true, data: newVehicle });
  } catch (error: any) {
    res.status(500).json({
      code: error.code || null,
      message: `Error while creating the vehicle: ${error.message || "Unknown error"}`,
    });
  }
});


export default router;