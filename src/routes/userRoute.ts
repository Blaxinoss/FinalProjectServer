import { Router } from "express";
import type { Request, Response } from "express";
import { PrismaClient } from "../src/generated/prisma/index.js";
import type { User } from "../src/generated/prisma/client.js";
import bcrypt from 'bcrypt';

import { prisma } from "./routes.js";

const router = Router();

router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const users: User[] = await prisma.user.findMany();
    res.status(200).json(users);
  } catch (error: any) {
    res.status(500).json({
      code: error.code || null,
message: `Error while fetcching the user: ${error.message || "Unknown error"}`
    });
  }
});


router.get("/:userId/vehicles", async (req: Request, res: Response) => {
  try {
      if (!req.params.userId) {
      res.status(400).json({ message: "User Id is not provided" });
      return;
    }
    const userId = parseInt(req.params.userId, 10);
    
    if (isNaN(userId)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }

    const vehicles = await prisma.vehicle.findMany({
      where: { userId },
      include: { ParkingSessions: true },
    });

    res.status(200).json({vehicles});
  } catch (error: any) {
    res.status(500).json({
      code: error.code || null,
message: `Error while fetcching the user cars: ${error.message || "Unknown error"}`
    });
  }
});


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




router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.params.id) {
      res.status(400).json({ message: "no id provided to delete" });
      return;
    }

    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      res.status(400).json({ message: "Invalid user ID" });
      return;
    }

    const deletedUser = await prisma.user.delete({
      where: { id },
    });

    res.status(200).json({
      message: "User deleted successfully",
      user: deletedUser,
    });
  } catch (error: any) {
    res.status(500).json({
      code: error.code || null,
message: `Error while deleting the user: ${error.message || "Unknown error"}`
    });
  }
});


router.put("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.params.id) {
      res.status(400).json({ message: "no id provided to delete" });
      return;
    }

    const user_id = parseInt(req.params.id, 10);

    const user = req.body;

    if (!user || Object.keys(user).length === 0) {
      res.status(400).json({ message: "No user data provided" });
      return;
    }

    const newUser = await prisma.user.update({
      where: { id: user_id },
      data: { ...user },
    });

    res.status(200).json({
      message: "User updated successfully",
      user: newUser,
    });
  } catch (error: any) {
    res.status(500).json({
      code: error.code || null,
message: `Error while updating the user: ${error.message || "Unknown error"}`
    });
  }
});



export default router;