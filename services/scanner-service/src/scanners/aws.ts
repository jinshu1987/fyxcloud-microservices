/**
 * AWS Scanner — copy the contents of server/aws-scanner.ts here.
 * All AWS SDK imports remain the same.
 */
export async function scanAwsAccount(creds: any): Promise<{ assets: any[]; models: any[]; errors: string[]; accountId?: string }> {
  return { assets: [], models: [], errors: [] };
}
