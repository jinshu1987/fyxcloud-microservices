import { Router } from "express";
import { getDb } from "../../shared/db.js";
import crypto from "crypto";

export const policyRoutes = Router();
const db = getDb();

policyRoutes.get("/", async (req, res) => {
  try {
    const orgId = (req.session as any)?.orgId;
    if (!orgId) return res.status(401).json({ error: "Unauthorized" });
    const policies = await db.query.policies.findMany({ where: (p: any, { eq }: any) => eq(p.orgId, orgId) });
    res.json(policies);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

policyRoutes.post("/", async (req, res) => {
  try {
    const orgId = (req.session as any)?.orgId;
    const id = crypto.randomUUID();
    await db.insert(db.schema.policies).values({ id, orgId, ...req.body });
    res.status(201).json({ id });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

policyRoutes.patch("/:id", async (req, res) => {
  try {
    const orgId = (req.session as any)?.orgId;
    const policy = await db.query.policies.findFirst({ where: (p: any, { eq, and }: any) => and(eq(p.id, req.params.id), eq(p.orgId, orgId)) });
    if (!policy) return res.status(404).json({ error: "Not found" });
    await db.update(db.schema.policies).set(req.body).where(db.schema.policies.id.eq(req.params.id));
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

policyRoutes.delete("/:id", async (req, res) => {
  try {
    const orgId = (req.session as any)?.orgId;
    await db.delete(db.schema.policies).where(db.schema.policies.id.eq(req.params.id));
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
