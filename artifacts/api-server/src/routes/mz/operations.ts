import { Router, type IRouter } from "express";
import {
  GetDashboardResponse, GetMessagesQueryParams, GetMessagesResponse, GetLogsQueryParams, GetLogsResponse,
  RetryMessageParams, SaveSettingsBody, GetSettingsResponse, GetMarketResponse,
  SendPreviewMessageBody, SendPreviewMessageResponse, ControlWorkerBody, PreviewMessageBody, PreviewMessageResponse, GetServicesResponse,
} from "@workspace/api-zod";
import { pool, channels, channel, messageHistory, logs, settings, setSetting, getSetting, audit, safeError } from "../../lib/store";
import { botState, testDestination } from "../../lib/telegram-bot";
import { readerState, readerStatus, beginQr, qrState, submitQrPassword } from "../../lib/telegram-reader";
import { control, getWorkerHealth } from "../../lib/worker";
import { marketQuotes, refreshPrices } from "../../lib/market";
import { compose } from "../../lib/composition";
import { normalizeRouteContentSettings } from "../../lib/route-content";
import { sendManualMessage } from "../../lib/telegram-manual-send";
import { createTelegramQrRouter } from "./telegram-qr";

export const operationsRouter: IRouter = Router();
operationsRouter.use(createTelegramQrRouter({
  getState: () => qrState,
  submitPassword: submitQrPassword,
}));
operationsRouter.get("/dashboard", async (_req, res) => {
  const config = await settings();
  const workerHealth = await getWorkerHealth();
  const [list, recentMessages, recentLogs, counts, activity, routingRules] = await Promise.all([
    channels(), messageHistory(), logs(), pool.query(`SELECT
      (SELECT count(*) FROM messages WHERE (created_at AT TIME ZONE $1)::date=(now() AT TIME ZONE $1)::date)::int AS processed,
      count(*) FILTER (WHERE status='sent' AND (updated_at AT TIME ZONE $1)::date=(now() AT TIME ZONE $1)::date)::int AS sent,
      count(*) FILTER (WHERE status IN ('failed','unknown'))::int AS failed,
      count(*) FILTER (WHERE status IN ('pending','retrying','processing','sending','held'))::int AS pending FROM message_deliveries`, [config.timezone]),
    pool.query(`SELECT to_char(h.hour AT TIME ZONE $1,'HH24:MI') AS hour,
      count(d.id) FILTER(WHERE d.status='sent')::int AS sent,
      count(d.id) FILTER(WHERE d.status IN ('failed','unknown'))::int AS failed
      FROM generate_series(date_trunc('hour',now())-interval '23 hours',date_trunc('hour',now()),interval '1 hour') h(hour)
      LEFT JOIN message_deliveries d ON d.updated_at>=h.hour AND d.updated_at<h.hour+interval '1 hour'
      GROUP BY h.hour ORDER BY h.hour`, [config.timezone]),
    pool.query("SELECT count(*)::int AS count FROM routing_rules"),
  ]);
  const row = counts.rows[0];
  res.json(GetDashboardResponse.parse({
    workerStatus: workerHealth.status, telegramStatus: readerStatus(),
    sources: list.filter(c => c.kind === "source" && c.enabled).length,
    destinations: list.filter(c => c.kind === "destination" && c.enabled).length,
    routingRules: routingRules.rows[0].count,
    processedToday: row.processed, sentToday: row.sent, failed: row.failed, pending: row.pending,
    recentMessages: recentMessages.slice(0, 6), recentLogs: recentLogs.slice(0, 5), activity: activity.rows,
  }));
});
operationsRouter.get("/messages", async (req, res) => {
  const q = GetMessagesQueryParams.parse(req.query);
  res.json(GetMessagesResponse.parse(await messageHistory(q.search, q.status, q.channelId)));
});
operationsRouter.post("/messages/:id/retry", async (req, res) => {
  const { id } = RetryMessageParams.parse(req.params);
  const { rows } = await pool.query(`UPDATE message_deliveries SET status='pending',attempts=0,error=NULL,next_attempt_at=now(),updated_at=now()
    WHERE id=$1 AND status IN ('failed','held') RETURNING id`, [id]);
  if (!rows.length) { res.status(400).json({ error: "يمكن إعادة محاولة الرسائل الفاشلة أو المعلقة فقط؛ الإرسال غير المؤكد لا يُعاد لتجنب التكرار" }); return; }
  await audit("info", "delivery", `طُلبت إعادة محاولة الرسالة ${id}`);
  res.json({ ok: true, message: "أضيفت الرسالة إلى طابور المعالجة؛ ستُرسل عند تشغيل العامل وتحقق الربط" });
});
operationsRouter.get("/logs", async (req, res) => {
  const q = GetLogsQueryParams.parse(req.query);
  await getWorkerHealth();
  res.json(GetLogsResponse.parse(await logs(q.search, q.level === "warn" ? "warning" : q.level)));
});
operationsRouter.get("/settings", async (_req, res) => { res.json(GetSettingsResponse.parse(await settings())); });
operationsRouter.put("/settings", async (req, res) => {
  const input = SaveSettingsBody.parse(req.body);
  try { new Intl.DateTimeFormat("ar", { timeZone: input.timezone }); }
  catch { res.status(400).json({ error: "المنطقة الزمنية غير صالحة" }); return; }
  const storedSettings = await getSetting<Record<string, unknown>>("settings", {});
  await setSetting("settings", { ...storedSettings, ...input });
  await audit("info", "settings", "تم تحديث الإعدادات العامة");
  res.json(GetSettingsResponse.parse(input));
});
operationsRouter.get("/market", async (_req, res) => { res.json(GetMarketResponse.parse(await marketQuotes())); });
operationsRouter.post("/market", async (_req, res) => { res.json(await refreshPrices()); });
operationsRouter.post("/control", async (req, res) => {
  const { action } = ControlWorkerBody.parse(req.body);
  res.json(await control(action));
});
operationsRouter.post("/preview", async (req, res) => {
  const input = PreviewMessageBody.parse(req.body);
  const source = await channel(input.sourceId);
  const destination = await channel(input.destinationId);
  if (source.kind !== "source" || destination.kind !== "destination") {
    res.status(400).json({ error: "اختر مصدراً ووجهة صالحين" }); return;
  }
  const routes = await pool.query(`SELECT hide_source_link,content_settings FROM routing_rules
    WHERE source_id=$1 AND destination_id=$2`, [source.id, -destination.id]);
  const routeContent = normalizeRouteContentSettings(routes.rows[0]?.content_settings, !source.skipMessagesWithLinks);
  const preview = await compose(source, destination, input.text, undefined, [], Boolean(routes.rows[0]?.hide_source_link), routeContent);
  if (!preview.text.trim()) preview.warnings.push("لا تحتوي معاينة النص على محتوى؛ قد يُرسل وسيط فقط إذا كان مسموحاً في هذا المسار.");
  if (!routes.rows.length) preview.warnings.push("لا يوجد توجيه تلقائي محفوظ بين المصدر والوجهة؛ الإرسال اليدوي من هذه الصفحة يرسل هذه الرسالة فقط.");
  res.json(PreviewMessageResponse.parse(preview));
});
operationsRouter.post("/preview/send", async (req, res): Promise<void> => {
  const input = SendPreviewMessageBody.parse(req.body);
  const source = await channel(input.sourceId);
  const destination = await channel(input.destinationId);
  if (source.kind !== "source" || destination.kind !== "destination") {
    res.status(400).json({ error: "اختر مصدراً ووجهة صالحين" });
    return;
  }
  if (!source.enabled || !destination.enabled) {
    res.status(400).json({ error: "فعّل المصدر والوجهة قبل الإرسال اليدوي" });
    return;
  }

  const permissions = await testDestination(destination.id, destination.username, false);
  if (!permissions.ok) {
    res.json(SendPreviewMessageResponse.parse({ ok: false, message: permissions.message }));
    return;
  }

  const route = await pool.query("SELECT hide_source_link,content_settings FROM routing_rules WHERE source_id=$1 AND destination_id=$2", [source.id, -destination.id]);
  const routeContent = normalizeRouteContentSettings(route.rows[0]?.content_settings, !source.skipMessagesWithLinks);
  const composed = await compose(source, destination, input.text, undefined, [], Boolean(route.rows[0]?.hide_source_link), routeContent);
  if (!composed.text.trim()) {
    res.status(400).json({ error: "لا يوجد محتوى مفعّل لهذا المسار؛ فعّل النص أو الأسعار أو التوقيع قبل الإرسال." });
    return;
  }
  try {
    const sentCount = await sendManualMessage(destination.username, composed.text, composed.html, destination.format);
    const message = sentCount === 1
      ? `تم إرسال الرسالة مرة واحدة إلى ${destination.name}`
      : `تم إرسال الرسالة إلى ${destination.name} على ${sentCount} أجزاء`;
    await audit("info", "delivery", message);
    res.json(SendPreviewMessageResponse.parse({ ok: true, message }));
  } catch (error) {
    const message = safeError(error);
    await audit("error", "delivery", message);
    res.json(SendPreviewMessageResponse.parse({ ok: false, message }));
  }
});
operationsRouter.get("/services", async (_req, res) => {
  await pool.query("SELECT 1");
  const workerHealth = await getWorkerHealth();
  const market = await marketQuotes();
  const marketError = await getSetting("market_error", "");
  res.json(GetServicesResponse.parse([
    { id: "database", name: "قاعدة البيانات", status: "connected", detail: "PostgreSQL متصلة — فحص فعلي", checkedAt: new Date().toISOString() },
    { ...botState, id: "bot", name: "Telegram Bot API" },
    { id: "reader", name: "قارئ Telegram MTProto", ...readerState, status: readerStatus() },
    { id: "worker", name: "عامل المعالجة", ...workerHealth },
    { id: "market", name: "مزود أسعار السوق", status: marketError ? "error" : market.length === 2 && market.every(p => !p.stale) ? "connected" : "unverified",
      detail: marketError || "Coinbase للبيتكوين • Gold API للذهب • المقارنة بآخر قراءة ناجحة", checkedAt: market[0]?.updatedAt ?? null },
  ]));
});
operationsRouter.post("/telegram/qr", async (_req, res) => { res.json(await beginQr()); });
