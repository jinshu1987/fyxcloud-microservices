import { Router } from "express";
import { getDb } from "../../shared/db.js";

export const remediationRoutes = Router();
const db = getDb();

remediationRoutes.get("/:findingId", async (req, res) => {
  try {
    const orgId = (req.session as any)?.orgId;
    const finding = await db.query.policyFindings.findFirst({
      where: (f: any, { eq, and }: any) => and(eq(f.id, req.params.findingId), eq(f.orgId, orgId)),
    });
    if (!finding) return res.status(404).json({ error: "Not found" });
    const { generateRemediation } = await import("../engine/remediation-engine.js");
    const steps = await generateRemediation(finding);
    res.json(steps);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
