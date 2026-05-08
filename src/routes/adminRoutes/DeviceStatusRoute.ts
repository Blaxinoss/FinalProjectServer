import { Router, type Request, type Response } from "express";
import DeviceStatus from "../../mongo_Models/deviceStatus.js";

const router = Router();

/* ---------------- GET ALL DEVICES ---------------- */
router.get("/", async (req: Request, res: Response) => {
  try {
    const devices = await DeviceStatus.find().sort({ lastSeen: -1 });
    res.status(200).json({ success: true, data: devices });
  } catch (error: any) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/* ---------------- GET DEVICE BY ID ---------------- */
router.get("/:deviceId", async (req: Request, res: Response) => {
  try {
    const device = await DeviceStatus.findById(req.params.deviceId);
    if (!device) {
      res.status(404).json({ error: "Device not found" });
      return;
    }
    res.status(200).json({ success: true, data: device });
  } catch (error: any) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/* ---------------- CREATE DEVICE ---------------- */
router.post("/", async (req: Request, res: Response) => {
  const { name, type, status, slotId } = req.body;

  if (!name || !type) {
    res.status(400).json({ error: "name and type are required" });
    return;
  }

  try {
    const existing = await DeviceStatus.findOne({ name });
    if (existing) {
      res.status(409).json({ error: "Device with this name already exists" });
      return;
    }

 const device = await DeviceStatus.create({
  deviceId: `device_${Date.now()}`,  // ✅
  name,
  type,
  status: status ?? "offline",
  slotId: slotId ?? null,
  lastSeen: new Date(),              // ✅
});

    res.status(201).json({ success: true, data: device });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/* ---------------- UPDATE DEVICE ---------------- */
router.patch("/:deviceId", async (req: Request, res: Response) => {
  const { name, type, status, slotId } = req.body;

  try {
    const device = await DeviceStatus.findByIdAndUpdate(
      req.params.deviceId,
      { $set: { ...(name && { name }), ...(type && { type }), ...(status && { status }), ...(slotId !== undefined && { slotId }) } },
      { new: true }
    );

    if (!device) {
      res.status(404).json({ error: "Device not found" });
      return;
    }

    res.status(200).json({ success: true, data: device });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/* ---------------- DELETE DEVICE ---------------- */
router.delete("/:deviceId", async (req: Request, res: Response) => {
  try {
    const device = await DeviceStatus.findByIdAndDelete(req.params.deviceId);

    if (!device) {
      res.status(404).json({ error: "Device not found" });
      return;
    }

    res.status(200).json({ success: true, message: "Device deleted" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;