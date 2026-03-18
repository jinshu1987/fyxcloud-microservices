/**
 * Report Service — generates PDF and CSV reports from findings data.
 */
import express from "express";
import helmet from "helmet";
import { getDb } from "../shared/db.js";
import { log, logError } from "../shared/logger.js";

const app = express();
const db = getDb();

app.set("trust proxy", 1);
app.use(helmet());
app.use(express.json());

app.post("/api/reports/findings/pdf", async (req, res) => {
  try {
    const { orgId, projectId } = req.body;
    if (!orgId) return res.status(400).json({ error: "orgId required" });

    let findings = await db.query.policyFindings.findMany({ where: (f: any, { eq }: any) => eq(f.orgId, orgId) });
    if (projectId) findings = findings.filter((f: any) => f.projectId === projectId);

    const { generateFindingsPdf } = await import("./generators/pdf.js");
    const pdfBytes = await generateFindingsPdf(findings);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="fyx-cloud-findings-${Date.now()}.pdf"`);
    res.send(Buffer.from(pdfBytes));
  } catch (err: any) { logError("PDF generation failed", "report", err); res.status(500).json({ error: err.message }); }
});

app.post("/api/reports/findings/csv", async (req, res) => {
  try {
    const { orgId, projectId } = req.body;
    if (!orgId) return res.status(400).json({ error: "orgId required" });

    let findings = await db.query.policyFindings.findMany({ where: (f: any, { eq }: any) => eq(f.orgId, orgId) });
    if (projectId) findings = findings.filter((f: any) => f.projectId === projectId);

    const headers = ["ID", "Rule", "Severity", "Status", "Asset", "Asset Type", "Finding", "Detected At"];
    const rows = findings.map((f: any) => [f.id, f.ruleId, f.severity, f.status, f.assetName, f.assetType, f.finding, f.detectedAt]);
    const csv = [headers, ...rows].map(row => row.map(cell => `"${String(cell || "").replace(/"/g, '""')}"`).join(",")).join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="fyx-cloud-findings-${Date.now()}.csv"`);
    res.send(csv);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get("/health", (_req, res) => res.json({ status: "ok", service: "report-service" }));

const PORT = parseInt(process.env.PORT || "3006", 10);
app.listen(PORT, () => log(`Report service listening on port ${PORT}`, "report"));
