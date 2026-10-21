import { Router, type IRouter } from "express";
import { rateLimit } from "express-rate-limit";
import { LoginBody, GetAuthResponse, ChangePasswordBody } from "@workspace/api-zod";
import { isAuthenticated, loginSession, logoutSession, requireAuth, updatePassword, verifyPassword } from "../../lib/auth";
import { pool, audit } from "../../lib/store";

export const authRouter: IRouter = Router();
const loginLimit = rateLimit({ windowMs: 15 * 60000, limit: 8, standardHeaders: "draft-8", legacyHeaders: false,
  message: { error: "محاولات دخول كثيرة؛ حاول بعد 15 دقيقة" } });
authRouter.get("/auth", async (req, res) => {
  const configured = (await pool.query("SELECT 1 FROM admin_settings WHERE id=1")).rows.length > 0;
  res.json(GetAuthResponse.parse({ authenticated: await isAuthenticated(req), configured }));
});
authRouter.post("/auth", loginLimit, async (req, res) => {
  const input = LoginBody.parse(req.body);
  if (!await verifyPassword(input.password)) {
    await audit("warning", "security", "محاولة دخول غير ناجحة");
    res.status(401).json({ error: "كلمة المرور غير صحيحة" }); return;
  }
  await loginSession(req, res);
  await audit("info", "security", "سجل المالك الدخول إلى لوحة التحكم");
  res.json({ authenticated: true, configured: true });
});
authRouter.delete("/auth", async (req, res) => {
  await logoutSession(req, res);
  res.json({ ok: true, message: "تم تسجيل الخروج" });
});
authRouter.post("/password", requireAuth, loginLimit, async (req, res) => {
  const input = ChangePasswordBody.parse(req.body);
  if (!await verifyPassword(input.currentPassword)) { res.status(400).json({ error: "كلمة المرور الحالية غير صحيحة" }); return; }
  await updatePassword(input.newPassword);
  await loginSession(req, res);
  await audit("info", "security", "تم تغيير كلمة المرور وإنهاء الجلسات السابقة");
  res.json({ ok: true, message: "تم تغيير كلمة المرور وإبطال الجلسات السابقة" });
});
