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
const recoveryFailureDetail = "تعذر استعادة جلسة Telegram المحفوظة؛ أعد التفويض";
const connectedDetail = "جلسة MTProto مفوضة ومتصلة";

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

  try {
    const encrypted = await loadEncryptedSession();
    if (!encrypted) {
      Object.assign(state, { status: "not_authorized", detail: missingSessionDetail, checkedAt: checkedAt() });
      return undefined;
    }

    candidate = createClient(decryptSession(encrypted));
    await candidate.connect();
    if (!await candidate.isUserAuthorized()) throw new Error("unauthorized");
    attachHandlers(candidate);
    Object.assign(state, { status: "connected", detail: connectedDetail, checkedAt: checkedAt() });
    return candidate;
  } catch {
    if (candidate?.disconnect) void candidate.disconnect().catch(() => undefined);
    Object.assign(state, { status: "error", detail: recoveryFailureDetail, checkedAt: checkedAt() });
    await reportError(recoveryFailureDetail);
    return undefined;
  }
}
