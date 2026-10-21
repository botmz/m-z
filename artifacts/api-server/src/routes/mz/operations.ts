import { Router, type IRouter } from "express";
import {
  GetDashboardResponse, GetMessagesQueryParams, GetMessagesResponse, GetLogsQueryParams, GetLogsResponse,
  RetryMessageParams, SaveSettingsBody, GetSettingsResponse, GetMarketResponse,
  ControlWorkerBody, PreviewMessageBody, PreviewMessageResponse, GetServicesResponse,
} from "@workspace/api-zod";
import { pool, channels, channel, messageHistory, logs, settings, setSetting, getSetting, audit } from "../../lib/store";
import { botState } from "../../lib/telegram-bot";
import { readerState, readerStatus, beginQr, qrState } from "../../lib/telegram-reader";
import { workerState, control } from "../../lib/worker";
import { marketQuotes, refreshPrices } from "../../lib/market";
import { compose } from "../../lib/composition";

export const operationsRouter: IRouter = Router();
operationsRouter.get("/dashboard", async (_req, res) => {
  const config = await settings();
  const [list, recentMessages, recentLogs, counts, activity] = await Promise.all([
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
  ]);
  const row = counts.rows[0];
  res.json(GetDashboardResponse.parse({
    workerStatus: workerState.status, telegramStatus: readerStatus(),
    sources: list.filter(c => c.kind === "source" && c.enabled).length,
    destinations: list.filter(c => c.kind === "destination" && c.enabled).length,
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
  res.json(GetLogsResponse.parse(await logs(q.search, q.level === "warn" ? "warning" : q.level)));
});
operationsRouter.get("/settings", async (_req, res) => { res.json(GetSettingsResponse.parse(await settings())); });
operationsRouter.put("/settings", async (req, res) => {
  const input = SaveSettingsBody.parse(req.body);
  try { new Intl.DateTimeFormat("ar", { timeZone: input.timezone }); }
  catch { res.status(400).json({ error: "المنطقة الزمنية غير صالحة" }); return; }
  if (input.translationProvider === "deepl" && !process.env.DEEPL_API_KEY) {
    res.status(400).json({ error: "أضف DEEPL_API_KEY إلى الأسرار قبل تفعيل DeepL" }); return;
  }
  if (input.translationProvider === "replit" && !process.env.AI_INTEGRATIONS_OPENAI_BASE_URL) {
    res.status(400).json({ error: "خدمة Replit AI غير مُعدّة" }); return;
  }
  if (input.translationProvider === "replit" && !input.translationModel.trim()) {
    res.status(400).json({ error: "حدد نموذجاً صالحاً للترجمة" }); return;
  }
  await setSetting("settings", input);
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
  const preview = await compose(source, destination, input.text);
  const routes = await pool.query("SELECT 1 FROM routing_rules WHERE source_id=$1 AND destination_id=$2", [source.id, -destination.id]);
  if (!routes.rows.length) preview.warnings.push("لا توجد قاعدة ربط بين المصدر والوجهة");
  res.json(PreviewMessageResponse.parse(preview));
});
operationsRouter.get("/services", async (_req, res) => {
  await pool.query("SELECT 1");
  const config = await settings();
  const market = await marketQuotes();
  const marketError = await getSetting("market_error", "");
  res.json(GetServicesResponse.parse([
    { id: "database", name: "قاعدة البيانات", status: "connected", detail: "PostgreSQL متصلة — فحص فعلي", checkedAt: new Date().toISOString() },
    { ...botState, id: "bot", name: "Telegram Bot API" },
    { id: "reader", name: "قارئ Telegram MTProto", ...readerState, status: readerStatus() },
    { id: "worker", name: "عامل المعالجة", ...workerState },
    { id: "market", name: "مزود أسعار السوق", status: marketError ? "error" : market.length === 2 && market.every(p => !p.stale) ? "connected" : "unverified",
      detail: marketError || "Coinbase للبيتكوين • Gold API للذهب • المقارنة بآخر قراءة ناجحة", checkedAt: market[0]?.updatedAt ?? null },
    { id: "translation", name: "خدمة الترجمة", status: config.translationProvider === "disabled" ? "disabled" : "configured",
      detail: config.translationProvider === "replit" ? "Replit AI / OpenAI — الاستخدام مدفوع من الأرصدة؛ صلاحية الخدمة تُختبر عند المعاينة" : config.translationProvider === "deepl" ? "DeepL — صلاحية الخدمة تُختبر عند المعاينة" : "الترجمة معطلة؛ اختر مزوداً ثم فعّلها لكل مصدر", checkedAt: null },
  ]));
});
operationsRouter.post("/telegram/qr", async (_req, res) => { res.json(await beginQr()); });
operationsRouter.get("/telegram/qr", async (_req, res) => { res.json(qrState); });
