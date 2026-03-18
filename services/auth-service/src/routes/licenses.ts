import { Router } from "express";
import { getDb } from "../../shared/db.js";
import { requireSuperAdmin } from "../middleware/auth.js";
import crypto from "crypto";

export const licenseRoutes = Router();
const db = getDb();

licenseRoutes.get("/:orgId", requireSuperAdmin(), async (req, res) => {
  try {
    const license = await db.query.licenses.findFirst({ where: (l: any, { eq }: any) => eq(l.orgId, req.params.orgId) });
    res.json(license || null);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

licenseRoutes.post("/", requireSuperAdmin(), async (req, res) => {
  try {
    const { orgId, maxAssets, maxModels, maxRepoScans, expiresAt, notes } = req.body;
    const id = crypto.randomUUID();
    await db.insert(db.schema.licenses).values({ id, orgId, maxAssets, maxModels, maxRepoScans, status: "active", expiresAt, notes }).onConflictDoUpdate({ target: db.schema.licenses.orgId, set: { maxAssets, maxModels, maxRepoScans, status: "active", expiresAt, notes } });
    res.status(201).json({ id });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

licenseRoutes.delete("/:orgId", requireSuperAdmin(), async (req, res) => {
  try {
    await db.update(db.schema.licenses).set({ status: "inactive" }).where(db.schema.licenses.orgId.eq(req.params.orgId));
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
