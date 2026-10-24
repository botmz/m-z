import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { SubmitTelegramQrPasswordBody } from "@workspace/api-zod";

type QrState = {
  status: string;
  message: string;
  url: string | null;
  expiresAt: string | null;
};

export function createTelegramQrRouter(options: {
  getState: () => QrState;
  submitPassword: (password: string) => QrState;
}) {
  const router = Router();
  const passwordLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "محاولات التحقق كثيرة؛ ابدأ ربطاً جديداً بعد قليل" },
  });

  router.get("/telegram/qr", (_req, res) => { res.json(options.getState()); });
  router.post("/telegram/qr/2fa", passwordLimit, (req, res) => {
    const { password } = SubmitTelegramQrPasswordBody.parse(req.body);
    res.json(options.submitPassword(password));
  });

  return router;
}
