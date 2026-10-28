import { audit, safeError, pool } from "./store";

export class TelegramApiError extends Error {
  constructor(message: string, public code: number, public retryAfter = 0) { super(message); }
}
export class AmbiguousSendError extends Error {}
export const botState = { status: "unverified", detail: "لم يتم اختبار اتصال البوت", checkedAt: null as string | null, id: 0, username: "" };
export function destinationTestErrorMessage(error: unknown) {
  if (error instanceof TelegramApiError) {
    if (/member list is inaccessible/i.test(error.message)) {
      return "تعذّر على Telegram التحقق من عضوية البوت. أضفه إلى القناة كمشرف مع صلاحية نشر الرسائل، ثم أعد الفحص.";
    }
    if (/chat not found/i.test(error.message)) {
      return "لم يعثر Telegram على الوجهة. تحقق من اسم المستخدم، وأن القناة عامة وأن البوت مضاف إليها.";
    }
    if (/not enough rights|have no rights|bot is not a member/i.test(error.message)) {
      return "البوت لا يملك صلاحية النشر في هذه القناة. أضفه كمشرف وفعّل صلاحية نشر الرسائل.";
    }
  }
  return safeError(error);
}
export async function botApi(method: string, body: Record<string, unknown> | FormData = {}) {
  const token = process.env.BOT_TOKEN;
  if (!token) throw new Error("BOT_TOKEN غير مُعدّ");
  let response: globalThis.Response;
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST", headers: body instanceof FormData ? undefined : { "Content-Type": "application/json" },
      body: body instanceof FormData ? body : JSON.stringify(body), signal: AbortSignal.timeout(30000),
    });
  } catch {
    if (method.startsWith("send")) throw new AmbiguousSendError("انقطع الاتصال أثناء الإرسال. قد تكون الرسالة وصلت؛ يلزم التحقق يدوياً قبل أي إعادة إرسال");
    throw new Error("تعذر الاتصال بخوادم Telegram");
  }
  const result = await response.json() as { ok: boolean; result: any; description?: string; error_code?: number; parameters?: { retry_after?: number } };
  if (!result.ok) throw new TelegramApiError(result.description ?? "Telegram API error", result.error_code ?? response.status, result.parameters?.retry_after ?? 0);
  return result.result;
}
export async function testBot() {
  try {
    const me = await botApi("getMe");
    Object.assign(botState, { status: "connected", detail: `@${me.username}`, checkedAt: new Date().toISOString(), id: me.id, username: me.username });
    await audit("info", "telegram", "نجح اختبار اتصال Bot API");
    return { ok: true, message: `تم الاتصال بالبوت @${me.username}` };
  } catch (e) {
    Object.assign(botState, { status: "error", detail: safeError(e), checkedAt: new Date().toISOString() });
    await audit("error", "telegram", safeError(e));
    return { ok: false, message: safeError(e) };
  }
}
type DestinationTestDependencies = {
  api?: (method: string, body?: Record<string, unknown>) => Promise<any>;
  updateDestination?: (id: number, status: "ready" | "error", lastError: string | null) => Promise<void>;
  audit?: typeof audit;
};

export async function testDestination(
  id: number,
  username: string,
  _send: boolean,
  dependencies: DestinationTestDependencies = {},
) {
  const api = dependencies.api ?? botApi;
  const updateDestination = dependencies.updateDestination ?? (async (destinationId, status, lastError) => {
    if (status === "ready") {
      await pool.query("UPDATE destination_channels SET status='ready',last_error=NULL WHERE id=$1", [destinationId]);
    } else {
      await pool.query("UPDATE destination_channels SET status='error',last_error=$2 WHERE id=$1", [destinationId, lastError]);
    }
  });
  const writeAudit = dependencies.audit ?? audit;
  try {
    const me = await api("getMe");
    const chat = await api("getChat", { chat_id: username });
    if (chat.type !== "channel") throw new Error("الوجهة يجب أن تكون قناة Telegram");
    const member = await api("getChatMember", { chat_id: chat.id, user_id: me.id });
    if (member.status !== "creator" && !(member.status === "administrator" && member.can_post_messages)) {
      throw new Error("أضف البوت مشرفاً للقناة مع صلاحية نشر الرسائل");
    }
    await updateDestination(Math.abs(id), "ready", null);
    await writeAudit("info", "telegram", `تم التحقق من صلاحية نشر البوت إلى ${username} دون إرسال رسالة`);
    return { ok: true, message: "تم التحقق من صلاحية نشر البوت دون إرسال أي رسالة" };
  } catch (e) {
    const message = destinationTestErrorMessage(e);
    await updateDestination(Math.abs(id), "error", message);
    await writeAudit("error", "telegram", message);
    return { ok: false, message };
  }
}
