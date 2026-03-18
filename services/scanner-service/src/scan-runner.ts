/**
 * Runs a full scan for a single connector.
 * After ingestion, enqueues a policy evaluation job.
 */
import { getDb } from "../shared/db.js";
import { enqueue } from "../shared/queue.js";
import { log, logError } from "../shared/logger.js";
import { decrypt } from "./encryption.js";
import { getPlanLimits } from "./billing-client.js";

async function getOrgLimit(orgId: string, limitKey: "maxAssets" | "maxModels" | "maxRepoScans") {
  const db = getDb();
  const license = await db.query.licenses.findFirst({ where: (l: any, { eq, and }: any) => and(eq(l.orgId, orgId), eq(l.status, "active")) });
  const subscription = await db.query.subscriptions.findFirst({ where: (s: any, { eq }: any) => eq(s.orgId, orgId) });
  let max: number;
  if (license && new Date(license.expiresAt) > new Date()) {
    max = (license as any)[limitKey] ?? Infinity;
  } else if (subscription?.status === "active") {
    const limits = getPlanLimits((subscription.plan || "free") as any);
    max = (limits as any)[limitKey] ?? Infinity;
  } else {
    max = getPlanLimits("free")[limitKey] ?? Infinity;
  }
  const resources = await db.query.resources.findMany({ where: (r: any, { eq }: any) => eq(r.orgId, orgId) });
  const models = await db.query.aiModels.findMany({ where: (m: any, { eq }: any) => eq(m.orgId, orgId) });
  const current = limitKey === "maxAssets" ? resources.length : models.length;
  return { current, max };
}

export async function performScan(connectorId: string): Promise<{ assetsFound: number; modelsFound: number; errors: string[] }> {
  const db = getDb();
  const connector = await db.query.cloudConnectors.findFirst({ where: (c: any, { eq }: any) => eq(c.id, connectorId) });
  if (!connector) throw new Error(`Connector ${connectorId} not found`);
  if (connector.syncStatus === "syncing") {
    log(`Connector ${connector.name} already syncing — skipping`, "scan-runner");
    return { assetsFound: 0, modelsFound: 0, errors: [] };
  }

  await db.update(db.schema.cloudConnectors).set({ syncStatus: "syncing", syncError: null }).where(db.schema.cloudConnectors.id.eq(connectorId));

  try {
    const creds = JSON.parse(decrypt(connector.encryptedCredentials!));
    let scanResult: any;

    if (connector.provider === "Azure") {
      const { scanAzureAccount } = await import("./scanners/azure.js");
      scanResult = await scanAzureAccount(creds);
    } else if (connector.provider === "GCP") {
      const { scanGcpAccount } = await import("./scanners/gcp.js");
      scanResult = await scanGcpAccount(creds);
    } else if (connector.provider === "Hugging Face") {
      const { scanHuggingFaceAccount } = await import("./scanners/huggingface.js");
      scanResult = await scanHuggingFaceAccount(creds);
    } else {
      const { scanAwsAccount } = await import("./scanners/aws.js");
      scanResult = await scanAwsAccount(creds);
    }

    if (scanResult.errors.length > 0 && scanResult.assets.length === 0 && scanResult.models.length === 0) {
      await db.update(db.schema.cloudConnectors).set({ syncStatus: "error", syncError: scanResult.errors.join("; "), lastSync: new Date().toISOString() }).where(db.schema.cloudConnectors.id.eq(connectorId));
      return { assetsFound: 0, modelsFound: 0, errors: scanResult.errors };
    }

    const assetLimit = await getOrgLimit(connector.orgId, "maxAssets");
    const modelLimit = await getOrgLimit(connector.orgId, "maxModels");
    let assetsIngested = 0;
    let modelsIngested = 0;

    for (const asset of scanResult.assets) {
      if (assetLimit.current + assetsIngested >= assetLimit.max) break;
      const existing = await db.query.resources.findFirst({ where: (r: any, { eq, and }: any) => and(eq(r.externalId, asset.externalId), eq(r.orgId, connector.orgId)) });
      if (existing) {
        await db.update(db.schema.resources).set({ ...asset, updatedAt: new Date().toISOString() }).where(db.schema.resources.id.eq(existing.id));
      } else {
        await db.insert(db.schema.resources).values({ id: crypto.randomUUID(), ...asset, connectorId: connector.id, projectId: connector.projectId, orgId: connector.orgId });
        assetsIngested++;
      }
    }

    for (const model of scanResult.models) {
      if (modelLimit.current + modelsIngested >= modelLimit.max) break;
      const existing = await db.query.aiModels.findFirst({ where: (m: any, { eq, and }: any) => and(eq(m.externalId, model.externalId), eq(m.orgId, connector.orgId)) });
      if (existing) {
        await db.update(db.schema.aiModels).set({ ...model, lastScan: new Date().toISOString() }).where(db.schema.aiModels.id.eq(existing.id));
      } else {
        await db.insert(db.schema.aiModels).values({ id: crypto.randomUUID(), ...model, connectorId: connector.id, projectId: connector.projectId, orgId: connector.orgId, lastScan: new Date().toISOString() });
        modelsIngested++;
      }
    }

    const totalFound = assetsIngested + modelsIngested;
    await db.update(db.schema.cloudConnectors).set({ syncStatus: "completed", syncError: null, assetsFound: totalFound, lastSync: new Date().toISOString(), accountId: scanResult.accountId || connector.accountId }).where(db.schema.cloudConnectors.id.eq(connectorId));

    await enqueue("policy.evaluate", { orgId: connector.orgId }, { maxAttempts: 2 });
    log(`Connector ${connector.name} scan complete — ${totalFound} assets/models`, "scan-runner");
    return { assetsFound: assetsIngested, modelsFound: modelsIngested, errors: scanResult.errors };
  } catch (err: any) {
    await db.update(db.schema.cloudConnectors).set({ syncStatus: "error", syncError: err.message, lastSync: new Date().toISOString() }).where(db.schema.cloudConnectors.id.eq(connectorId));
    throw err;
  }
}
