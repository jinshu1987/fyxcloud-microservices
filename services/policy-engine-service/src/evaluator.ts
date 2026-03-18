/**
 * Core policy evaluation orchestrator.
 * Imports the policy-engine logic and writes findings to DB,
 * then enqueues a notification job for the notification-service.
 */
import { getDb } from "../shared/db.js";
import { enqueue } from "../shared/queue.js";
import { log } from "../shared/logger.js";

export async function runPolicyEvaluation(orgId: string): Promise<any[]> {
  const db = getDb();

  const { seedDefaultPolicies, evaluatePolicies } = await import("./engine/policy-engine.js");
  await seedDefaultPolicies(orgId, db);
  const findings = await evaluatePolicies(orgId, db);

  if (findings.length > 0) {
    await enqueue("notification.send", {
      orgId,
      type: "scan_completed",
      title: "Auto-Scan Complete",
      message: `Scheduled scan found ${findings.length} finding(s). Review the results in Findings.`,
      link: "/findings",
    }, { maxAttempts: 3 });

    const critical = findings.filter((f: any) => f.severity === "Critical" || f.severity === "High").slice(0, 10);
    for (const cf of critical) {
      await enqueue("notification.send", {
        orgId,
        type: "policy_violated",
        title: `${cf.severity} — ${cf.ruleId}: ${cf.assetName || "Unknown asset"}`,
        message: cf.finding || "A critical policy violation was detected.",
        link: "/findings",
        priority: cf.severity === "Critical" ? "critical" : "high",
        finding: cf,
      }, { maxAttempts: 3 });
    }
  }

  return findings;
}
