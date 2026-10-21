import { audit, safeError, pool } from "./store";

export class TelegramApiError extends Error {
  constructor(message: string, public code: number, public retryAfter = 0) { super(message); }
}
export class AmbiguousSendError extends Error {}
export const botState = { status: "unverified", detail: "لم يتم اختبار اتصال البوت", checkedAt: null as string | null, id: 0, username: "" };
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
export async function testDestination(id: number, username: string, send: boolean) {
  try {
    const me = await botApi("getMe");
    const chat = await botApi("getChat", { chat_id: username });
    if (chat.type !== "channel") throw new Error("الوجهة يجب أن تكون قناة Telegram");
    const member = await botApi("getChatMember", { chat_id: chat.id, user_id: me.id });
    if (member.status !== "creator" && !(member.status === "administrator" && member.can_post_messages)) {
      throw new Error("أضف البوت مشرفاً للقناة مع صلاحية نشر الرسائل");
    }
    if (send) await botApi("sendMessage", { chat_id: chat.id, text: "MZ Telegram Bots\nرسالة اختبار اتصال وصلاحية النشر." });
    await pool.query("UPDATE destination_channels SET status='ready',last_error=NULL WHERE id=$1", [Math.abs(id)]);
    await audit("info", "telegram", send ? `تم إرسال رسالة الاختبار إلى ${username}` : `تم التحقق من صلاحية النشر إلى ${username}`);
    return { ok: true, message: send ? "تم إرسال رسالة الاختبار فعلياً" : "تم التحقق من صلاحية نشر البوت" };
  } catch (e) {
    await pool.query("UPDATE destination_channels SET status='error',last_error=$2 WHERE id=$1", [Math.abs(id), safeError(e)]);
    await audit("error", "telegram", safeError(e));
    return { ok: false, message: safeError(e) };
  }
}
