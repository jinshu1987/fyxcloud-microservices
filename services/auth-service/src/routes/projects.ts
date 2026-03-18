import { Router } from "express";
import { getDb } from "../../shared/db.js";
import { requireAuth, requireActiveUser, requirePermission } from "../middleware/auth.js";
import crypto from "crypto";

export const projectRoutes = Router();
const db = getDb();

projectRoutes.get("/", requireAuth, requireActiveUser, async (req, res) => {
  try {
    const orgId = (req.session as any).orgId;
    const projects = await db.query.projects.findMany({ where: (p: any, { eq }: any) => eq(p.orgId, orgId) });
    res.json(projects);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

projectRoutes.post("/", requireAuth, requireActiveUser, requirePermission("manage_projects"), async (req, res) => {
  try {
    const orgId = (req.session as any).orgId;
    const id = crypto.randomUUID();
    await db.insert(db.schema.projects).values({ id, orgId, ...req.body });
    res.status(201).json({ id });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

projectRoutes.patch("/:id", requireAuth, requireActiveUser, requirePermission("manage_projects"), async (req, res) => {
  try {
    const orgId = (req.session as any).orgId;
    const project = await db.query.projects.findFirst({ where: (p: any, { eq, and }: any) => and(eq(p.id, req.params.id), eq(p.orgId, orgId)) });
    if (!project) return res.status(404).json({ error: "Not found" });
    await db.update(db.schema.projects).set(req.body).where(db.schema.projects.id.eq(req.params.id));
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

projectRoutes.delete("/:id", requireAuth, requireActiveUser, requirePermission("manage_projects"), async (req, res) => {
  try {
    await db.delete(db.schema.projects).where(db.schema.projects.id.eq(req.params.id));
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
