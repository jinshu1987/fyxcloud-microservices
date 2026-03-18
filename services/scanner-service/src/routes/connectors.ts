import { Router } from "express";
import { getDb } from "../../shared/db.js";
import { enqueue } from "../../shared/queue.js";
import { encrypt, decrypt } from "../encryption.js";
import crypto from "crypto";

export const connectorRoutes = Router();
const db = getDb();

connectorRoutes.get("/", async (req, res) => {
  try {
    const orgId = (req.session as any)?.orgId;
    if (!orgId) return res.status(401).json({ error: "Unauthorized" });
    const connectors = await db.query.cloudConnectors.findMany({
      where: (c: any, { eq }: any) => eq(c.orgId, orgId),
    });
    res.json(connectors.map((c: any) => ({ ...c, encryptedCredentials: undefined })));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

connectorRoutes.post("/", async (req, res) => {
  try {
    const orgId = (req.session as any)?.orgId;
    if (!orgId) return res.status(401).json({ error: "Unauthorized" });
    const { name, provider, credentials, projectId } = req.body;
    if (!name || !provider || !credentials) return res.status(400).json({ error: "Missing required fields" });
    const encryptedCredentials = encrypt(JSON.stringify(credentials));
    const id = crypto.randomUUID();
    await db.insert(db.schema.cloudConnectors).values({ id, orgId, name, provider, encryptedCredentials, projectId, status: "Active", syncStatus: "idle" });
    await enqueue("scan.connector", { connectorId: id }, { maxAttempts: 2 });
    res.status(201).json({ id, name, provider, status: "Active", syncStatus: "idle" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

connectorRoutes.post("/:id/sync", async (req, res) => {
  try {
    const orgId = (req.session as any)?.orgId;
    const connector = await db.query.cloudConnectors.findFirst({ where: (c: any, { eq, and }: any) => and(eq(c.id, req.params.id), eq(c.orgId, orgId)) });
    if (!connector) return res.status(404).json({ error: "Connector not found" });
    await enqueue("scan.connector", { connectorId: connector.id }, { maxAttempts: 2 });
    res.json({ ok: true, message: "Scan enqueued" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

connectorRoutes.delete("/:id", async (req, res) => {
  try {
    const orgId = (req.session as any)?.orgId;
    const connector = await db.query.cloudConnectors.findFirst({ where: (c: any, { eq, and }: any) => and(eq(c.id, req.params.id), eq(c.orgId, orgId)) });
    if (!connector) return res.status(404).json({ error: "Connector not found" });
    await db.delete(db.schema.cloudConnectors).where(db.schema.cloudConnectors.id.eq(req.params.id));
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
