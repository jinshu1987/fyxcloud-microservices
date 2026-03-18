import nodemailer from "nodemailer";
import { getDb } from "../../shared/db.js";

const db = getDb();

async function getTransporter(): Promise<nodemailer.Transporter | null> {
  const settings = await db.query.smtpSettings.findFirst();
  if (!settings?.enabled) return null;
  try {
    const password = Buffer.from(settings.passwordEncrypted, "base64").toString();
    return nodemailer.createTransport({ host: settings.host, port: settings.port, secure: settings.secure, auth: { user: settings.username, pass: password } });
  } catch { return null; }
}

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const transporter = await getTransporter();
  if (!transporter) { console.log("SMTP not configured"); return false; }
  const settings = await db.query.smtpSettings.findFirst();
  if (!settings) return false;
  try {
    await transporter.sendMail({ from: `"${settings.fromName}" <${settings.fromEmail}>`, to, subject, html });
    return true;
  } catch (err) { console.error("Email send failed:", err); return false; }
}

const BASE_URL = process.env.APP_URL || "http://localhost:3000";

export async function sendVerificationEmail(name: string, email: string, token: string): Promise<boolean> {
  const url = `${BASE_URL}/api/auth/verify-email?token=${token}`;
  return sendEmail(email, "Verify your Fyx Cloud account", `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:40px auto;">
      <h1 style="color:#007aff;">Fyx Cloud</h1>
      <h2>Verify Your Email</h2>
      <p>Hi ${name}, please verify your email to get started.</p>
      <a href="${url}" style="display:inline-block;background:#007aff;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;">Verify Email</a>
      <p style="color:#64748b;font-size:12px;margin-top:16px;">Link expires in 24 hours.</p>
    </div>
  `);
}

export async function sendPasswordResetEmail(name: string, email: string, token: string): Promise<boolean> {
  const url = `${BASE_URL}/reset-password?token=${token}`;
  return sendEmail(email, "Reset your Fyx Cloud password", `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:40px auto;">
      <h1 style="color:#007aff;">Fyx Cloud</h1>
      <h2>Reset Your Password</h2>
      <p>Hi ${name}, click below to reset your password.</p>
      <a href="${url}" style="display:inline-block;background:#007aff;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;">Reset Password</a>
      <p style="color:#64748b;font-size:12px;margin-top:16px;">Link expires in 1 hour.</p>
    </div>
  `);
}
