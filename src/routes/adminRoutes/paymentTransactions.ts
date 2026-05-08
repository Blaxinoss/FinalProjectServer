import { Router, type Request, type Response } from "express";
import { HANDLE_GATE_EXIT_EMIT } from "../../constants/constants.js";
import { getSocketServer } from "../../db&init/socket.js";
import { TransactionStatus } from "../../generated/prisma/client.js";
import { prisma } from "../prsimaForRouters.js";

const router = Router();

/* ---------------- GET ALL PAYMENT TRANSACTIONS ---------------- */
router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const transactions = await prisma.paymentTransaction.findMany({
      include: { parkingSession: true },
    });
    res.status(200).json({ success: true, data: transactions });
  } catch (error: any) {
    res.status(500).json({
      code: error.code || null,
      message: `Error while fetching the Payment Transactions: ${error.message || "Unknown error"}`,
    });
  }
});

/* ---------------- GET PAYMENT TRANSACTION BY ID ---------------- */
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  if (!req.params.id) {
    res.status(400).json({ success: false, message: "Transaction ID is not provided" });
    return;
  }

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ success: false, message: "Invalid transaction ID" });
    return;
  }

  try {
    const transaction = await prisma.paymentTransaction.findUnique({
      where: { id },
      include: { parkingSession: true },
    });

    if (!transaction) {
      res.status(404).json({ success: false, message: "Payment Transaction not found" });
      return;
    }

    res.status(200).json({ success: true, data: transaction });
  } catch (error: any) {
    res.status(500).json({
      code: error.code || null,
      message: `Error while fetching this specific payment transaction: ${error.message || "Unknown error"}`,
    });
  }
});

/* ---------------- UPDATE PAYMENT TRANSACTION ---------------- */
router.put("/:id", async (req: Request, res: Response): Promise<void> => {
  if (!req.params.id) {
    res.status(400).json({ success: false, message: "Transaction ID is not provided" });
    return;
  }

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ success: false, message: "Invalid transaction ID" });
    return;
  }

  // Whitelist only fields admin is allowed to modify
  const { transactionStatus, paymentMethod, paidAt } = req.body;

  const updateData: Record<string, any> = {};

  if (transactionStatus !== undefined) {
    if (!Object.values(TransactionStatus).includes(transactionStatus)) {
      res.status(400).json({ success: false, message: "Invalid transactionStatus value" });
      return;
    }
    updateData.transactionStatus = transactionStatus;
  }

  if (paymentMethod !== undefined) {
    if (!Object.values(PaymentMethod).includes(paymentMethod)) {
      res.status(400).json({ success: false, message: "Invalid paymentMethod value" });
      return;
    }
    updateData.paymentMethod = paymentMethod;
  }

  if (paidAt !== undefined) {
    const parsedDate = new Date(paidAt);
    if (isNaN(parsedDate.getTime())) {
      res.status(400).json({ success: false, message: "Invalid paidAt date" });
      return;
    }
    updateData.paidAt = parsedDate;
  }

  if (Object.keys(updateData).length === 0) {
    res.status(400).json({
      success: false,
      message: "No valid fields provided. Admins can only update: transactionStatus, paymentMethod, paidAt.",
    });
    return;
  }

  try {
    const updatedTransaction = await prisma.paymentTransaction.update({
      where: { id },
      data: updateData,
      include: { parkingSession: { select: { userId: true } } },
    });

    // --- Notify user if transaction is now COMPLETED ---
    if (updateData.transactionStatus === TransactionStatus.COMPLETED && updatedTransaction.parkingSession?.userId) {
      try {
        const io = getSocketServer();
        io.to(`user_${updatedTransaction.parkingSession.userId}`).emit(HANDLE_GATE_EXIT_EMIT, {
          decision: "ALLOW_EXIT",
          reason: "ADMIN_MARKED_COMPLETE",
          message: "Your payment has been confirmed. Please proceed to the exit gate.",
        });
      } catch (socketError: any) {
        console.error("Socket emit failed (transaction-completed):", socketError.message);
      }
    }

    res.status(200).json({ success: true, data: updatedTransaction });
  } catch (error: any) {
    if (error.code === "P2025") {
      res.status(404).json({ success: false, message: "Payment Transaction not found for update" });
      return;
    }
    res.status(500).json({
      code: error.code || null,
      message: `Error while updating the payment transaction: ${error.message || "Unknown error"}`,
    });
  }
});

/* ---------------- DELETE PAYMENT TRANSACTION ---------------- */
router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  if (!req.params.id) {
    res.status(400).json({ success: false, message: "Transaction ID is not provided" });
    return;
  }

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ success: false, message: "Invalid transaction ID" });
    return;
  }

  try {
    const deletedTransaction = await prisma.paymentTransaction.delete({ where: { id } });
    res.status(200).json({ success: true, data: deletedTransaction });
  } catch (error: any) {
    if (error.code === "P2025") {
      res.status(404).json({ success: false, message: "Payment Transaction not found for deletion" });
      return;
    }
    res.status(500).json({
      code: error.code || null,
      message: `Error while deleting the payment transaction: ${error.message || "Unknown error"}`,
    });
  }
});

/* ---------------- CREATE PAYMENT TRANSACTION ---------------- */
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const { parkingSessionId, amount, paymentMethod, transactionStatus } = req.body;

  if (!parkingSessionId || amount === undefined || !paymentMethod) {
    res.status(400).json({
      success: false,
      message: "Missing required fields: parkingSessionId, amount, and paymentMethod",
    });
    return;
  }

  if (typeof parkingSessionId !== "number" || typeof amount !== "number") {
    res.status(400).json({ success: false, message: "parkingSessionId and amount must be numbers" });
    return;
  }

  if (!Object.values(PaymentMethod).includes(paymentMethod)) {
    res.status(400).json({ success: false, message: "Invalid paymentMethod value" });
    return;
  }

  try {
    const newTransaction = await prisma.paymentTransaction.create({
      data: {
        parkingSessionId,
        amount,
        paymentMethod,
        ...(transactionStatus && { transactionStatus }),
      },
    });
    res.status(201).json({ success: true, data: newTransaction });
  } catch (error: any) {
    res.status(500).json({
      code: error.code || null,
      message: `Error while creating the payment transaction: ${error.message || "Unknown error"}`,
    });
  }
});

export default router;