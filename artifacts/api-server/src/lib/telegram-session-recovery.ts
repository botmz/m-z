import { TelegramSessionDecryptionError } from "./auth";

type ReaderClient = {
  connect(): Promise<unknown>;
  isUserAuthorized(): Promise<boolean>;
  disconnect?(): Promise<unknown>;
};

type ReaderState = {
  status: string;
  detail: string;
  checkedAt: string | null;
};

const missingSessionDetail = "يلزم تفويض جلسة MTProto لقراءة المصادر العامة";
const reauthorizationRequiredDetail = "جلسة Telegram المحفوظة غير قابلة للاستخدام؛ أعد تفويض الحساب عبر رمز QR";
const sessionLoadFailureDetail = "تعذر تحميل جلسة Telegram حالياً؛ تحقق من اتصال قاعدة البيانات ثم أعد المحاولة";
const connectionFailureDetail = "تعذر الاتصال بخوادم Telegram مؤقتاً؛ تحقق من الشبكة ثم أعد المحاولة";
const setupFailureDetail = "تعذر تجهيز جلسة Telegram؛ تحقق من إعداد الخدمة ثم أعد المحاولة";
const connectedDetail = "جلسة MTProto مفوضة ومتصلة";

async function reportSafely(reportError: (message: string) => Promise<unknown>, message: string) {
  try { await reportError(message); } catch { /* Recovery status must remain usable if audit storage is unavailable. */ }
}

export async function recoverTelegramReaderSession<T extends ReaderClient>({
  loadEncryptedSession,
  decryptSession,
  createClient,
  attachHandlers,
  state,
  reportError,
}: {
  loadEncryptedSession: () => Promise<string>;
  decryptSession: (encrypted: string) => string;
  createClient: (session: string) => T;
  attachHandlers: (client: T) => void;
  state: ReaderState;
  reportError: (message: string) => Promise<unknown>;
}): Promise<T | undefined> {
  const checkedAt = () => new Date().toISOString();
  let candidate: T | undefined;

  let encrypted: string;
  try {
    encrypted = await loadEncryptedSession();
  } catch {
    Object.assign(state, { status: "disconnected", detail: sessionLoadFailureDetail, checkedAt: checkedAt() });
    await reportSafely(reportError, sessionLoadFailureDetail);
    return undefined;
  }

  if (!encrypted) {
    Object.assign(state, { status: "not_authorized", detail: missingSessionDetail, checkedAt: checkedAt() });
    return undefined;
  }

  let session: string;
  try {
    session = decryptSession(encrypted);
  } catch (error) {
    const detail = error instanceof TelegramSessionDecryptionError
      ? reauthorizationRequiredDetail
      : setupFailureDetail;
    Object.assign(state, { status: error instanceof TelegramSessionDecryptionError ? "reauthorization_required" : "error", detail, checkedAt: checkedAt() });
    await reportSafely(reportError, detail);
    return undefined;
  }

  try {
    candidate = createClient(session);
  } catch {
    Object.assign(state, { status: "error", detail: setupFailureDetail, checkedAt: checkedAt() });
    await reportSafely(reportError, setupFailureDetail);
    return undefined;
  }

  try {
    await candidate.connect();
  } catch {
    if (candidate.disconnect) void candidate.disconnect().catch(() => undefined);
    Object.assign(state, { status: "disconnected", detail: connectionFailureDetail, checkedAt: checkedAt() });
    await reportSafely(reportError, connectionFailureDetail);
    return undefined;
  }

  let authorized: boolean;
  try {
    authorized = await candidate.isUserAuthorized();
  } catch {
    if (candidate.disconnect) void candidate.disconnect().catch(() => undefined);
    Object.assign(state, { status: "disconnected", detail: connectionFailureDetail, checkedAt: checkedAt() });
    await reportSafely(reportError, connectionFailureDetail);
    return undefined;
  }
  if (!authorized) {
    if (candidate.disconnect) void candidate.disconnect().catch(() => undefined);
    Object.assign(state, { status: "reauthorization_required", detail: reauthorizationRequiredDetail, checkedAt: checkedAt() });
    await reportSafely(reportError, reauthorizationRequiredDetail);
    return undefined;
  }

  try {
    attachHandlers(candidate);
  } catch {
    if (candidate.disconnect) void candidate.disconnect().catch(() => undefined);
    Object.assign(state, { status: "error", detail: setupFailureDetail, checkedAt: checkedAt() });
    await reportSafely(reportError, setupFailureDetail);
    return undefined;
  }

  Object.assign(state, { status: "connected", detail: connectedDetail, checkedAt: checkedAt() });
  return candidate;
}
