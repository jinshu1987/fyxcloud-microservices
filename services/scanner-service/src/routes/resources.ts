import { Router } from "express";
import { getDb } from "../../shared/db.js";

export const resourceRoutes = Router();
const db = getDb();

resourceRoutes.get("/", async (req, res) => {
  try {
    const orgId = (req.session as any)?.orgId;
    if (!orgId) return res.status(401).json({ error: "Unauthorized" });
    const resources = await db.query.resources.findMany({ where: (r: any, { eq }: any) => eq(r.orgId, orgId) });
    res.json(resources);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

resourceRoutes.get("/:id", async (req, res) => {
  try {
    const orgId = (req.session as any)?.orgId;
    const resource = await db.query.resources.findFirst({ where: (r: any, { eq, and }: any) => and(eq(r.id, req.params.id), eq(r.orgId, orgId)) });
    if (!resource) return res.status(404).json({ error: "Not found" });
    res.json(resource);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

resourceRoutes.patch("/:id", async (req, res) => {
  try {
    const orgId = (req.session as any)?.orgId;
    const resource = await db.query.resources.findFirst({ where: (r: any, { eq, and }: any) => and(eq(r.id, req.params.id), eq(r.orgId, orgId)) });
    if (!resource) return res.status(404).json({ error: "Not found" });
    await db.update(db.schema.resources).set(req.body).where(db.schema.resources.id.eq(req.params.id));
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

resourceRoutes.delete("/:id", async (req, res) => {
  try {
    const orgId = (req.session as any)?.orgId;
    const resource = await db.query.resources.findFirst({ where: (r: any, { eq, and }: any) => and(eq(r.id, req.params.id), eq(r.orgId, orgId)) });
    if (!resource) return res.status(404).json({ error: "Not found" });
    await db.delete(db.schema.resources).where(db.schema.resources.id.eq(req.params.id));
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
