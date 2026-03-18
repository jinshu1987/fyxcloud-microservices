import { Router } from "express";
import { getDb } from "../../shared/db.js";

export const notificationRoutes = Router();
const db = getDb();

notificationRoutes.get("/", async (req, res) => {
  try {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const notifications = await db.query.notifications.findMany({
      where: (n: any, { eq }: any) => eq(n.userId, userId),
      orderBy: (n: any, { desc }: any) => [desc(n.createdAt)],
      limit: 100,
    });
    res.json(notifications);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

notificationRoutes.patch("/:id/read", async (req, res) => {
  try {
    const userId = (req.session as any)?.userId;
    await db.update(db.schema.notifications)
      .set({ read: true })
      .where(db.schema.notifications.id.eq(req.params.id));
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

notificationRoutes.post("/mark-all-read", async (req, res) => {
  try {
    const userId = (req.session as any)?.userId;
    await db.update(db.schema.notifications)
      .set({ read: true })
      .where(db.schema.notifications.userId.eq(userId));
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

notificationRoutes.delete("/:id", async (req, res) => {
  try {
    await db.delete(db.schema.notifications).where(db.schema.notifications.id.eq(req.params.id));
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
