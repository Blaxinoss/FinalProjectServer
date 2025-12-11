import { Router } from "express";


import userRouter from "../FlagDeletion/createUserRoute.js";
import walkInRouter from './WalkInRoute.js'

const router = Router();

router.use("/walkIn",walkInRouter);
router.use("/users", userRouter);

export default router; 