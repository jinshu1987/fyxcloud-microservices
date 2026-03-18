import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { getDb } from "../../shared/db.js";

const db = getDb();

export const PERMISSIONS: Record<string, string[]> = {
  Owner: ["manage_org", "manage_users", "manage_projects", "manage_connectors", "run_scans", "manage_policies", "triage_findings", "view_data", "manage_project_members"],
  Admin: ["manage_org", "manage_users", "manage_projects", "manage_connectors", "run_scans", "manage_policies", "triage_findings", "view_data", "manage_project_members"],
  "Security Engineer": ["manage_connectors", "run_scans", "manage_policies", "triage_findings", "view_data"],
  Analyst: ["triage_findings", "view_data"],
  Viewer: ["view_data"],
};

async function authenticateApiKey(req: Request): Promise<any | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer fyx_")) return null;
  const rawKey = authHeader.substring(7);
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
  const apiKey = await db.query.apiKeys.findFirst({ where: (k: any, { eq }: any) => eq(k.keyHash, keyHash) });
  if (!apiKey || apiKey.status !== "active") return null;
  if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) return null;
  const user = await db.query.users.findFirst({ where: (u: any, { eq }: any) => eq(u.id, apiKey.userId) });
  if (!user || user.status !== "Active") return null;
  return { user, apiKey };
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  if ((req.session as any).userId) return next();
  const result = await authenticateApiKey(req);
  if (result) {
    (req.session as any).userId = result.user.id;
    (req.session as any).orgId = result.user.orgId;
    (req as any).user = result.user;
    (req as any).isApiKeyAuth = true;
    return next();
  }
  return res.status(401).json({ error: "Authentication required" });
}

export async function requireActiveUser(req: Request, res: Response, next: NextFunction) {
  const userId = (req.session as any).userId;
  if (!userId) return res.status(401).json({ error: "Authentication required" });
  const user = await db.query.users.findFirst({ where: (u: any, { eq }: any) => eq(u.id, userId) });
  if (!user) return res.status(401).json({ error: "User not found" });
  if (user.status !== "Active") return res.status(403).json({ error: "Account is disabled" });
  (req as any).user = user;
  next();
}

export function requireSuperAdmin() {
  return async (req: Request, res: Response, next: NextFunction) => {
    await requireAuth(req, res, async () => {
      const user = (req as any).user;
      if (!user?.isSuperAdmin) return res.status(403).json({ error: "Superadmin access required" });
      next();
    });
  };
}

export function requirePermission(...permissions: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    await requireAuth(req, res, async () => {
      const user = (req as any).user;
      if (!user) return res.status(401).json({ error: "Authentication required" });
      const userPermissions = PERMISSIONS[user.role] || [];
      const hasAll = permissions.every((p) => userPermissions.includes(p));
      if (!hasAll) return res.status(403).json({ error: "Insufficient permissions" });
      next();
    });
  };
}
