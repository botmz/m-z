import type { OneTimeSecretGate } from "./one-time-secret-gate";

type QrState = {
  status: string;
  message: string;
  url: string | null;
  expiresAt: string | null;
};

export function submitTelegramQrPassword(
  password: string,
  options: { busy: boolean; state: QrState; gate: OneTimeSecretGate | undefined },
) {
  const { busy, state, gate } = options;
  if (!busy || state.status !== "needs_2fa" || !gate?.isWaiting || !gate.submit(password)) {
    const error = new Error("لا توجد خطوة تحقق بخطوتين تنتظر كلمة مرور؛ ابدأ ربط QR جديداً");
    Object.assign(error, { status: 409 });
    throw error;
  }
  Object.assign(state, { status: "confirming", message: "جارٍ التحقق من كلمة المرور مع Telegram", url: null, expiresAt: null });
  return { ...state };
}
