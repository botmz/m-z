import { Api, TelegramClient } from "teleproto";
import { StringSession } from "teleproto/sessions/index.js";
import { NewMessage, type NewMessageEvent } from "teleproto/events/index.js";
import { Logger, LogLevel } from "teleproto/extensions/Logger.js";
import { encrypt, decrypt } from "./auth";
import { pool, getSetting, setSetting, audit, safeError, channelRow, type Channel } from "./store";
import { acceptsMessage } from "./composition";
import { validateTelegramApiCredentials } from "./telegram-api-credentials";
import { OneTimeSecretGate } from "./one-time-secret-gate";

let client: TelegramClient | undefined;
let starting: Promise<void> | undefined;
let qrBusy = false;
let qrGeneration = 0;
let qrAbort: AbortController | undefined;
let qrTask: Promise<void> | undefined;
let activePasswordGate: OneTimeSecretGate | undefined;
let floodUntil = 0;
const messageFilter = new NewMessage({});
export const readerState = { status: "not_authorized", detail: "يلزم تفويض جلسة MTProto لقراءة المصادر العامة", checkedAt: null as string | null };
export const qrState = { status: "idle", message: "ابدأ تفويض Telegram باستخدام رمز QR", url: null as string | null, expiresAt: null as string | null };
function newClient(session = "") {
  const { apiId, apiHash } = validateTelegramApiCredentials(process.env.API_ID, process.env.API_HASH);
  return new TelegramClient(new StringSession(session), apiId, apiHash, {
    connectionRetries: 5, retryDelay: 2000, autoReconnect: true, baseLogger: new Logger(LogLevel.NONE),
    floodSleepThreshold: 0,
  });
}
export function readerConnected() { return readerState.status === "connected" && Boolean(client?.connected); }
export function readerStatus() { return readerState.status === "connected" && !client?.connected ? "disconnected" : readerState.status; }
export async function connectReader() {
  if (qrBusy) return;
  if (starting) return starting;
  starting = (async () => {
    const stored = await getSetting<string>("telegram_session", "");
    if (!stored) return;
    try {
      if (!client) client = newClient(decrypt(stored));
      if (!client.connected) await client.connect();
      if (!await client.isUserAuthorized()) throw new Error("جلسة Telegram غير صالحة؛ أعد التفويض");
      client.removeEventHandler(onMessage, messageFilter);
      client.addEventHandler(onMessage, messageFilter);
      Object.assign(readerState, { status: "connected", detail: "جلسة MTProto مفوضة ومتصلة", checkedAt: new Date().toISOString() });
    } catch (e) {
      Object.assign(readerState, { status: "error", detail: safeError(e), checkedAt: new Date().toISOString() });
      await audit("error", "reader", safeError(e));
    }
  })().finally(() => { starting = undefined; });
  return starting;
}
export async function beginQr() {
  if (readerConnected()) return { status: "connected", message: "جلسة Telegram مفوضة بالفعل", url: null, expiresAt: null };
  if (qrBusy && qrState.status === "connecting") return { ...qrState };
  if (qrBusy) {
    qrAbort?.abort();
    activePasswordGate?.cancel();
    await qrTask;
  }
  qrBusy = true;
  const generation = ++qrGeneration;
  const abort = new AbortController();
  qrAbort = abort;
  const passwordGate = new OneTimeSecretGate();
  activePasswordGate = passwordGate;
  let passwordAttempts = 0;
  const cancelPendingPassword = () => passwordGate.cancel("انتهت مهلة التحقق؛ ابدأ ربطاً جديداً");
  abort.signal.addEventListener("abort", cancelPendingPassword, { once: true });
  const timeout = setTimeout(() => abort.abort(), 300000);
  Object.assign(qrState, { status: "connecting", message: "جارٍ إنشاء رمز تفويض آمن", url: null, expiresAt: null });
  qrTask = (async () => {
    let qrClient: TelegramClient | undefined;
    let authorized = false;
    let connectionTimeout: ReturnType<typeof setTimeout> | undefined;
    try {
      qrClient = newClient();
      const connectionDeadline = new Promise<never>((_resolve, reject) => {
        connectionTimeout = setTimeout(() => {
          abort.abort();
          reject(new Error("تعذر الاتصال بخوادم Telegram خلال 30 ثانية. تحقق من الشبكة ثم أعد المحاولة"));
        }, 30000);
      });
      await Promise.race([qrClient.connect(), connectionDeadline]);
      clearTimeout(connectionTimeout);
      if (abort.signal.aborted) throw new Error("انتهت مهلة الربط؛ اضغط رمز جديد");
      const credentials = validateTelegramApiCredentials(process.env.API_ID, process.env.API_HASH);
      await qrClient.signInUserWithQrCode(credentials, {
        abortSignal: abort.signal,
        qrCode: async ({ token, expires }) => {
          if (abort.signal.aborted || generation !== qrGeneration) throw new Error("انتهت مهلة تفويض QR، ابدأ من جديد");
          Object.assign(qrState, { status: "waiting", message: "من تطبيق Telegram: الإعدادات ← الأجهزة ← ربط جهاز، ثم امسح الرمز", url: `tg://login?token=${token.toString("base64url")}`, expiresAt: new Date(expires * 1000).toISOString() });
        },
        password: async () => {
          Object.assign(qrState, {
            status: "needs_2fa",
            message: "أدخل كلمة مرور التحقق بخطوتين في الحقل الآمن أدناه. لن تُحفظ أو تُسجّل.",
            url: null,
            expiresAt: null,
          });
          return passwordGate.wait();
        },
        onError: async (error) => {
          const code = (error as Error & { errorMessage?: string }).errorMessage;
          if (code === "PASSWORD_HASH_INVALID") {
            passwordAttempts += 1;
            if (passwordAttempts >= 5) {
              Object.assign(qrState, { status: "error", message: "تعذر التحقق بعد عدة محاولات. ابدأ ربطاً جديداً وحاول مرة أخرى.", url: null, expiresAt: null });
              return true;
            }
            Object.assign(qrState, { status: "needs_2fa", message: "كلمة المرور غير صحيحة. أعد إدخال كلمة مرور التحقق بخطوتين." });
            return false;
          }
          return true;
        },
      });
      if (abort.signal.aborted || generation !== qrGeneration) throw new Error("انتهت مهلة الربط");
      const session = qrClient.session.save() as unknown as string;
      await setSetting("telegram_session", encrypt(session));
      if (client) void client.disconnect().catch(() => undefined);
      client = qrClient;
      authorized = true;
      await audit("info", "reader", "تم تفويض جلسة Telegram وحفظها مشفرة في الخادم");
      Object.assign(qrState, { status: "connected", message: "تم تفويض Telegram بنجاح", url: null, expiresAt: null });
      Object.assign(readerState, { status: "connected", detail: "جلسة MTProto مفوضة ومتصلة", checkedAt: new Date().toISOString() });
      client.addEventHandler(onMessage, messageFilter);
    } catch (e) {
      if (generation !== qrGeneration) return;
      const code = (e as Error & { errorMessage?: string }).errorMessage;
      const message = qrState.status === "error" ? qrState.message
        : abort.signal.aborted ? "انتهت مهلة الربط أو خطوة التحقق؛ ابدأ ربطاً جديداً."
        : code === "AUTH_USER_CANCEL" ? "أوقف Telegram خطوة التحقق. ابدأ رمزاً جديداً وحاول مرة أخرى."
        : safeError(e);
      Object.assign(qrState, { status: abort.signal.aborted ? "expired" : "error", message, url: null, expiresAt: null });
      await audit("warning", "reader", message);
    } finally {
      clearTimeout(timeout);
      clearTimeout(connectionTimeout);
      abort.signal.removeEventListener("abort", cancelPendingPassword);
      passwordGate.cancel();
      if (activePasswordGate === passwordGate) activePasswordGate = undefined;
      if (!authorized && qrClient) void qrClient.disconnect().catch(() => undefined);
      if (generation === qrGeneration) qrBusy = false;
    }
  })();
  // Return an immutable snapshot: background callbacks must not race JSON serialization.
  return { ...qrState };
}
export function submitQrPassword(password: string) {
  const gate = activePasswordGate;
  if (!qrBusy || qrState.status !== "needs_2fa" || !gate?.isWaiting || !gate.submit(password)) {
    const error = new Error("لا توجد خطوة تحقق بخطوتين تنتظر كلمة مرور؛ ابدأ ربط QR جديداً");
    Object.assign(error, { status: 409 });
    throw error;
  }
  Object.assign(qrState, { status: "confirming", message: "جارٍ التحقق من كلمة المرور مع Telegram", url: null, expiresAt: null });
  return { ...qrState };
}
export async function testSource(source: Channel) {
  if (!readerConnected() || !client) return { ok: false, message: "يلزم تفويض جلسة MTProto من صفحة حالة الخدمات أولاً؛ Bot API لا يقرأ جميع القنوات العامة" };
  try {
    const entity = await client.getEntity(source.username);
    if (!(entity instanceof Api.Channel) || !entity.broadcast) throw new Error("المصدر يجب أن يكون قناة عامة، لا حساباً أو مجموعة");
    if (entity.noforwards) throw new Error("القناة محمية من إعادة النشر؛ لن نتجاوز حماية المحتوى");
    await client.getMessages(entity, { limit: 1 });
    await pool.query("UPDATE source_channels SET status='ready',last_error=NULL WHERE id=$1", [source.id]);
    return { ok: true, message: "تم التحقق فعلياً من إمكانية قراءة القناة" };
  } catch (e) {
    await pool.query("UPDATE source_channels SET status='error',last_error=$2 WHERE id=$1", [source.id, safeError(e)]);
    return { ok: false, message: safeError(e) };
  }
}
async function onMessage(event: NewMessageEvent) {
  try {
    if (!await getSetting("worker_enabled", false)) return;
    const chat = await event.message.getChat();
    if (!(chat instanceof Api.Channel) || !chat.username || chat.noforwards) return;
    const { rows } = await pool.query("SELECT * FROM source_channels WHERE lower(username)=lower($1) AND enabled=true", [`@${chat.username}`]);
    if (rows[0]) await ingest(channelRow(rows[0], "source"), event.message);
  } catch (e) { await audit("error", "reader", safeError(e)); }
}
export async function ingest(source: Channel, message: Api.Message) {
  if (message.noforwards) {
    await audit("warning", "reader", `تم تجاهل رسالة من ${source.username}: المحتوى محمي من إعادة النشر`);
    return;
  }
  const text = message.message ?? "";
  const hasPhoto = message.media instanceof Api.MessageMediaPhoto;
  if (!acceptsMessage(source, text, hasPhoto)) return;
  const connection = await pool.connect();
  try {
    await connection.query("BEGIN");
    const current = await connection.query("SELECT enabled FROM source_channels WHERE id=$1", [source.id]);
    if (!current.rows[0]?.enabled) { await connection.query("ROLLBACK"); return; }
    const entities = (message.entities ?? []).map((e: any) => ({ className: e.className, offset: e.offset, length: e.length, url: e.url }));
    const { rows } = await connection.query(`INSERT INTO messages(source_id,source_key,telegram_message_id,text,has_photo,entities)
      VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(source_key,telegram_message_id) DO NOTHING RETURNING id`,
    [source.id, source.username, message.id, text, hasPhoto, JSON.stringify(entities)]);
    if (rows[0]) {
      await connection.query(`INSERT INTO message_deliveries(message_id,destination_id,destination_key)
        SELECT $1,d.id,d.username FROM routing_rules r JOIN destination_channels d ON d.id=r.destination_id
        WHERE r.source_id=$2 AND d.enabled=true ON CONFLICT(message_id,destination_key) DO NOTHING`, [rows[0].id, source.id]);
    }
    // Only the ordered catch-up scan advances the durable cursor. Push updates can arrive out of order.
    await connection.query(`UPDATE source_channels SET
      last_message_at=now(),status='ready',last_error=NULL WHERE id=$1`, [source.id]);
    await connection.query("COMMIT");
  } catch (e) { await connection.query("ROLLBACK"); throw e; } finally { connection.release(); }
}
let catchingUp = false;
export async function catchUp() {
  if (catchingUp || Date.now() < floodUntil || !readerConnected() || !client || !await getSetting("worker_enabled", false)) return;
  catchingUp = true;
  try {
    const { rows } = await pool.query("SELECT * FROM source_channels WHERE enabled=true ORDER BY id");
    for (const row of rows) {
      try {
        const source = channelRow(row, "source");
        const entity = await client.getEntity(source.username);
        if (!(entity instanceof Api.Channel)) throw new Error("المصدر ليس قناة متاحة");
        if (entity.noforwards) throw new Error("القناة محمية من إعادة النشر");
        if (row.last_message_id === null) {
          const latest = await client.getMessages(entity, { limit: 1 });
          await pool.query("UPDATE source_channels SET last_message_id=$2,status='ready',last_error=NULL WHERE id=$1", [row.id, latest[0]?.id ?? 0]);
          // Receive push updates after joining; catch-up also handles public channels not joined.
          try { await client.invoke(new Api.channels.JoinChannel({ channel: entity })); } catch { /* getHistory above already proved read access */ }
          await audit("info", "reader", `بدأ استقبال الرسائل الجديدة من ${source.username} دون إعادة نشر أرشيف القناة`);
        } else {
          // Ascending IDs: never advance past unseen messages when catching up a long backlog.
          for await (const message of client.iterMessages(entity, { minId: row.last_message_id, reverse: true, limit: 200 })) {
            if (message instanceof Api.Message) await ingest(source, message);
            await pool.query("UPDATE source_channels SET last_message_id=GREATEST(COALESCE(last_message_id,0),$2) WHERE id=$1", [row.id, message.id]);
          }
        }
      } catch (e: any) {
        const error = safeError(e);
        await pool.query("UPDATE source_channels SET status='error',last_error=$2 WHERE id=$1", [row.id, error]);
        await audit("error", "reader", error);
        if (e.seconds) { floodUntil = Date.now() + (e.seconds + 1) * 1000; break; }
      }
    }
  } finally { catchingUp = false; }
}
export async function downloadPhoto(source: Channel, messageId: number) {
  if (!readerConnected() || !client) throw new Error("جلسة قراءة Telegram غير متصلة");
  const messages = await client.getMessages(source.username, { ids: [messageId] });
  if (!messages[0] || messages[0].noforwards) throw new Error("الصورة غير متاحة أو محمية من إعادة النشر");
  const buffer = await client.downloadMedia(messages[0], {});
  if (!Buffer.isBuffer(buffer)) throw new Error("تعذر تنزيل الصورة");
  if (buffer.length > 10 * 1024 * 1024) throw new Error("الصورة تتجاوز حد 10 ميغابايت للإرسال عبر Bot API");
  return buffer;
}
