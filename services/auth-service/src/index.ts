import express from "express";
import helmet from "helmet";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import * as OTPAuth from "otpauth";
import qrcode from "qrcode";
import crypto from "crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, and, desc, sql } from "drizzle-orm";
import { z } from "zod";
import nodemailer from "nodemailer";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
const db = drizzle(pool);

const app = express();
const PgSession = connectPgSimple(session);

app.set("trust proxy", 1);
app.use(helmet());
app.use(express.json());

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

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });

import { authRoutes } from "./routes/auth.js";
import { userRoutes } from "./routes/users.js";
import { orgRoutes } from "./routes/organizations.js";
import { projectRoutes } from "./routes/projects.js";
import { adminRoutes } from "./routes/admin.js";
import { apiKeyRoutes } from "./routes/api-keys.js";
import { auditRoutes } from "./routes/audit.js";
import { settingsRoutes } from "./routes/settings.js";
import { licenseRoutes } from "./routes/licenses.js";

app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/organizations", orgRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/api-keys", apiKeyRoutes);
app.use("/api/audit-logs", auditRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/licenses", licenseRoutes);
app.use("/api/team", userRoutes);
app.use("/api/invitations", orgRoutes);

app.get("/health", (_req, res) => res.json({ status: "ok", service: "auth-service" }));

const PORT = parseInt(process.env.PORT || "3001", 10);
app.listen(PORT, () => console.log(`[auth-service] Listening on port ${PORT}`));
