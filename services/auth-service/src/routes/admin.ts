import { Router } from "express";
import { getDb } from "../../shared/db.js";
import { requireSuperAdmin } from "../middleware/auth.js";

export const adminRoutes = Router();
const db = getDb();

adminRoutes.get("/users", requireSuperAdmin(), async (req, res) => {
  try {
    const users = await db.query.users.findMany();
    res.json(users.map((u: any) => ({ ...u, passwordHash: undefined })));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

adminRoutes.get("/organizations", requireSuperAdmin(), async (req, res) => {
  try {
    const orgs = await db.query.organizations.findMany();
    res.json(orgs);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

adminRoutes.patch("/users/:id", requireSuperAdmin(), async (req, res) => {
  try {
    const allowed = ["status", "isSuperAdmin", "role"];
    const updates: Record<string, any> = {};
    for (const key of allowed) { if (key in req.body) updates[key] = req.body[key]; }
    await db.update(db.schema.users).set(updates).where(db.schema.users.id.eq(req.params.id));
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
