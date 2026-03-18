/**
 * API Gateway — single ingress point for all client traffic.
 * Routes requests to downstream microservices and handles:
 *   - Session-based authentication validation
 *   - Rate limiting
 *   - WebSocket upgrade proxying to notification-service
 */
import express from "express";
import helmet from "helmet";
import compression from "compression";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import rateLimit from "express-rate-limit";
import { createProxyMiddleware } from "http-proxy-middleware";
import pg from "pg";
import http from "http";

const { Pool } = pg;
const app = express();
const PgSession = connectPgSimple(session);

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression() as any);
app.use(express.json({ limit: "10mb" }));

app.use(
  session({
    store: new PgSession({ pool, tableName: "session", createTableIfMissing: true }),
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: "lax",
    },
  })
);

const globalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 500, standardHeaders: true, legacyHeaders: false });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
app.use(globalLimiter);

function upstream(url: string) {
  return createProxyMiddleware({ target: url, changeOrigin: true });
}

const AUTH_SERVICE      = process.env.AUTH_SERVICE_URL      || "http://auth-service:3001";
const SCANNER_SERVICE   = process.env.SCANNER_SERVICE_URL   || "http://scanner-service:3002";
const POLICY_SERVICE    = process.env.POLICY_SERVICE_URL    || "http://policy-engine-service:3003";
const NOTIF_SERVICE     = process.env.NOTIFICATION_SERVICE_URL || "http://notification-service:3004";
const BILLING_SERVICE   = process.env.BILLING_SERVICE_URL   || "http://billing-service:3005";
const REPORT_SERVICE    = process.env.REPORT_SERVICE_URL    || "http://report-service:3006";

app.use("/api/auth", authLimiter, upstream(AUTH_SERVICE));
app.use("/api/mfa", authLimiter, upstream(AUTH_SERVICE));

app.use("/api/connectors", upstream(SCANNER_SERVICE));
app.use("/api/resources", upstream(SCANNER_SERVICE));
app.use("/api/models", upstream(SCANNER_SERVICE));
app.use("/api/scan", upstream(SCANNER_SERVICE));

app.use("/api/findings", upstream(POLICY_SERVICE));
app.use("/api/policies", upstream(POLICY_SERVICE));
app.use("/api/compliance", upstream(POLICY_SERVICE));
app.use("/api/remediation", upstream(POLICY_SERVICE));

app.use("/api/notifications", upstream(NOTIF_SERVICE));
app.use("/api/webhooks", upstream(NOTIF_SERVICE));

app.use("/api/billing", upstream(BILLING_SERVICE));
app.use("/api/stripe", upstream(BILLING_SERVICE));

app.use("/api/reports", upstream(REPORT_SERVICE));

app.use("/api/admin", upstream(AUTH_SERVICE));
app.use("/api/users", upstream(AUTH_SERVICE));
app.use("/api/organizations", upstream(AUTH_SERVICE));
app.use("/api/projects", upstream(AUTH_SERVICE));
app.use("/api/api-keys", upstream(AUTH_SERVICE));
app.use("/api/audit-logs", upstream(AUTH_SERVICE));
app.use("/api/settings", upstream(AUTH_SERVICE));
app.use("/api/team", upstream(AUTH_SERVICE));
app.use("/api/invitations", upstream(AUTH_SERVICE));
app.use("/api/licenses", upstream(AUTH_SERVICE));

app.get("/health", (_req, res) => res.json({ status: "ok", service: "api-gateway" }));

const server = http.createServer(app);

const wsProxy = createProxyMiddleware({
  target: NOTIF_SERVICE,
  changeOrigin: true,
  ws: true,
});

server.on("upgrade", (req, socket, head) => {
  if (req.url?.startsWith("/ws")) {
    (wsProxy as any).upgrade(req, socket, head);
  }
});

const PORT = parseInt(process.env.PORT || "3000", 10);
server.listen(PORT, () => {
  console.log(`[api-gateway] Listening on port ${PORT}`);
});
