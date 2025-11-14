import { Router } from "express";

import parkingSessionsRouter from "./ParkingSessionRoute.js";
import vehicleRouter from "./VehicleRoute.js";
import userRouter from './UserRoute.js'
import reservationRouter from './ReservationRoute.js'
import paymentTransactionsRouter from "./PaymentTransactionRoute.js";

const router = Router();

router.use("/vehicles",vehicleRouter);
router.use("/users", userRouter);
router.use("/sessions", parkingSessionsRouter);
router.use("/transactions", paymentTransactionsRouter);
router.use("/reservations", reservationRouter);

export default router;