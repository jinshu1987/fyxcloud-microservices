import { Router } from "express";
import { enqueue } from "../../shared/queue.js";
import { getDb } from "../../shared/db.js";
import { startWorker } from "../../shared/queue.js";
import { performScan } from "../scan-runner.js";

export const scanRoutes = Router();
const db = getDb();

startWorker<{ connectorId: string }>("scan.connector", async (job) => {
  await performScan(job.payload.connectorId);
}, { pollIntervalMs: 2000, concurrency: 5 });

startWorker<{ orgId: string }>("scan.org", async (job) => {
  const connectors = await db.query.cloudConnectors.findMany({
    where: (c: any, { eq, and, inArray }: any) => and(
      eq(c.orgId, job.payload.orgId),
      inArray(c.status, ["Active", "Connected"]),
    ),
  });
  for (const connector of connectors) {
    await enqueue("scan.connector", { connectorId: connector.id }, { maxAttempts: 2 });
  }
}, { pollIntervalMs: 5000 });

scanRoutes.post("/trigger/:connectorId", async (req, res) => {
  try {
    const orgId = (req.session as any)?.orgId;
    const connector = await db.query.cloudConnectors.findFirst({
      where: (c: any, { eq, and }: any) => and(eq(c.id, req.params.connectorId), eq(c.orgId, orgId)),
    });
    if (!connector) return res.status(404).json({ error: "Connector not found" });
    const jobId = await enqueue("scan.connector", { connectorId: connector.id }, { maxAttempts: 2 });
    res.json({ ok: true, jobId });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
