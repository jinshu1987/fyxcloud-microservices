/**
 * Policy Engine Service — consumes policy.evaluate jobs from the queue
 * and also exposes REST endpoints for findings, policies, compliance, and remediation.
 */
import express from "express";
import helmet from "helmet";
import { ensureQueueTable, startWorker } from "../shared/queue.js";
import { log, logError } from "../shared/logger.js";
import { findingRoutes } from "./routes/findings.js";
import { policyRoutes } from "./routes/policies.js";
import { complianceRoutes } from "./routes/compliance.js";
import { remediationRoutes } from "./routes/remediation.js";
import { runPolicyEvaluation } from "./evaluator.js";

const app = express();
app.set("trust proxy", 1);
app.use(helmet());
app.use(express.json({ limit: "10mb" }));

app.use("/api/findings", findingRoutes);
app.use("/api/policies", policyRoutes);
app.use("/api/compliance", complianceRoutes);
app.use("/api/remediation", remediationRoutes);

app.get("/health", (_req, res) => res.json({ status: "ok", service: "policy-engine-service" }));

const PORT = parseInt(process.env.PORT || "3003", 10);

async function main() {
  await ensureQueueTable();

  startWorker<{ orgId: string }>("policy.evaluate", async (job) => {
    log(`Running policy evaluation for org ${job.payload.orgId}`, "policy-worker");
    const findings = await runPolicyEvaluation(job.payload.orgId);
    log(`Policy evaluation complete — ${findings.length} finding(s) for org ${job.payload.orgId}`, "policy-worker");
  }, { pollIntervalMs: 3000, concurrency: 3 });

  app.listen(PORT, () => log(`Policy engine service listening on port ${PORT}`, "policy-engine"));
}

main().catch((err) => { logError("Startup failed", "policy-engine", err); process.exit(1); });
