import { Router } from "express";
import { getDb } from "../../shared/db.js";
import { requireAuth, requireActiveUser, requirePermission } from "../middleware/auth.js";
import crypto from "crypto";

export const settingsRoutes = Router();
const db = getDb();

settingsRoutes.get("/smtp", requireAuth, requireActiveUser, requirePermission("manage_org"), async (req, res) => {
  try {
    const orgId = (req.session as any).orgId;
    const settings = await db.query.smtpSettings.findFirst({ where: (s: any, { eq }: any) => eq(s.orgId, orgId) });
    if (!settings) return res.json(null);
    res.json({ ...settings, passwordEncrypted: undefined });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

settingsRoutes.post("/smtp", requireAuth, requireActiveUser, requirePermission("manage_org"), async (req, res) => {
  try {
    const orgId = (req.session as any).orgId;
    const { host, port, secure, username, password, fromName, fromEmail, enabled } = req.body;
    const passwordEncrypted = Buffer.from(password).toString("base64");
    const existing = await db.query.smtpSettings.findFirst({ where: (s: any, { eq }: any) => eq(s.orgId, orgId) });
    if (existing) {
      await db.update(db.schema.smtpSettings).set({ host, port, secure, username, passwordEncrypted, fromName, fromEmail, enabled }).where(db.schema.smtpSettings.orgId.eq(orgId));
    } else {
      await db.insert(db.schema.smtpSettings).values({ id: crypto.randomUUID(), orgId, host, port, secure, username, passwordEncrypted, fromName, fromEmail, enabled });
    }
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
