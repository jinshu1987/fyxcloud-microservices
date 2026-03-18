import { Router } from "express";
import bcrypt from "bcryptjs";
import * as OTPAuth from "otpauth";
import qrcode from "qrcode";
import crypto from "crypto";
import { getDb } from "../../shared/db.js";
import { requireAuth, requireActiveUser } from "../middleware/auth.js";
import { sendVerificationEmail, sendPasswordResetEmail } from "../services/email.js";
import { createAuditLog } from "../services/audit.js";

export const authRoutes = Router();
const db = getDb();

authRoutes.post("/signup", async (req, res) => {
  try {
    const { firstName, lastName, email, password, orgName } = req.body;
    if (!firstName || !lastName || !email || !password || !orgName) {
      return res.status(400).json({ error: "All fields are required" });
    }
    const existingUser = await db.query.users.findFirst({ where: (u: any, { eq }: any) => eq(u.email, email.toLowerCase()) });
    if (existingUser) return res.status(409).json({ error: "Email already registered" });

    const passwordHash = await bcrypt.hash(password, 12);
    const orgId = crypto.randomUUID();
    const userId = crypto.randomUUID();

    await db.transaction(async (tx: any) => {
      await tx.insert(db.schema.organizations).values({ id: orgId, name: orgName, plan: "free" });
      await tx.insert(db.schema.users).values({
        id: userId, orgId, email: email.toLowerCase(),
        firstName, lastName, role: "Owner",
        passwordHash, status: "Active",
      });
    });

    const verificationToken = crypto.randomBytes(32).toString("hex");
    await db.insert(db.schema.emailVerificationTokens).values({ userId, token: verificationToken, expiresAt: new Date(Date.now() + 86400000).toISOString() });
    await sendVerificationEmail(`${firstName} ${lastName}`, email, verificationToken);

    (req.session as any).userId = userId;
    (req.session as any).orgId = orgId;

    res.status(201).json({ id: userId, email, firstName, lastName, orgId, role: "Owner" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

authRoutes.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });

    const user = await db.query.users.findFirst({ where: (u: any, { eq }: any) => eq(u.email, email.toLowerCase()) });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    if (user.status !== "Active") return res.status(403).json({ error: "Account is disabled" });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: "Invalid credentials" });

    if (user.mfaEnabled) {
      (req.session as any).mfaPendingUserId = user.id;
      return res.json({ requiresMfa: true });
    }

    (req.session as any).userId = user.id;
    (req.session as any).orgId = user.orgId;
    await createAuditLog({ orgId: user.orgId, userId: user.id, action: "login", resourceType: "user", resourceId: user.id, details: { email } });

    res.json({ id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, orgId: user.orgId, role: user.role });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

authRoutes.post("/logout", (req, res) => {
  req.session.destroy(() => {});
  res.json({ ok: true });
});

authRoutes.get("/me", requireAuth, requireActiveUser, async (req, res) => {
  const user = (req as any).user;
  res.json({ id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, orgId: user.orgId, role: user.role, isSuperAdmin: user.isSuperAdmin, mfaEnabled: user.mfaEnabled });
});

authRoutes.post("/mfa/verify", async (req, res) => {
  try {
    const { token } = req.body;
    const pendingUserId = (req.session as any).mfaPendingUserId;
    if (!pendingUserId) return res.status(400).json({ error: "No MFA session" });

    const user = await db.query.users.findFirst({ where: (u: any, { eq }: any) => eq(u.id, pendingUserId) });
    if (!user || !user.mfaSecret) return res.status(400).json({ error: "User not found" });

    const totp = new OTPAuth.TOTP({
      issuer: "Fyx Cloud AI-SPM", label: user.email, algorithm: "SHA1", digits: 6, period: 30,
      secret: OTPAuth.Secret.fromBase32(user.mfaSecret),
    });
    const delta = totp.validate({ token, window: 1 });
    if (delta === null) return res.status(401).json({ error: "Invalid MFA token" });

    delete (req.session as any).mfaPendingUserId;
    (req.session as any).userId = user.id;
    (req.session as any).orgId = user.orgId;

    res.json({ id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, orgId: user.orgId, role: user.role });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

authRoutes.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    const user = await db.query.users.findFirst({ where: (u: any, { eq }: any) => eq(u.email, email.toLowerCase()) });
    if (user) {
      const token = crypto.randomBytes(32).toString("hex");
      await db.insert(db.schema.passwordResetTokens).values({ userId: user.id, token, expiresAt: new Date(Date.now() + 3600000).toISOString() });
      await sendPasswordResetEmail(`${user.firstName} ${user.lastName}`, user.email, token);
    }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

authRoutes.post("/reset-password", async (req, res) => {
  try {
    const { token, password } = req.body;
    const record = await db.query.passwordResetTokens.findFirst({ where: (t: any, { eq }: any) => eq(t.token, token) });
    if (!record || new Date(record.expiresAt) < new Date()) return res.status(400).json({ error: "Invalid or expired token" });

    const hash = await bcrypt.hash(password, 12);
    await db.update(db.schema.users).set({ passwordHash: hash }).where(db.schema.users.id.eq(record.userId));
    await db.delete(db.schema.passwordResetTokens).where(db.schema.passwordResetTokens.token.eq(token));

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

authRoutes.get("/verify-email", async (req, res) => {
  try {
    const { token } = req.query as { token: string };
    const record = await db.query.emailVerificationTokens.findFirst({ where: (t: any, { eq }: any) => eq(t.token, token) });
    if (!record || new Date(record.expiresAt) < new Date()) return res.status(400).json({ error: "Invalid or expired token" });

    await db.update(db.schema.users).set({ emailVerified: true }).where(db.schema.users.id.eq(record.userId));
    await db.delete(db.schema.emailVerificationTokens).where(db.schema.emailVerificationTokens.token.eq(token));

    res.redirect("/?emailVerified=true");
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
