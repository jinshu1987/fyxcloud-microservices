import { Router } from "express";
import { getDb } from "../../shared/db.js";
import { requireAuth, requireActiveUser, requirePermission } from "../middleware/auth.js";

export const auditRoutes = Router();
const db = getDb();

auditRoutes.get("/", requireAuth, requireActiveUser, requirePermission("view_data"), async (req, res) => {
  try {
    const orgId = (req.session as any).orgId;
    const logs = await db.query.auditLogs.findMany({
      where: (l: any, { eq }: any) => eq(l.orgId, orgId),
      orderBy: (l: any, { desc }: any) => [desc(l.createdAt)],
      limit: 500,
    });
    res.json(logs);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
