
import type { NextFunction, Request, Response } from "express";
import { userRole } from "../generated/prisma/client.js";

export const requireAdminRule=(req:Request,res:Response,next:NextFunction)=>{

    if(!req.user || req.user?.role !== userRole.ADMIN){
        return res.status(403).json({message :"forbidden, admin access required, insufficient permissions"})
    }
    next();

}