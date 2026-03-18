/**
 * Remediation Engine — re-exported from the original monolith logic.
 * Copy the contents of server/remediation-engine.ts here.
 */
export async function generateRemediation(finding: any): Promise<any> {
  return {
    findingId: finding.id,
    ruleId: finding.ruleId,
    steps: [],
    cli: null,
    terraform: null,
  };
}
