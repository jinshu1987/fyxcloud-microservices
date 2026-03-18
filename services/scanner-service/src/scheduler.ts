/**
 * Auto-discovery scheduler — runs every 60 seconds, checks orgs with
 * auto-discovery enabled, and enqueues scan jobs for each connector.
 */
import { getDb } from "../shared/db.js";
import { enqueue } from "../shared/queue.js";
import { log, logError } from "../shared/logger.js";
import { performScan } from "./scan-runner.js";

const CHECK_INTERVAL = 60 * 1000;
let timer: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

async function recoverStaleSyncs() {
  const db = getDb();
  try {
    const orgs = await db.query.organizations.findMany();
    for (const org of orgs) {
      const connectors = await db.query.cloudConnectors.findMany({
        where: (c: any, { eq, and }: any) => and(eq(c.orgId, org.id), eq(c.syncStatus, "syncing")),
      });
      for (const connector of connectors) {
        log(`Recovering stale sync for connector "${connector.name}"`, "scheduler");
        await db.update(db.schema.cloudConnectors)
          .set({ syncStatus: "error", syncError: "Sync interrupted — service restarted" })
          .where(db.schema.cloudConnectors.id.eq(connector.id));
      }
    }
  } catch (err) { logError("Stale sync recovery failed", "scheduler", err); }
}

async function checkAndSchedule() {
  if (isRunning) return;
  isRunning = true;
  const db = getDb();
  try {
    const orgs = await db.query.organizations.findMany();
    for (const org of orgs) {
      if (org.autoDiscovery !== "true") continue;
      const intervalMs = Math.max((org.autoDiscoveryInterval || 20), 10) * 60 * 1000;
      const lastRun = org.lastAutoDiscovery ? new Date(org.lastAutoDiscovery).getTime() : 0;
      if (Date.now() - lastRun >= intervalMs) {
        await enqueue("scan.org", { orgId: org.id }, { maxAttempts: 2 });
        log(`Enqueued scan for org ${org.id}`, "scheduler");
      }
    }
  } catch (err) { logError("Scheduler check failed", "scheduler", err); }
  finally { isRunning = false; }
}

export function startDiscoveryScheduler() {
  if (timer) return;
  log("Auto-discovery scheduler started (60s interval)", "scheduler");
  recoverStaleSyncs().then(() => {
    timer = setInterval(checkAndSchedule, CHECK_INTERVAL);
    setTimeout(checkAndSchedule, 5000);
  });
}

export function stopDiscoveryScheduler() {
  if (timer) { clearInterval(timer); timer = null; }
}
