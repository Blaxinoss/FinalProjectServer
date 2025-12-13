import type { NextFunction, Request, Response } from "express";
import { admin } from "../services/firebaseAdmin.js";
import { prisma } from "../routes/prsimaForRouters.js";
import type { User } from "../../src/generated/prisma/client.js";

declare global {
  namespace Express {
    interface Request {
      user? : Partial<User>;
    }
  }
}

export const authenticateUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const idToken = req.headers.authorization?.split("Bearer ")[1];
    if (!idToken) {
      return res.status(401).json({ message: "unauthorized user, token missing" });
    }

    // Verify the token using Firebase Admin SDK
    const decodedToken = await admin.auth().verifyIdToken(idToken);

    const user = await prisma.user.findUnique({
        where:{
            uuid : decodedToken.uid
        }
    })

    if(!user){
        return res.status(401).json({message:"unauthorized user, no such user in database"})
    }
    // Attach user info to request object
    req.user = {role:user.role,id:user.id};
    next();
  } catch (error) {
    console.error("Authentication error:", error);
    return res.status(401).json({ message: "unauthorized user" });
  }
};