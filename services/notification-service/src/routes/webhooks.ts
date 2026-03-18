import { Router } from "express";
import { getDb } from "../../shared/db.js";
import { testWebhook } from "../webhook-dispatcher.js";
import crypto from "crypto";

export const webhookRoutes = Router();
const db = getDb();

webhookRoutes.get("/", async (req, res) => {
  try {
    const orgId = (req.session as any)?.orgId;
    if (!orgId) return res.status(401).json({ error: "Unauthorized" });
    const webhooks = await db.query.webhooks.findMany({ where: (w: any, { eq }: any) => eq(w.orgId, orgId) });
    res.json(webhooks.map((w: any) => ({ ...w, authConfig: undefined })));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

webhookRoutes.post("/", async (req, res) => {
  try {
    const orgId = (req.session as any)?.orgId;
    const id = crypto.randomUUID();
    await db.insert(db.schema.webhooks).values({ id, orgId, ...req.body });
    res.status(201).json({ id });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

webhookRoutes.patch("/:id", async (req, res) => {
  try {
    await db.update(db.schema.webhooks).set(req.body).where(db.schema.webhooks.id.eq(req.params.id));
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

webhookRoutes.delete("/:id", async (req, res) => {
  try {
    await db.delete(db.schema.webhooks).where(db.schema.webhooks.id.eq(req.params.id));
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

webhookRoutes.post("/:id/test", async (req, res) => {
  try {
    const webhook = await db.query.webhooks.findFirst({ where: (w: any, { eq }: any) => eq(w.id, req.params.id) });
    if (!webhook) return res.status(404).json({ error: "Not found" });
    const result = await testWebhook(webhook);
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
