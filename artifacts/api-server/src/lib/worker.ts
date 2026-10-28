import { pool, getSetting, setSetting, settings, audit, safeError, channel, sameTelegramUsername } from "./store";
import { connectReader, readerConnected, readerState, catchUp, downloadPhoto } from "./telegram-reader";
import { botApi, botState, testBot, TelegramApiError, AmbiguousSendError } from "./telegram-bot";
import { compose, containsLink, splitText } from "./composition";
import { translate } from "./translation";
import { refreshPrices } from "./market";
import { logger } from "./logger";
import type { PoolClient } from "@workspace/db";

let loopBusy = false;
let running = false;
let leader: PoolClient | undefined;
let interval: ReturnType<typeof setInterval> | undefined;
let lastReaderCheck = 0, lastCatchUp = 0, lastBotCheck = 0;
let blockedUntil = 0;
export const workerState = { status: "stopped", detail: "عامل المعالجة متوقف", checkedAt: null as string | null };
type Part = { method: "sendMessage" | "sendPhoto"; text: string; html?: string; hideSourceLink?: boolean };

async function processDelivery(id: number) {
  const { rows } = await pool.query(`SELECT d.*,m.source_id,m.source_key,m.telegram_message_id,m.text,m.has_photo,m.entities
    FROM message_deliveries d JOIN messages m ON m.id=d.message_id WHERE d.id=$1`, [id]);
  const delivery = rows[0];
  if (!delivery || !delivery.source_id || !delivery.destination_id) {
    await pool.query("UPDATE message_deliveries SET status='held',error=$2,updated_at=now() WHERE id=$1", [id, "المصدر أو الوجهة محذوف"]);
    return;
  }
  const source = await channel(delivery.source_id);
  const destination = await channel(-delivery.destination_id);
  if (!sameTelegramUsername(source.username, delivery.source_key) || !sameTelegramUsername(destination.username, delivery.destination_key)) {
    await pool.query("UPDATE message_deliveries SET status='held',error=$2,updated_at=now() WHERE id=$1", [id, "تغير معرف القناة بعد استقبال الرسالة؛ أُوقف الإرسال لحماية الوجهة"]);
    return;
  }
  if (source.skipMessagesWithLinks && containsLink(delivery.text, delivery.entities ?? [])) {
    const partiallySent = (delivery.telegram_message_ids ?? []).length > 0;
    const status = partiallySent ? "held" : "skipped";
    const reason = partiallySent
      ? "توقف استكمال الرسالة لأن المصدر يتجاهل الرسائل التي تحتوي على روابط؛ أُرسلت أجزاء سابقة"
      : "تم تجاوز الرسالة لأن المصدر مضبوط على تجاهل الرسائل التي تحتوي على روابط";
    await pool.query("UPDATE message_deliveries SET status=$2,error=$3,updated_at=now() WHERE id=$1", [id, status, reason]);
    await pool.query("INSERT INTO delivery_attempts(delivery_id,status,detail) VALUES($1,$2,$3)", [id, status, reason]);
    return;
  }
  const route = await pool.query("SELECT hide_source_link FROM routing_rules WHERE source_id=$1 AND destination_id=$2", [delivery.source_id, delivery.destination_id]);
  if (!source.enabled || !destination.enabled || !route.rows.length) {
    await pool.query("UPDATE message_deliveries SET status='held',error=$2,updated_at=now() WHERE id=$1", [id, "المصدر أو الوجهة معطل أو لم تعد قاعدة الربط موجودة"]);
    return;
  }
  const hideSourceLink = Boolean(route.rows[0].hide_source_link);
  const config = await settings();
  const sentIds: number[] = delivery.telegram_message_ids ?? [];
  let attemptedSend = false;
  try {
    await pool.query("UPDATE message_deliveries SET status='processing',attempts=attempts+1,updated_at=now() WHERE id=$1", [id]);
    await pool.query("INSERT INTO delivery_attempts(delivery_id,status,detail) VALUES($1,'processing',$2)", [id, `محاولة ${delivery.attempts + 1}`]);
    let plan: Part[] | null = Array.isArray(delivery.send_plan) ? delivery.send_plan : null;
    if (plan?.length && Boolean(plan[0]?.hideSourceLink) !== hideSourceLink) {
      if (sentIds.length) {
        const reason = "تغير إعداد إخفاء رابط المصدر بعد إرسال جزء من الرسالة؛ أُوقف الاستكمال لتجنب اختلاف المحتوى";
        await pool.query("UPDATE message_deliveries SET status='held',error=$2,updated_at=now() WHERE id=$1", [id, reason]);
        await pool.query("INSERT INTO delivery_attempts(delivery_id,status,detail) VALUES($1,'held',$2)", [id, reason]);
        return;
      }
      plan = null;
    }
    if (!plan) {
      const composed = await compose(
        source,
        destination,
        delivery.text,
        delivery.telegram_message_id,
        delivery.entities,
        hideSourceLink,
        (text, sourceChannel) => translate(text, sourceChannel, delivery.message_id),
      );
      plan = [];
      const photo = delivery.has_photo && source.mediaMode === "include";
      const canHtml = destination.format === "html";
      if (photo && composed.text.length <= 1024) {
        plan.push({ method: "sendPhoto", text: composed.text, html: canHtml ? composed.html : undefined });
      } else {
        if (photo) plan.push({ method: "sendPhoto", text: "" });
        if (composed.text.length <= 4000) {
          if (composed.text) plan.push({ method: "sendMessage", text: composed.text, html: canHtml ? composed.html : undefined });
        } else plan.push(...splitText(composed.text).map(text => ({ method: "sendMessage" as const, text })));
      }
      if (!composed.text.trim() && !photo) {
        const reason = "تم تجاوز المنشور بعد إزالة إحالة المصدر لعدم بقاء محتوى قابل للإرسال";
        await pool.query("UPDATE message_deliveries SET status='skipped',error=$2,updated_at=now() WHERE id=$1", [id, reason]);
        await pool.query("INSERT INTO delivery_attempts(delivery_id,status,detail) VALUES($1,'skipped',$2)", [id, reason]);
        return;
      }
      plan = plan.map((part) => ({ ...part, hideSourceLink }));
      await pool.query("UPDATE message_deliveries SET rendered_text=$2,translation_status=$3,send_plan=$4 WHERE id=$1", [id, composed.text, composed.translationStatus, JSON.stringify(plan)]);
    }
    if (!plan.length) throw new Error("لا توجد رسالة نصية أو صورة قابلة للنشر");
    for (let index = sentIds.length; index < plan.length; index++) {
      if (!await getSetting("worker_enabled", false)) throw Object.assign(new Error("تم إيقاف العامل مؤقتاً"), { held: true });
      const current = await pool.query(`SELECT s.config->>'skipMessagesWithLinks' AS "skipMessagesWithLinks",
          r.hide_source_link AS "hideSourceLink"
        FROM source_channels s JOIN routing_rules r ON r.source_id=s.id
        JOIN destination_channels d ON d.id=r.destination_id WHERE s.id=$1 AND d.id=$2 AND s.enabled AND d.enabled`, [source.id, delivery.destination_id]);
      if (!current.rows.length) throw Object.assign(new Error("تم تعطيل قناة أو حذف قاعدة الربط"), { held: true });
      if (current.rows[0].skipMessagesWithLinks === "true" && containsLink(delivery.text, delivery.entities ?? [])) {
        throw Object.assign(new Error("تم إيقاف الإرسال لأن المصدر أصبح يتجاهل الرسائل التي تحتوي على روابط"), { held: true });
      }
      if (Boolean(current.rows[0].hideSourceLink) !== Boolean(plan[0]?.hideSourceLink)) {
        throw Object.assign(new Error("تغير إعداد إخفاء رابط المصدر أثناء تجهيز الرسالة؛ أعد محاولتها"), { held: true });
      }
      const part = plan[index]!;
      let photo: Buffer | undefined;
      if (part.method === "sendPhoto") photo = await downloadPhoto(source, delivery.telegram_message_id);
      await pool.query("UPDATE message_deliveries SET status='sending',updated_at=now() WHERE id=$1", [id]);
      attemptedSend = true;
      let response: any;
      if (photo) {
        const form = new FormData();
        form.set("chat_id", destination.username);
        form.set("photo", new Blob([new Uint8Array(photo)], { type: "image/jpeg" }), "telegram-photo.jpg");
        if (part.text) {
          form.set("caption", part.html ?? part.text);
          if (part.html) form.set("parse_mode", "HTML");
        }
        response = await botApi("sendPhoto", form);
      } else {
        response = await botApi("sendMessage", { chat_id: destination.username, text: part.html ?? part.text,
          ...(part.html ? { parse_mode: "HTML" } : {}), link_preview_options: { is_disabled: true } });
      }
      sentIds.push(response.message_id);
      // Checkpoint each part before sending the next. An unconfirmed part is never auto-retried.
      await pool.query("UPDATE message_deliveries SET telegram_message_ids=$2,updated_at=now() WHERE id=$1", [id, JSON.stringify(sentIds)]);
      attemptedSend = false;
      await new Promise(resolve => setTimeout(resolve, 1100));
    }
    await pool.query("UPDATE message_deliveries SET status='sent',error=NULL,updated_at=now() WHERE id=$1", [id]);
    await pool.query("UPDATE destination_channels SET last_message_at=now(),status='ready',last_error=NULL WHERE id=$1", [delivery.destination_id]);
    await pool.query("INSERT INTO delivery_attempts(delivery_id,status) VALUES($1,'sent')", [id]);
    await audit("info", "delivery", `تم نشر رسالة من ${source.username} إلى ${destination.username}`);
  } catch (e: any) {
    const ambiguous = e instanceof AmbiguousSendError || (attemptedSend && !(e instanceof TelegramApiError));
    const permanent = e instanceof TelegramApiError && [400, 401, 403, 404].includes(e.code);
    const held = e.translationHeld || e.held;
    const status = ambiguous ? "unknown" : held ? "held" : permanent || delivery.attempts + 1 >= config.maxAttempts ? "failed" : "retrying";
    const floodDelay = e instanceof TelegramApiError ? e.retryAfter : typeof e.seconds === "number" ? e.seconds : 0;
    const delay = floodDelay > 0 ? floodDelay + 1 : Math.min(3600, 15 * 2 ** delivery.attempts);
    if (floodDelay > 0) blockedUntil = Date.now() + delay * 1000;
    const error = ambiguous ? "حالة إرسال غير مؤكدة؛ لا إعادة تلقائية لتجنب التكرار. راجع القناة وسجل معرّفات الرسائل قبل التدخل اليدوي." : safeError(e);
    await pool.query(`UPDATE message_deliveries SET status=$2,error=$3,next_attempt_at=now()+$4*interval '1 second',
      translation_status=CASE WHEN $5 THEN 'failed' ELSE translation_status END,updated_at=now() WHERE id=$1`, [id, status, error, delay, Boolean(e.translationHeld)]);
    await pool.query("INSERT INTO delivery_attempts(delivery_id,status,detail) VALUES($1,$2,$3)", [id, status, error]);
    await audit("error", "delivery", error);
  }
}
async function tick() {
  if (loopBusy || !running) return;
  loopBusy = true;
  try {
    if (!leader) {
      const connection = await pool.connect();
      const { rows } = await connection.query("SELECT pg_try_advisory_lock(128006, 1) AS acquired");
      if (!rows[0].acquired) { connection.release(); workerState.status = "standby"; return; }
      leader = connection;
      leader.on("error", () => {
        // Never silently run two leaders after a lost PostgreSQL lock.
        logger.fatal("Lost worker leadership connection; supervisor must restart the process");
        process.exit(1);
      });
      await pool.query(`UPDATE message_deliveries SET status='unknown',error='توقفت الخدمة أثناء إرسال غير مؤكد؛ يلزم تحقق يدوي لمنع التكرار',updated_at=now() WHERE status='sending'`);
      await pool.query("UPDATE message_deliveries SET status='retrying',next_attempt_at=now() WHERE status='processing'");
    }
    await leader.query("SELECT 1");
    const enabled = await getSetting("worker_enabled", false);
    const now = Date.now();
    if (now - lastBotCheck > 300000) { lastBotCheck = now; await testBot(); }
    if (now - lastReaderCheck > 60000) { lastReaderCheck = now; await connectReader(); }
    const config = await settings();
    const lastMarket = await getSetting<number>("market_last_attempt", 0);
    if (now - lastMarket > config.marketInterval * 1000) await refreshPrices();
    Object.assign(workerState, { status: enabled ? readerConnected() && botState.status === "connected" ? "running" : "error" : "paused",
      detail: !enabled ? "متوقف مؤقتاً مع حفظ الإعدادات" : !readerConnected() ? readerState.detail : botState.status !== "connected" ? botState.detail : "العامل يستقبل ويعالج الرسائل",
      checkedAt: new Date().toISOString() });
    await setSetting("worker_heartbeat", workerState);
    if (!enabled || !readerConnected() || botState.status !== "connected") return;
    if (now - lastCatchUp > 60000) { lastCatchUp = now; await catchUp(); }
    if (Date.now() < blockedUntil) return;
    const { rows } = await pool.query(`SELECT id FROM message_deliveries WHERE status IN ('pending','retrying')
      AND next_attempt_at<=now() ORDER BY id LIMIT 1`);
    if (rows[0]) await processDelivery(rows[0].id);
  } catch (e) {
    Object.assign(workerState, { status: "error", detail: safeError(e), checkedAt: new Date().toISOString() });
    logger.error({ message: safeError(e) }, "Worker tick failed");
  } finally { loopBusy = false; }
}
export function startWorker() {
  if (running) return;
  running = true;
  interval = setInterval(() => void tick(), 2000);
  void tick();
}
export async function stopWorker() {
  running = false;
  if (interval) clearInterval(interval);
  // Finish in-flight work before releasing the leadership lock.
  while (loopBusy) await new Promise(resolve => setTimeout(resolve, 200));
  if (leader) {
    await leader.query("SELECT pg_advisory_unlock(128006,1)");
    leader.release(); leader = undefined;
  }
}
export async function control(action: string) {
  if (action === "testBot") return testBot();
  if (action === "pause") {
    await setSetting("worker_enabled", false);
    Object.assign(workerState, { status: "paused", detail: "متوقف مؤقتاً؛ الإرسال الجاري قد يكتمل" });
    await audit("info", "worker", "تم إيقاف المعالجة مؤقتاً؛ الإعدادات محفوظة");
    return { ok: true, message: "تم إيقاف المعالجة مؤقتاً؛ قد يكتمل الإرسال الجاري" };
  }
  const bot = await testBot();
  await connectReader();
  if (!bot.ok || !readerConnected()) return { ok: false, message: !bot.ok ? bot.message : readerState.detail };
  if (action === "restart") {
    await stopWorker();
    startWorker();
  }
  await setSetting("worker_enabled", true);
  await audit("info", "worker", action === "restart" ? "أعيد تشغيل عامل المعالجة" : "تم تفعيل المعالجة");
  void tick();
  return { ok: true, message: "تم التحقق من الاتصال وتفعيل عامل المعالجة؛ راجع الحالة الفعلية في لوحة الخدمات" };
}
