import { Router } from "express";
import { getDb } from "../../shared/db.js";

export const modelRoutes = Router();
const db = getDb();

modelRoutes.get("/", async (req, res) => {
  try {
    const orgId = (req.session as any)?.orgId;
    if (!orgId) return res.status(401).json({ error: "Unauthorized" });
    const models = await db.query.aiModels.findMany({ where: (m: any, { eq }: any) => eq(m.orgId, orgId) });
    res.json(models);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

modelRoutes.get("/:id", async (req, res) => {
  try {
    const orgId = (req.session as any)?.orgId;
    const model = await db.query.aiModels.findFirst({ where: (m: any, { eq, and }: any) => and(eq(m.id, req.params.id), eq(m.orgId, orgId)) });
    if (!model) return res.status(404).json({ error: "Not found" });
    res.json(model);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

modelRoutes.delete("/:id", async (req, res) => {
  try {
    const orgId = (req.session as any)?.orgId;
    const model = await db.query.aiModels.findFirst({ where: (m: any, { eq, and }: any) => and(eq(m.id, req.params.id), eq(m.orgId, orgId)) });
    if (!model) return res.status(404).json({ error: "Not found" });
    await db.delete(db.schema.aiModels).where(db.schema.aiModels.id.eq(req.params.id));
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
