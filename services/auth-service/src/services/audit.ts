import { getDb } from "../../shared/db.js";

const db = getDb();

export async function createAuditLog(params: {
  orgId: string;
  userId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(db.schema.auditLogs).values({
      id: crypto.randomUUID(),
      ...params,
      details: params.details ?? {},
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Audit log write failed:", err);
  }
}
