import { Router } from "express";
import { getDb } from "../../shared/db.js";
import { requireAuth, requireActiveUser, requirePermission } from "../middleware/auth.js";
import crypto from "crypto";

export const orgRoutes = Router();
const db = getDb();

orgRoutes.get("/me", requireAuth, requireActiveUser, async (req, res) => {
  try {
    const orgId = (req.session as any).orgId;
    const org = await db.query.organizations.findFirst({ where: (o: any, { eq }: any) => eq(o.id, orgId) });
    if (!org) return res.status(404).json({ error: "Organization not found" });
    res.json(org);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

orgRoutes.patch("/me", requireAuth, requireActiveUser, requirePermission("manage_org"), async (req, res) => {
  try {
    const orgId = (req.session as any).orgId;
    const allowed = ["name", "autoDiscovery", "autoDiscoveryInterval"];
    const updates: Record<string, any> = {};
    for (const key of allowed) { if (key in req.body) updates[key] = req.body[key]; }
    await db.update(db.schema.organizations).set(updates).where(db.schema.organizations.id.eq(orgId));
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

orgRoutes.post("/invitations", requireAuth, requireActiveUser, requirePermission("manage_users"), async (req, res) => {
  try {
    const orgId = (req.session as any).orgId;
    const { email, role } = req.body;
    const token = crypto.randomBytes(32).toString("hex");
    await db.insert(db.schema.invitations).values({ id: crypto.randomUUID(), orgId, email, role: role || "Viewer", token, status: "pending", expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() });
    res.status(201).json({ ok: true, token });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
