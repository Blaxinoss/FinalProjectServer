import { Router, type Request, type Response } from "express";
import { prisma } from "../../routes.js";
import { TransactionStatus } from "../../../src/generated/prisma/index.js";
const router = Router();

/* ---------------- GET ALL PAYMENT TRANSACTIONS ---------------- */
router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const transactions: any[] = await prisma.paymentTransaction.findMany({
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
  try {
    if (!req.params.id) {
      res.status(400).json({ success: false, message: "Transaction ID is not provided" });
      return;
    }

    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ success: false, message: "Invalid transaction ID" });
      return;
    }

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
  try {
    if (!req.params.id) {
      res.status(400).json({ success: false, message: "Transaction ID is not provided" });
      return;
    }

    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ success: false, message: "Invalid transaction ID" });
      return;
    }

    const data = req.body;
    if (!data || Object.keys(data).length === 0) {
      res.status(400).json({ success: false, message: "No data provided to update" });
      return;
    }
    
    const updatedTransaction = await prisma.paymentTransaction.update({
      where: { id },
      data,
    });

    res.status(200).json({ success: true, data: updatedTransaction });
  } catch (error: any) {
    if (error.code === 'P2025') {
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
  try {
    if (!req.params.id) {
      res.status(400).json({ success: false, message: "Transaction ID is not provided" });
      return;
    }

    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ success: false, message: "Invalid transaction ID" });
      return;
    }

    const deletedTransaction = await prisma.paymentTransaction.delete({ where: { id } });

    res.status(200).json({ success: true, data: deletedTransaction });
  } catch (error: any) {
    if (error.code === 'P2025') {
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
  try {
    const { parkingSessionId, amount, paymentMethod, transactionStatus } = req.body;

    if (!parkingSessionId || !amount || !paymentMethod) {
      res.status(400).json({
        success: false,
        message: "Missing required fields: parkingSessionId, amount, and paymentMethod",
      });
      return;
    }

    if (typeof parkingSessionId !== 'number' || typeof amount !== 'number' || typeof paymentMethod !== 'string') {
        res.status(400).json({ success: false, message: "Invalid data types for one or more fields" });
        return;
    }

    const newTransaction = await prisma.paymentTransaction.create({
      data: { 
          parkingSessionId, 
          amount, 
          paymentMethod, 
          ...(transactionStatus && { transactionStatus }) 
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