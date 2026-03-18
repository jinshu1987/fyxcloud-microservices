/**
 * PDF Report Generator — uses jsPDF.
 * Copy/adapt from the existing report generation logic in server/routes.ts.
 */
export async function generateFindingsPdf(findings: any[]): Promise<Uint8Array> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF();
  doc.setFontSize(20);
  doc.text("Fyx Cloud AI-SPM — Findings Report", 14, 22);
  doc.setFontSize(10);
  doc.text(`Generated: ${new Date().toISOString()}`, 14, 30);
  doc.text(`Total Findings: ${findings.length}`, 14, 38);

  let y = 50;
  for (const f of findings.slice(0, 50)) {
    if (y > 270) { doc.addPage(); y = 20; }
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(`[${f.severity}] ${f.ruleId}: ${f.finding?.substring(0, 80) || ""}`, 14, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Asset: ${f.assetName || ""} | Status: ${f.status || ""} | Detected: ${f.detectedAt || ""}`, 14, y + 5);
    y += 15;
  }

  return doc.output("arraybuffer") as unknown as Uint8Array;
}
