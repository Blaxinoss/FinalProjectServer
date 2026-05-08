import { Router, type Request, type Response } from "express";
import { prisma } from "../prsimaForRouters.js";
import { getSocketServer } from "../../db&init/socket.js";
import { USER_DATA_UPDATED } from "../../constants/constants.js";

const router = Router();

/* ---------------- GET ALL USERS ---------------- */
// Admin Only
router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const users = await prisma.user.findMany();
    res.status(200).json({ success: true, data: users });
  } catch (error: any) {
    res.status(500).json({
      code: error.code || null,
      message: `Error while fetching users: ${error.message || "Unknown error"}`,
    });
  }
});

/* ---------------- DELETE USER ---------------- */
router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  if (!req.params.id) {
    res.status(400).json({ message: "No id provided to delete" });
    return;
  }

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ message: "Invalid user ID" });
    return;
  }

  try {
    const deletedUser = await prisma.user.delete({ where: { id } });
    res.status(200).json({ message: "User deleted successfully", user: deletedUser });
  } catch (error: any) {
    if (error.code === "P2025") {
      res.status(404).json({ message: "User not found" });
      return;
    }
    res.status(500).json({
      code: error.code || null,
      message: `Error while deleting the user: ${error.message || "Unknown error"}`,
    });
  }
});

/* ---------------- UPDATE USER ---------------- */
router.put("/:id", async (req: Request, res: Response): Promise<void> => {
  if (!req.params.id) {
    res.status(400).json({ message: "No id provided to update" });
    return;
  }

  const user_id = parseInt(req.params.id, 10);
  if (isNaN(user_id)) {
    res.status(400).json({ message: "Invalid user ID" });
    return;
  }

  // Whitelist only fields an admin is allowed to update
  const { name, phone, email, address, role, notificationAllowed, hasOutstandingDebt, licenseExpiry, licenseNumber } = req.body;

  const updateData: Record<string, any> = {};
  if (name !== undefined) updateData.name = name;
  if (phone !== undefined) updateData.phone = phone;
  if (email !== undefined) updateData.email = email;
  if (address !== undefined) updateData.address = address;
  if (role !== undefined) updateData.role = role;
  if (notificationAllowed !== undefined) updateData.notificationAllowed = notificationAllowed;
  if (hasOutstandingDebt !== undefined) updateData.hasOutstandingDebt = hasOutstandingDebt;
  if (licenseExpiry !== undefined) updateData.licenseExpiry = new Date(licenseExpiry);
  if (licenseNumber !== undefined) updateData.licenseNumber = licenseNumber;

  if (Object.keys(updateData).length === 0) {
    res.status(400).json({ message: "No valid fields provided to update" });
    return;
  }

  try {
    const updatedUser = await prisma.user.update({
      where: { id: user_id },
      data: updateData,
    });

    // --- Notify user if any sensitive field changed ---
    const sensitiveFields = ["role", "hasOutstandingDebt", "notificationAllowed"];
    const hasSensitiveChange = sensitiveFields.some((field) => field in updateData);
    if (hasSensitiveChange) {
      try {
        const io = getSocketServer();
        io.to(`user_${user_id}`).emit(USER_DATA_UPDATED, {
          message: "Your account information has been updated by the admin.",
          updatedFields: Object.keys(updateData),
        });
      } catch (socketError: any) {
        console.error("Socket emit failed (user-updated):", socketError.message);
      }
    }

    res.status(200).json({ message: "User updated successfully", user: updatedUser });
  } catch (error: any) {
    if (error.code === "P2025") {
      res.status(404).json({ message: "User not found" });
      return;
    }
    res.status(500).json({
      code: error.code || null,
      message: `Error while updating the user: ${error.message || "Unknown error"}`,
    });
  }
});

export default router;