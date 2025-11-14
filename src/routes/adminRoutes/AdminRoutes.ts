import { Router } from "express";
import vehiclesRouter from "./vehicles.js";
import usersRouter from "./users.js";
import parkingSessionsRouter from "./parkingSessions.js";
import paymentTransactionsRouter from "./paymentTransactions.js";
import reservationsRouter from "./reservations.js";

const router = Router();

router.use("/vehicles", vehiclesRouter);
router.use("/users", usersRouter);
router.use("/sessions", parkingSessionsRouter);
router.use("/transactions", paymentTransactionsRouter);
router.use("/reservations", reservationsRouter);

export default router;