import { Router, type Request, type Response } from "express";
import { prisma } from "../prsimaForRouters.js";
import type { User } from "../../generated/prisma/client.js";

const router = Router();

/* ---------------- GET ALL USERS Admin ---------------- */
router.get("/users", async (req: Request, res: Response): Promise<void> => {
  try {
    const users: User[] = await prisma.user.findMany();
    res.status(200).json(users);
  } catch (error: any) {
    res.status(500).json({
      code: error.code || null,
      message: `Error while fetching the user: ${error.message || "Unknown error"}`,
    });
  }
});

router.delete("/user/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.params.id) {
      res.status(400).json({ message: "no id provided to delete" });
      return;
    }

    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      res.status(400).json({ message: "Invalid user ID" });
      return;
    }

    const deletedUser = await prisma.user.delete({
      where: { id },
    });

    res.status(200).json({
      message: "User deleted successfully",
      user: deletedUser,
    });
  } catch (error: any) {
    res.status(500).json({
      code: error.code || null,
      message: `Error while deleting the user: ${error.message || "Unknown error"}`,
    });
  }
});

router.put("/user/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.params.id) {
      res.status(400).json({ message: "no id provided to update" });
      return;
    }

    const user_id = parseInt(req.params.id, 10);
    const user = req.body;

    if (!user || Object.keys(user).length === 0) {
      res.status(400).json({ message: "No user data provided" });
      return;
    }

    const newUser = await prisma.user.update({
      where: { id: user_id },
      data: { ...user },
    });

    res.status(200).json({
      message: "User updated successfully",
      user: newUser,
    });
  } catch (error: any) {
    res.status(500).json({
      code: error.code || null,
      message: `Error while updating the user: ${error.message || "Unknown error"}`,
    });
  }
});

export default router;