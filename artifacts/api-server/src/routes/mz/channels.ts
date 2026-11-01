import { Router, type IRouter } from "express";
import {
  CreateChannelBody, UpdateChannelBody, UpdateChannelParams, DeleteChannelParams,
  TestChannelBody, TestChannelParams, SaveRoutingBody, GetRoutingResponse, SaveChannelRoutingBody,
  GetChannelsResponse, CreateChannelResponse, UpdateChannelResponse,
} from "@workspace/api-zod";
import { pool, channels, channel, channelRow, normalizeUsername, audit } from "../../lib/store";
import { replaceAllRouting, replaceSourceRouting } from "../../lib/routing";
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
  await replaceAllRouting(rules);
  await audit("info", "routing", `تم حفظ ${rules.length} من قواعد الربط`);
  res.json({ ok: true, message: "تم حفظ قواعد الربط؛ القنوات المعطلة لن تنشر الرسائل" });
});
