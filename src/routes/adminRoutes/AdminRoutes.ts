import { Router } from "express";
import vehiclesRouter from "./vehicles.js";
import usersRouter from "./users.js";
import parkingSessionsRouter from "./parkingSessions.js";
import paymentTransactionsRouter from "./paymentTransactions.js";
import reservationsRouter from "./reservations.js";
import slotsRouter from "./slots.js";
import alertsRouter from "./alerts.js";
import gatesRouter from "./gates.js";
import deviceStatusRouter from "./DeviceStatusRoute.js";

const router = Router();

router.use("/vehicles", vehiclesRouter);
router.use("/users", usersRouter);
router.use("/sessions", parkingSessionsRouter);
router.use("/transactions", paymentTransactionsRouter);
router.use("/reservations", reservationsRouter);
router.use("/slots", slotsRouter);
router.use("/alerts", alertsRouter);
router.use("/gates", gatesRouter);
router.use("/devices", deviceStatusRouter);

export default router;