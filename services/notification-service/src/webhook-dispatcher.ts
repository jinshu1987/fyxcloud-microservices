import { getDb } from "../shared/db.js";

const db = getDb();

function buildHeaders(webhook: any): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json", "User-Agent": "FyxCloud-Webhook/1.0" };
  if (!webhook.authType || webhook.authType === "none" || !webhook.authConfig) return headers;
  try {
    const config = JSON.parse(webhook.authConfig);
    if (webhook.authType === "bearer") headers["Authorization"] = `Bearer ${config.token}`;
    else if (webhook.authType === "basic") headers["Authorization"] = `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`;
    else if (webhook.authType === "api_key") headers[config.headerName || "X-API-Key"] = config.key;
    else if (webhook.authType === "custom_header") headers[config.headerName] = config.headerValue;
  } catch {}
  return headers;
}

function buildPayload(webhook: any, event: string, data: any): any {
  const finding = data?.finding;
  switch (webhook.type) {
    case "slack":
      return { text: finding ? `:warning: *${finding.severity} Finding*: ${finding.finding}\nAsset: ${finding.assetName} | Rule: ${finding.ruleId}` : `:information_source: AI-SPM Event: ${event}` };
    case "jira": {
      let projectKey: string | undefined;
      try { projectKey = JSON.parse(webhook.authConfig || "{}").projectKey; } catch {}
      const fields: any = { summary: finding ? `[${finding.severity}] ${finding.finding}` : `AI-SPM: ${event}`, description: finding ? `Asset: ${finding.assetName}\nRule: ${finding.ruleId}` : JSON.stringify(data), priority: { name: { Critical: "Highest", High: "High", Medium: "Medium", Low: "Low" }[finding?.severity] || "Medium" } };
      if (projectKey) fields.project = { key: projectKey };
      return { fields };
    }
    case "splunk":
      return { event: { sourcetype: "ai-spm", event_type: event, ...data }, source: "fyx-cloud" };
    default:
      return { event, timestamp: new Date().toISOString(), data };
  }
}

export async function dispatchWebhookEvent(orgId: string, event: string, data: any): Promise<void> {
  const webhooks = await db.query.webhooks.findMany({
    where: (w: any, { eq, and }: any) => and(eq(w.orgId, orgId), eq(w.status, "active")),
  });
  const matching = webhooks.filter((w: any) => !w.events || JSON.parse(w.events || "[]").includes(event) || JSON.parse(w.events || "[]").includes("*"));
  await Promise.allSettled(matching.map(async (webhook: any) => {
    const payload = buildPayload(webhook, event, data);
    const headers = buildHeaders(webhook);
    try {
      const response = await fetch(webhook.url, { method: "POST", headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(10000) });
      await db.update(db.schema.webhooks).set({ lastTriggered: new Date().toISOString(), lastStatus: response.ok ? "success" : `error:${response.status}`, failureCount: response.ok ? 0 : (webhook.failureCount || 0) + 1 }).where(db.schema.webhooks.id.eq(webhook.id));
    } catch (err: any) {
      await db.update(db.schema.webhooks).set({ lastTriggered: new Date().toISOString(), lastStatus: `error:${err.message}`, failureCount: (webhook.failureCount || 0) + 1 }).where(db.schema.webhooks.id.eq(webhook.id));
    }
  }));
}

export async function testWebhook(webhook: any): Promise<{ success: boolean; status: number | null; message: string; responseBody: string | null }> {
  const payload = buildPayload(webhook, "test.ping", { message: "Test webhook from Fyx Cloud AI-SPM", timestamp: new Date().toISOString() });
  const headers = buildHeaders(webhook);
  try {
    const response = await fetch(webhook.url, { method: "POST", headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(10000) });
    let responseBody = "";
    try { responseBody = (await response.text()).substring(0, 500); } catch {}
    await db.update(db.schema.webhooks).set({ lastTriggered: new Date().toISOString(), lastStatus: response.ok ? "success" : `error:${response.status}`, failureCount: response.ok ? 0 : (webhook.failureCount || 0) + 1 }).where(db.schema.webhooks.id.eq(webhook.id));
    return { success: response.ok, status: response.status, message: response.ok ? "Delivered successfully" : `HTTP ${response.status}`, responseBody };
  } catch (err: any) {
    return { success: false, status: null, message: err.message, responseBody: null };
  }
}
