import { Router, type IRouter } from "express";
import {
  CreateChannelBody, UpdateChannelBody, UpdateChannelParams, DeleteChannelParams,
  TestChannelBody, TestChannelParams, SaveRoutingBody, GetRoutingResponse, SaveChannelRoutingBody,
  GetChannelsResponse, CreateChannelResponse, UpdateChannelResponse,
} from "@workspace/api-zod";
import { pool, channels, channel, channelRow, normalizeUsername, audit } from "../../lib/store";
import { replaceSourceRouting } from "../../lib/routing";
import { normalizeRouteContentSettings } from "../../lib/route-content";
import { testSource } from "../../lib/telegram-reader";
import { testDestination } from "../../lib/telegram-bot";

export const channelRouter: IRouter = Router();
channelRouter.get("/channels", async (_req, res) => { res.json(GetChannelsResponse.parse(await channels())); });
channelRouter.post("/channels", async (req, res) => {
  const input = CreateChannelBody.parse(req.body);
  const username = normalizeUsername(input.username);
  const table = input.kind === "source" ? "source_channels" : "destination_channels";
  const { rows } = await pool.query(`INSERT INTO ${table}(name,username,enabled,config) VALUES($1,$2,$3,$4) RETURNING *`,
    [input.name, username, input.enabled, JSON.stringify({ ...input, username })]);
  await audit("info", "channels", `أضيفت قناة ${input.kind === "source" ? "مصدر" : "مستقبلة"} ${username}؛ لم تُختبر صلاحياتها بعد`);
  res.status(201).json(CreateChannelResponse.parse(channelRow(rows[0], input.kind)));
});
channelRouter.put("/channels/:id", async (req, res) => {
  const { id } = UpdateChannelParams.parse(req.params);
  const input = UpdateChannelBody.parse(req.body);
  const existing = await channel(id);
  if (input.kind !== existing.kind) { res.status(400).json({ error: "لا يمكن تغيير نوع القناة" }); return; }
  const username = normalizeUsername(input.username);
  const changed = username !== existing.username;
  const table = input.kind === "source" ? "source_channels" : "destination_channels";
  const savedConfig = await pool.query(`SELECT config FROM ${table} WHERE id=$1`, [Math.abs(id)]);
  const { rows } = await pool.query(`UPDATE ${table} SET name=$2,username=$3,enabled=$4,config=$5,
    status=CASE WHEN $6 THEN 'unverified' ELSE status END,last_error=CASE WHEN $6 THEN NULL ELSE last_error END
    ${input.kind === "source" ? ",last_message_id=CASE WHEN $6 THEN NULL ELSE last_message_id END" : ""}
    WHERE id=$1 RETURNING *`, [Math.abs(id), input.name, username, input.enabled, JSON.stringify({ ...savedConfig.rows[0]?.config, ...input, username }), changed]);
  await audit("info", "channels", `تم تحديث إعدادات ${username}${input.enabled ? "" : " وإيقافها مؤقتاً"}`);
  res.json(UpdateChannelResponse.parse(channelRow(rows[0], input.kind)));
});
channelRouter.delete("/channels/:id", async (req, res) => {
  const { id } = DeleteChannelParams.parse(req.params);
  const existing = await channel(id);
  const table = id < 0 ? "destination_channels" : "source_channels";
  await pool.query(`DELETE FROM ${table} WHERE id=$1`, [Math.abs(id)]);
  await audit("warning", "channels", `حُذفت القناة ${existing.username} وقواعد الربط المرتبطة بها مع الاحتفاظ بسجل الرسائل`);
  res.json({ ok: true, message: "حُذفت القناة وقواعد ربطها، وسجل الرسائل محفوظ" });
});
channelRouter.post("/channels/:id/test", async (req, res) => {
  const { id } = TestChannelParams.parse(req.params);
  const { send } = TestChannelBody.parse(req.body);
  const current = await channel(id);
  if (current.kind === "source" && send) { res.status(400).json({ error: "لا نرسل رسائل اختبار إلى قنوات المصدر" }); return; }
  res.json(current.kind === "source" ? await testSource(current) : await testDestination(id, current.username, false));
});
channelRouter.put("/channels/:id/routing", async (req, res) => {
  const { id } = UpdateChannelParams.parse(req.params);
  if (id <= 0) { res.status(400).json({ error: "معرّف المصدر غير صالح" }); return; }
  const { destinationIds, hideSourceLinkDestinationIds, routeSettings } = SaveChannelRoutingBody.parse(req.body);
  await replaceSourceRouting(id, destinationIds, hideSourceLinkDestinationIds, routeSettings);
  await audit("info", "routing", `تم تحديث وجهات مصدر ${id} يدوياً (${destinationIds.length} وجهة)`);
  res.json({ ok: true, message: "تم حفظ وجهات المصدر المحددة" });
});
channelRouter.get("/routing", async (_req, res) => {
  const { rows } = await pool.query(`SELECT r.source_id AS "sourceId",-r.destination_id AS "destinationId",
    r.hide_source_link AS "hideSourceLink",r.content_settings AS "savedContentSettings",
    COALESCE((s.config->>'skipMessagesWithLinks')::boolean,false) AS "sourceSkipsLinks"
    FROM routing_rules r JOIN source_channels s ON s.id=r.source_id ORDER BY r.id`);
  res.json(GetRoutingResponse.parse(rows.map((row) => ({
    sourceId: row.sourceId,
    destinationId: row.destinationId,
    hideSourceLink: row.hideSourceLink,
    contentSettings: normalizeRouteContentSettings(row.savedContentSettings, !row.sourceSkipsLinks),
  }))));
});
channelRouter.put("/routing", async (req, res) => {
  const { rules } = SaveRoutingBody.parse(req.body);
  const seen = new Set<string>();
  for (const rule of rules) {
    if (rule.sourceId <= 0 || rule.destinationId >= 0 || seen.has(`${rule.sourceId}:${rule.destinationId}`)) {
      res.status(400).json({ error: "قاعدة ربط غير صالحة أو مكررة" }); return;
    }
    seen.add(`${rule.sourceId}:${rule.destinationId}`);
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Serializes full routing replacements while keeping the previous configuration if any validation fails.
    await client.query("SELECT pg_advisory_xact_lock(128006,2)");
    const existing = await client.query("SELECT source_id,destination_id,hide_source_link,content_settings FROM routing_rules");
    const existingByRoute = new Map(existing.rows.map((row) => [`${row.source_id}:${-row.destination_id}`, row]));
    const preparedRules: Array<{ sourceId: number; destinationId: number; hideSourceLink: boolean; contentSettings: ReturnType<typeof normalizeRouteContentSettings> }> = [];
    for (const rule of rules) {
      const sources = await client.query("SELECT id,config FROM source_channels WHERE id=$1", [rule.sourceId]);
      const dests = await client.query("SELECT id FROM destination_channels WHERE id=$1", [-rule.destinationId]);
      if (!sources.rows.length || !dests.rows.length) throw Object.assign(new Error("القناة المحددة لم تعد موجودة"), { status: 400 });
      const previous = existingByRoute.get(`${rule.sourceId}:${rule.destinationId}`);
      const hideSourceLink = rule.hideSourceLink ?? Boolean(previous?.hide_source_link);
      const contentSettings = normalizeRouteContentSettings(
        rule.contentSettings ?? previous?.content_settings,
        !Boolean(sources.rows[0].config?.skipMessagesWithLinks),
      );
      preparedRules.push({ sourceId: rule.sourceId, destinationId: rule.destinationId, hideSourceLink, contentSettings });
    }
    await client.query("DELETE FROM routing_rules");
    for (const rule of preparedRules) {
      await client.query(
        "INSERT INTO routing_rules(source_id,destination_id,hide_source_link,content_settings) VALUES($1,$2,$3,$4)",
        [rule.sourceId, -rule.destinationId, rule.hideSourceLink, rule.contentSettings],
      );
    }
    await client.query("DELETE FROM routing_rules");
    await client.query("COMMIT");
  } catch (e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
  await audit("info", "routing", `تم حفظ ${rules.length} من قواعد الربط`);
  res.json({ ok: true, message: "تم حفظ قواعد الربط؛ القنوات المعطلة لن تنشر الرسائل" });
});
