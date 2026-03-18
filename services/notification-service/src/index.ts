/**
 * Notification Service — WebSocket real-time delivery, in-app notifications,
 * email alerts, and webhook dispatch. Consumes notification.send jobs from queue.
 */
import express from "express";
import helmet from "helmet";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { ensureQueueTable, startWorker } from "../shared/queue.js";
import { log, logError } from "../shared/logger.js";
import { getDb } from "../shared/db.js";
import { notificationRoutes } from "./routes/notifications.js";
import { webhookRoutes } from "./routes/webhooks.js";
import crypto from "crypto";

const app = express();
app.set("trust proxy", 1);
app.use(helmet());
app.use(express.json({ limit: "5mb" }));

app.use("/api/notifications", notificationRoutes);
app.use("/api/webhooks", webhookRoutes);
app.get("/health", (_req, res) => res.json({ status: "ok", service: "notification-service" }));

const server = http.createServer(app);

const wss = new WebSocketServer({ server, path: "/ws" });
const orgSockets = new Map<string, Set<WebSocket>>();

wss.on("connection", (ws, req) => {
  const url = new URL(req.url!, `http://localhost`);
  const orgId = url.searchParams.get("orgId");
  if (!orgId) { ws.close(); return; }

  if (!orgSockets.has(orgId)) orgSockets.set(orgId, new Set());
  orgSockets.get(orgId)!.add(ws);
  log(`WS connected for org ${orgId} (${orgSockets.get(orgId)!.size} clients)`, "ws");

  ws.on("close", () => {
    orgSockets.get(orgId)?.delete(ws);
    if (orgSockets.get(orgId)?.size === 0) orgSockets.delete(orgId);
  });
  ws.on("error", (err) => logError(`WS error for org ${orgId}`, "ws", err));
});

export function broadcastToOrg(orgId: string, data: object) {
  const clients = orgSockets.get(orgId);
  if (!clients) return;
  const payload = JSON.stringify(data);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  }
}

const db = getDb();

startWorker<{
  orgId: string; type: string; title: string; message: string;
  link?: string; priority?: string; finding?: any; deduplicate?: boolean;
}>("notification.send", async (job) => {
  const { orgId, type, title, message, link, priority, finding, deduplicate } = job.payload;

  const users = await db.query.users.findMany({ where: (u: any, { eq }: any) => eq(u.orgId, orgId) });

  for (const user of users) {
    if (deduplicate) {
      const recent = await db.query.notifications.findFirst({
        where: (n: any, { eq, and, gte }: any) => and(
          eq(n.userId, user.id), eq(n.title, title),
          gte(n.createdAt, new Date(Date.now() - 60 * 60 * 1000).toISOString())
        ),
      });
      if (recent) continue;
    }
    const notifId = crypto.randomUUID();
    await db.insert(db.schema.notifications).values({ id: notifId, userId: user.id, orgId, type, title, message, link, priority: priority || "normal", read: false, createdAt: new Date().toISOString() });
  }

  broadcastToOrg(orgId, { type: "notification", data: { type, title, message, link } });

  if (finding && (finding.severity === "Critical" || finding.severity === "High")) {
    const { dispatchWebhookEvent } = await import("./webhook-dispatcher.js");
    await dispatchWebhookEvent(orgId, "finding.created", { finding });
  }

  log(`Notification sent to org ${orgId}: ${title}`, "notification");
}, { pollIntervalMs: 1000, concurrency: 5 });

const PORT = parseInt(process.env.PORT || "3004", 10);

async function main() {
  await ensureQueueTable();
  server.listen(PORT, () => log(`Notification service listening on port ${PORT}`, "notification"));
}

main().catch((err) => { logError("Startup failed", "notification", err); process.exit(1); });
