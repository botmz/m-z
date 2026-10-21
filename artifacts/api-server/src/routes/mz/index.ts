import { Router, type IRouter, type ErrorRequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import { ZodError } from "zod";
import { authRouter } from "./auth";
import { channelRouter } from "./channels";
import { operationsRouter } from "./operations";
import { requireAuth, sameOrigin } from "../../lib/auth";
import { safeError } from "../../lib/store";

const router: IRouter = Router();
router.use(sameOrigin);
router.use(authRouter);
router.use(requireAuth);
router.use(rateLimit({ windowMs: 60000, limit: 300, standardHeaders: "draft-8", legacyHeaders: false,
  message: { error: "طلبات كثيرة؛ انتظر دقيقة" } }));
router.use(channelRouter);
router.use(operationsRouter);
const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (error instanceof ZodError || error?.name === "ZodError") {
    res.status(400).json({ error: "البيانات غير مكتملة أو غير صالحة؛ راجع الحقول المطلوبة" }); return;
  }
  if (error?.code === "23505") { res.status(409).json({ error: "القناة أو قاعدة الربط موجودة بالفعل" }); return; }
  const status = typeof error?.status === "number" && error.status >= 400 && error.status < 500 ? error.status : 500;
  req.log.error({ message: safeError(error) }, "MZ API error");
  res.status(status).json({ error: status < 500 ? safeError(error) : "تعذر إتمام العملية. راجع حالة الخدمات أو سجل الخادم" });
};
router.use(errorHandler);
export default router;
