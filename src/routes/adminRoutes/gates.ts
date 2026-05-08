import { Router, type Request, type Response } from "express";
import { getMQTTClient } from "../../db&init/mqtt.js";
import { getSocketServer } from "../../db&init/socket.js";
import { HANDLE_GATE_EXIT_EMIT } from "../../constants/constants.js";
import { prisma } from "../prsimaForRouters.js";

const router = Router();

/* ---------------- GET ALL GATES ---------------- */
router.get("/", async (req: Request, res: Response) => {
  try {
    const gates = await prisma.gate.findMany({ orderBy: { createdAt: "asc" } });
    res.status(200).json({ success: true, data: gates });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/* ---------------- UPDATE GATE ---------------- */
router.patch("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, type, status } = req.body;

  if(!id) {
    return res.status(400).json({ error: "Gate ID is required in the URL." });
  }
  try {
    const gate = await prisma.gate.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(type && { type }),
        ...(status && { status }),
      },
    });

    // لو الـ status اتغير — ابعت MQTT command للـ hardware
    if (status) {
      const mqttClient = getMQTTClient();
      const command = status === "OPEN" ? "OPEN" : "CLOSE";
      mqttClient.publish(
        `garage/gate/admin/command/${command}`,
        JSON.stringify({ command, reason: "ADMIN_UPDATE", timestamp: new Date().toISOString() }),
        { qos: 1 }
      );
    }

    res.status(200).json({ success: true, data: gate });
  } catch (error: any) {
    if (error.code === "P2025") {
      res.status(404).json({ error: "Gate not found" });
      return;
    }
    res.status(500).json({ error: error.message });
  }
});

/* ---------------- FORCE GATE COMMAND ---------------- */
router.post("/force-command", async (req: Request, res: Response) => {
  const mqttClient = getMQTTClient();
  const { command, userId } = req.body;

  if (!command || typeof command !== "string") {
    return res.status(400).json({ error: "command is required and must be a string." });
  }

  const allowedCommands = ["OPEN", "CLOSE", "LOCK", "UNLOCK"];
  if (!allowedCommands.includes(command.toUpperCase())) {
    return res.status(400).json({
      error: `Invalid command. Must be one of: ${allowedCommands.join(", ")}`,
    });
  }

  try {
    mqttClient.publish(
      `garage/gate/admin/command/${command.toUpperCase()}`,
      JSON.stringify({ command: command.toUpperCase(), reason: "ADMIN_OVERRIDE", timestamp: new Date().toISOString() }),
      { qos: 1 }
    );

    if (userId && typeof userId === "number") {
      try {
        const io = getSocketServer();
        io.to(`user_${userId}`).emit(HANDLE_GATE_EXIT_EMIT, {
          decision: command.toUpperCase() === "OPEN" ? "ALLOW_EXIT" : "DENY_EXIT",
          reason: "ADMIN_OVERRIDE",
          message: `Gate ${command.toUpperCase()} command issued by admin.`,
        });
      } catch (socketError: any) {
        console.error("Socket emit failed:", socketError.message);
      }
    }

    res.status(200).json({ message: `Force ${command.toUpperCase()} command sent.` });
  } catch (error: any) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;