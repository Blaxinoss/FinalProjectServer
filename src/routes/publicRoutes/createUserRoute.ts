
const router: Router = Router();
import { Router, type Request, type Response } from "express";
import { prisma } from '../routes.js';
import bcrypt from 'bcrypt';

router.post("/", async (req: Request, res: Response): Promise<void> => {
  try {

    // Note: paidAt, createdAt, updatedAt, and transactionStatus have defaults in the schema
    const { name, phone,email,
password,
NationalID,
address,
licenseNumber,
licenseExpiry,role } = req.body;


    if (!name || !phone || !email || !password || !NationalID || !address || !licenseExpiry || !licenseNumber) {
      res.status(400).json({
        success: false,
        message: "Missing required fields: parkingSessionId, amount, and paymentMethod",
      });
      return;
    }



    if (typeof name !== 'string' || typeof phone !== 'string' || typeof email !== 'string'
      || typeof password !== 'string' || typeof NationalID !== 'string' || typeof address !== 'string'
      || typeof licenseExpiry !== 'string' || typeof licenseNumber !== 'string'
    ) {
        res.status(400).json({ success: false, message: "Invalid data types for one or more fields" });
        return;
    }

        const hashedPassword = await bcrypt.hash(password, 10); 


    const newUser = await prisma.user.create({
      data: { 
          name,
          phone,
          email,
          password:hashedPassword,
          NationalID,
          address,
          licenseExpiry :new Date(licenseExpiry),
          licenseNumber,
          ...(role && { role }), 

      },
        select: {
          id: true,
          name: true,
          email: true,
          NationalID: true,
          createdAt: true,
          address:true,
          licenseExpiry:true,
          licenseNumber:true,
          role:true,

      }
    });

    res.status(201).json({
      success: true, 
      message: "User created successfully",
      user: newUser,
    });
  
  } catch (error: any) {
    // معالجة خطأ الحقول الفريدة (Unique constraint)
    if (error.code === 'P2002') {
          res.status(409).json({
            code: error.code,
            message: `A user with this ${error.meta.target} already exists.`,
        });
        return;
    }
    res.status(500).json({
      code: error.code || null,
      message: `Error while creating the user: ${error.message || "Unknown error"}`,
    });
  }
});

export default router;