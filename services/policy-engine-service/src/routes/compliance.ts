import { Router } from "express";
import { getDb } from "../../shared/db.js";

export const complianceRoutes = Router();
const db = getDb();

complianceRoutes.get("/", async (req, res) => {
  try {
    const orgId = (req.session as any)?.orgId;
    if (!orgId) return res.status(401).json({ error: "Unauthorized" });
    const findings = await db.query.policyFindings.findMany({ where: (f: any, { eq }: any) => eq(f.orgId, orgId) });
    const open = findings.filter((f: any) => f.status === "open");
    const resolved = findings.filter((f: any) => f.status === "resolved");
    const score = findings.length === 0 ? 100 : Math.round(((findings.length - open.length) / findings.length) * 100);
    res.json({ score, total: findings.length, open: open.length, resolved: resolved.length });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
