/**
 * Scanner Service — handles cloud connector management and scanning.
 * Receives scan requests via REST and processes them synchronously or
 * enqueues them to the job_queue for the policy-engine-service to pick up.
 */
import express from "express";
import helmet from "helmet";
import { getDb } from "../shared/db.js";
import { ensureQueueTable, enqueue, startWorker } from "../shared/queue.js";
import { log, logError } from "../shared/logger.js";
import { connectorRoutes } from "./routes/connectors.js";
import { resourceRoutes } from "./routes/resources.js";
import { modelRoutes } from "./routes/models.js";
import { scanRoutes } from "./routes/scan.js";
import { startDiscoveryScheduler } from "./scheduler.js";

const app = express();
app.set("trust proxy", 1);
app.use(helmet());
app.use(express.json({ limit: "10mb" }));

app.use("/api/connectors", connectorRoutes);
app.use("/api/resources", resourceRoutes);
app.use("/api/models", modelRoutes);
app.use("/api/scan", scanRoutes);

app.get("/health", (_req, res) => res.json({ status: "ok", service: "scanner-service" }));

const PORT = parseInt(process.env.PORT || "3002", 10);

async function main() {
  await ensureQueueTable();
  startDiscoveryScheduler();
  app.listen(PORT, () => log(`Scanner service listening on port ${PORT}`, "scanner"));
}

main().catch((err) => { logError("Startup failed", "scanner", err); process.exit(1); });
