import { Router } from "express";

import parkingSessionsRouter from "./WalkInRoute.js";

import userRouter from "./createUserRoute.js";
import walkInRouter from './WalkInRoute.js'

const router = Router();

router.use("/walkIn",walkInRouter);
router.use("/users", userRouter);

export default router;