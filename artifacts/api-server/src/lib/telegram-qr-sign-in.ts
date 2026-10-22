import type { OneTimeSecretGate } from "./one-time-secret-gate";

type QrState = {
  status: string;
  message: string;
  url: string | null;
  expiresAt: string | null;
};

type QrSignInClient = {
  session: { save(): unknown };
  signInUserWithQrCode(
    credentials: { apiId: number; apiHash: string },
    callbacks: {
      abortSignal: AbortSignal;
      qrCode: (data: { token: Buffer; expires: number }) => Promise<void>;
      password: () => Promise<string>;
      onError: (error: unknown) => Promise<boolean>;
    },
  ): Promise<unknown>;
};

export async function signInWithQrCode(options: {
  client: QrSignInClient;
  credentials: { apiId: number; apiHash: string };
  abortSignal: AbortSignal;
  passwordGate: OneTimeSecretGate;
  qrState: QrState;
  isCurrent: () => boolean;
  persistEncryptedSession: (session: string) => Promise<void>;
  auditAuthorization: () => Promise<void>;
}): Promise<void> {
  const { client, credentials, abortSignal, passwordGate, qrState, isCurrent, persistEncryptedSession, auditAuthorization } = options;
  let passwordAttempts = 0;
  let passwordWasInvalid = false;
  let passwordWasProvided = false;
  const cancelPendingPassword = () => passwordGate.cancel("انتهت مهلة التحقق؛ ابدأ ربطاً جديداً");
  abortSignal.addEventListener("abort", cancelPendingPassword, { once: true });

  try {
    await client.signInUserWithQrCode(credentials, {
      abortSignal,
      qrCode: async ({ token, expires }) => {
        if (abortSignal.aborted || !isCurrent()) throw new Error("انتهت مهلة تفويض QR، ابدأ من جديد");
        Object.assign(qrState, {
          status: "waiting",
          message: "من تطبيق Telegram: الإعدادات ← الأجهزة ← ربط جهاز، ثم امسح الرمز",
          url: `tg://login?token=${token.toString("base64url")}`,
          expiresAt: new Date(expires * 1000).toISOString(),
        });
      },
      password: async () => {
        Object.assign(qrState, {
          status: "needs_2fa",
          message: passwordWasInvalid
            ? "كلمة المرور غير صحيحة. أعد إدخال كلمة مرور التحقق بخطوتين."
            : "أدخل كلمة مرور التحقق بخطوتين في الحقل الآمن أدناه. لن تُحفظ أو تُسجّل.",
          url: null,
          expiresAt: null,
        });
        passwordWasInvalid = false;
        const password = await passwordGate.wait();
        passwordWasProvided = true;
        return password;
      },
      onError: async (error) => {
        const code = (error as Error & { errorMessage?: string }).errorMessage;
        if (code === "PASSWORD_HASH_INVALID") {
          passwordAttempts += 1;
          if (passwordAttempts >= 5) {
            Object.assign(qrState, {
              status: "error",
              message: "تعذر التحقق بعد عدة محاولات. ابدأ ربطاً جديداً وحاول مرة أخرى.",
              url: null,
              expiresAt: null,
            });
            return true;
          }
          passwordWasInvalid = true;
          Object.assign(qrState, {
            status: "needs_2fa",
            message: "كلمة المرور غير صحيحة. أعد إدخال كلمة مرور التحقق بخطوتين.",
          });
          return false;
        }
        return true;
      },
    });

    if (abortSignal.aborted || !isCurrent()) throw new Error("انتهت مهلة الربط");
    const session = client.session.save() as string;
    await persistEncryptedSession(session);
    await auditAuthorization();
  } catch (error) {
    if (passwordWasProvided) {
      const safe = new Error("تعذر إتمام التحقق بخطوتين مع Telegram");
      const code = (error as Error & { errorMessage?: string }).errorMessage;
      if (code) Object.assign(safe, { errorMessage: code });
      throw safe;
    }
    throw error;
  } finally {
    abortSignal.removeEventListener("abort", cancelPendingPassword);
    passwordGate.cancel();
  }
}
