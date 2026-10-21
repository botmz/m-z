import { createHash, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import argon2 from "argon2";
import type { Request, Response, NextFunction } from "express";
import { pool, audit } from "./store";

const cookieName = "mz_session";
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export async function initializeAdmin() {
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    throw new Error("يلزم SESSION_SECRET عشوائي بطول 32 حرفاً على الأقل لتشفير جلسة Telegram");
  }
  const { rows } = await pool.query("SELECT id FROM admin_settings WHERE id=1");
  if (!rows.length && process.env.ADMIN_INITIAL_PASSWORD) {
    const hash = await argon2.hash(process.env.ADMIN_INITIAL_PASSWORD, { type: argon2.argon2id });
    await pool.query("INSERT INTO admin_settings(id,password_hash) VALUES(1,$1) ON CONFLICT(id) DO NOTHING", [hash]);
    await audit("info", "security", "تم إعداد دخول المالك بكلمة مرور مشفرة");
    if (process.env.ADMIN_INITIAL_PASSWORD.length < 12) {
      await audit("warning", "security", "يُنصح بتغيير كلمة المرور الأولية من إعدادات الأمان إلى كلمة قوية من 12 حرفاً على الأقل");
    }
  }
  await pool.query("DELETE FROM admin_sessions WHERE expires_at < now()");
}
export function encrypt(text: string) {
  const key = createHash("sha256").update(process.env.SESSION_SECRET!).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}
export function decrypt(text: string) {
  const key = createHash("sha256").update(process.env.SESSION_SECRET!).digest();
  const raw = Buffer.from(text, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}
function sessionToken(req: Request): string {
  const cookies = req.headers.cookie?.split(";").map(v => v.trim()) ?? [];
  return cookies.find(v => v.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1) ?? "";
}
export async function isAuthenticated(req: Request): Promise<boolean> {
  const token = sessionToken(req);
  if (!/^[a-f0-9]{64}$/.test(token)) return false;
  const { rows } = await pool.query("SELECT 1 FROM admin_sessions WHERE token_hash=$1 AND expires_at>now()", [digest(token)]);
  return rows.length > 0;
}
const cookieOptions = (req: Request) => ({
  httpOnly: true, secure: req.secure || req.headers["x-forwarded-proto"] === "https",
  sameSite: "lax" as const, path: "/api/mz", maxAge: 8 * 60 * 60 * 1000,
});
export async function loginSession(req: Request, res: Response) {
  const old = sessionToken(req);
  if (old) await pool.query("DELETE FROM admin_sessions WHERE token_hash=$1", [digest(old)]);
  const token = randomBytes(32).toString("hex");
  await pool.query("INSERT INTO admin_sessions(token_hash,expires_at) VALUES($1,now()+interval '8 hours')", [digest(token)]);
  res.cookie(cookieName, token, cookieOptions(req));
}
export async function logoutSession(req: Request, res: Response) {
  await pool.query("DELETE FROM admin_sessions WHERE token_hash=$1", [digest(sessionToken(req))]);
  res.clearCookie(cookieName, cookieOptions(req));
}
export async function verifyPassword(password: string) {
  const { rows } = await pool.query("SELECT password_hash FROM admin_settings WHERE id=1");
  // Run a fixed-cost hash even before setup; no plaintext comparison or timing fast path.
  if (!rows[0]) { await argon2.hash(password); return false; }
  return argon2.verify(rows[0].password_hash, password);
}
export async function updatePassword(password: string) {
  const hash = await argon2.hash(password, { type: argon2.argon2id });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("UPDATE admin_settings SET password_hash=$1,updated_at=now() WHERE id=1", [hash]);
    await client.query("DELETE FROM admin_sessions");
    await client.query("COMMIT");
  } catch (e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
}
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!await isAuthenticated(req)) { res.status(401).json({ error: "يرجى تسجيل الدخول" }); return; }
  next();
}
export function sameOrigin(req: Request, res: Response, next: NextFunction) {
  res.setHeader("Cache-Control", "no-store");
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.get("origin");
    const allowed = [req.get("host"), req.get("x-forwarded-host")].filter(Boolean);
    const site = req.get("sec-fetch-site");
    let invalidOrigin = false;
    if (origin) {
      try { invalidOrigin = !allowed.includes(new URL(origin).host); } catch { invalidOrigin = true; }
    }
    if (invalidOrigin || site === "cross-site" || (req.method !== "DELETE" && !req.is("application/json"))) {
      res.status(403).json({ error: "طلب غير مسموح من خارج لوحة التحكم" }); return;
    }
  }
  next();
}
