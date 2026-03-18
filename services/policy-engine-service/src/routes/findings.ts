import { Router } from "express";
import { getDb } from "../../shared/db.js";

export const findingRoutes = Router();
const db = getDb();

findingRoutes.get("/", async (req, res) => {
  try {
    const orgId = (req.session as any)?.orgId;
    if (!orgId) return res.status(401).json({ error: "Unauthorized" });
    const { projectId, status, severity, ruleId } = req.query as Record<string, string>;
    let findings = await db.query.policyFindings.findMany({
      where: (f: any, { eq }: any) => eq(f.orgId, orgId),
      orderBy: (f: any, { desc }: any) => [desc(f.detectedAt)],
    });
    if (projectId) findings = findings.filter((f: any) => f.projectId === projectId);
    if (status) findings = findings.filter((f: any) => f.status === status);
    if (severity) findings = findings.filter((f: any) => f.severity === severity);
    if (ruleId) findings = findings.filter((f: any) => f.ruleId === ruleId);
    res.json(findings);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

findingRoutes.get("/:id", async (req, res) => {
  try {
    const orgId = (req.session as any)?.orgId;
    const finding = await db.query.policyFindings.findFirst({
      where: (f: any, { eq, and }: any) => and(eq(f.id, req.params.id), eq(f.orgId, orgId)),
    });
    if (!finding) return res.status(404).json({ error: "Not found" });
    res.json(finding);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

findingRoutes.patch("/:id", async (req, res) => {
  try {
    const orgId = (req.session as any)?.orgId;
    const finding = await db.query.policyFindings.findFirst({
      where: (f: any, { eq, and }: any) => and(eq(f.id, req.params.id), eq(f.orgId, orgId)),
    });
    if (!finding) return res.status(404).json({ error: "Not found" });
    const allowed = ["status", "notes", "assignedTo"];
    const updates: Record<string, any> = {};
    for (const key of allowed) { if (key in req.body) updates[key] = req.body[key]; }
    if (req.body.status === "resolved") updates.resolvedAt = new Date().toISOString();
    await db.update(db.schema.policyFindings).set(updates).where(db.schema.policyFindings.id.eq(req.params.id));
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
