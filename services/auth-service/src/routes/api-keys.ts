import { Router } from "express";
import { getDb } from "../../shared/db.js";
import { requireAuth, requireActiveUser } from "../middleware/auth.js";
import crypto from "crypto";

export const apiKeyRoutes = Router();
const db = getDb();

apiKeyRoutes.get("/", requireAuth, requireActiveUser, async (req, res) => {
  try {
    const userId = (req.session as any).userId;
    const keys = await db.query.apiKeys.findMany({ where: (k: any, { eq }: any) => eq(k.userId, userId) });
    res.json(keys.map((k: any) => ({ ...k, keyHash: undefined })));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

apiKeyRoutes.post("/", requireAuth, requireActiveUser, async (req, res) => {
  try {
    const userId = (req.session as any).userId;
    const { name, expiresAt } = req.body;
    const rawKey = `fyx_${crypto.randomBytes(32).toString("hex")}`;
    const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
    const id = crypto.randomUUID();
    await db.insert(db.schema.apiKeys).values({ id, userId, name, keyHash, status: "active", expiresAt: expiresAt || null });
    res.status(201).json({ id, name, key: rawKey });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

apiKeyRoutes.delete("/:id", requireAuth, requireActiveUser, async (req, res) => {
  try {
    await db.update(db.schema.apiKeys).set({ status: "revoked" }).where(db.schema.apiKeys.id.eq(req.params.id));
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
