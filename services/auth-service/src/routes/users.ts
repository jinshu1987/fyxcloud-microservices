import { Router } from "express";
import { getDb } from "../../shared/db.js";
import { requireAuth, requireActiveUser, requirePermission } from "../middleware/auth.js";

export const userRoutes = Router();
const db = getDb();

userRoutes.get("/", requireAuth, requireActiveUser, requirePermission("manage_users"), async (req, res) => {
  try {
    const orgId = (req.session as any).orgId;
    const users = await db.query.users.findMany({ where: (u: any, { eq }: any) => eq(u.orgId, orgId) });
    res.json(users.map((u: any) => ({ ...u, passwordHash: undefined })));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

userRoutes.patch("/:id", requireAuth, requireActiveUser, requirePermission("manage_users"), async (req, res) => {
  try {
    const orgId = (req.session as any).orgId;
    const user = await db.query.users.findFirst({ where: (u: any, { eq, and }: any) => and(eq(u.id, req.params.id), eq(u.orgId, orgId)) });
    if (!user) return res.status(404).json({ error: "User not found" });
    const allowed = ["firstName", "lastName", "role", "status"];
    const updates: Record<string, any> = {};
    for (const key of allowed) { if (key in req.body) updates[key] = req.body[key]; }
    await db.update(db.schema.users).set(updates).where(db.schema.users.id.eq(req.params.id));
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

userRoutes.delete("/:id", requireAuth, requireActiveUser, requirePermission("manage_users"), async (req, res) => {
  try {
    const orgId = (req.session as any).orgId;
    const currentUser = (req as any).user;
    if (req.params.id === currentUser.id) return res.status(400).json({ error: "Cannot delete yourself" });
    const user = await db.query.users.findFirst({ where: (u: any, { eq, and }: any) => and(eq(u.id, req.params.id), eq(u.orgId, orgId)) });
    if (!user) return res.status(404).json({ error: "User not found" });
    await db.delete(db.schema.users).where(db.schema.users.id.eq(req.params.id));
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
