import { after, test } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../src/lib/store";
import { processDelivery } from "../src/lib/worker";
import { TelegramApiError } from "../src/lib/telegram-bot";
import { normalizeRouteContentSettings, routeContentSettingsKey } from "../src/lib/route-content";
import { createSendPlan, CURRENT_LINK_POLICY_VERSION } from "../src/lib/composition";
import express from "express";
import { operationsRouter } from "../src/routes/mz/operations";
import { SaveSettingsBody } from "@workspace/api-zod";

// Exercise the real persisted queue and worker, replacing only external sends and
// the global pause setting. Future due dates keep the running worker off fixtures.
async function fixture(text: string, run: (f: {
  id: number;
  sourceKey: string;
  enableFilter: () => Promise<unknown>;
  setText: (text: string) => Promise<unknown>;
  saveMedia: (kind: string, data: Buffer, mimeType: string, filename: string) => Promise<unknown>;
  savePlan: (parts: string[], sentIds?: number[], translated?: boolean) => Promise<unknown>;
  excludeTexts: (texts: string[]) => Promise<unknown>;
  state: () => Promise<Record<string, any>>;
}) => Promise<void>, entities: unknown[] = []) {
  const suffix = `${process.pid}_${Date.now()}_${++sequence}`;
  let sourceId: number | undefined;
  let destinationId: number | undefined;
  let messageId: number | undefined;
  const config = {
    translate: true, targetLanguage: "ar", skipMessagesWithLinks: false,
    attachSource: false, mediaMode: "include", filter: "all",
    marketEnabled: false, signatureEnabled: false, format: "plain",
  };
  try {
    sourceId = (await pool.query(
      "INSERT INTO source_channels(name,username,enabled,config) VALUES($1,$2,true,$3) RETURNING id",
      [`worker source ${suffix}`, `@mz_worker_src_${suffix}`, JSON.stringify(config)],
    )).rows[0].id;
    destinationId = (await pool.query(
      "INSERT INTO destination_channels(name,username,enabled,config) VALUES($1,$2,true,$3) RETURNING id",
      [`worker destination ${suffix}`, `@mz_worker_dst_${suffix}`, JSON.stringify(config)],
    )).rows[0].id;
    await pool.query("INSERT INTO routing_rules(source_id,destination_id) VALUES($1,$2)", [sourceId, destinationId]);
    messageId = (await pool.query(
      `INSERT INTO messages(source_id,source_key,telegram_message_id,text,entities)
       VALUES($1,$2,1,$3,$4) RETURNING id`,
      [sourceId, `@mz_worker_src_${suffix}`, text, JSON.stringify(entities)],
    )).rows[0].id;
    const id = (await pool.query(
      `INSERT INTO message_deliveries(message_id,destination_id,destination_key,next_attempt_at)
       VALUES($1,$2,$3,now()+interval '1 day') RETURNING id`,
      [messageId, destinationId, `@mz_worker_dst_${suffix}`],
    )).rows[0].id;
    await run({
      id,
      sourceKey: `@mz_worker_src_${suffix}`,
      enableFilter: () => pool.query(
        `UPDATE source_channels SET config=jsonb_set(config,'{skipMessagesWithLinks}','true') WHERE id=$1`,
        [sourceId],
      ),
      setText: text => pool.query("UPDATE messages SET text=$2 WHERE id=$1", [messageId, text]),
      saveMedia: (kind, data, mimeType, filename) => pool.query(
        "UPDATE messages SET has_photo=true,media_kind=$2,media_data=$3,media_mime_type=$4,media_filename=$5 WHERE id=$1",
        [messageId, kind, data, mimeType, filename],
      ),
      savePlan: (parts, sentIds = [], translated = false) => pool.query(
        `UPDATE message_deliveries SET send_plan=$2,telegram_message_ids=$3,status=$4,translation_status=$5 WHERE id=$1`,
        [id, JSON.stringify(parts.map(text => ({
          method: "sendMessage", text, hideSourceLink: false, removeLinks: false,
          linkPolicyVersion: CURRENT_LINK_POLICY_VERSION,
          contentSettingsHash: routeContentSettingsKey(normalizeRouteContentSettings(undefined, true)),
        }))), JSON.stringify(sentIds), sentIds.length ? "retrying" : "pending",
        translated ? "translated" : "not_requested"],
      ),
      excludeTexts: (texts) => pool.query(
        `UPDATE routing_rules SET content_settings=COALESCE(content_settings,'{}'::jsonb) || jsonb_build_object('excludedTexts',$3::jsonb)
         WHERE source_id=$1 AND destination_id=$2`,
        [sourceId, destinationId, JSON.stringify(texts)],
      ),
      state: async () => (await pool.query("SELECT * FROM message_deliveries WHERE id=$1", [id])).rows[0],
    });
  } finally {
    if (messageId) await pool.query("DELETE FROM messages WHERE id=$1", [messageId]);
    if (sourceId) await pool.query("DELETE FROM source_channels WHERE id=$1", [sourceId]);
    if (destinationId) await pool.query("DELETE FROM destination_channels WHERE id=$1", [destinationId]);
  }
}
let sequence = 0;
const workerEnabled = async () => true;
const noSend = async () => { assert.fail("Telegram Bot API must not be called"); };

test("enabling link removal skips an already queued URL-only message without a Bot API call", async () => {
  await fixture("https://example.org/report", async f => {
    await f.savePlan(["https://example.org/report"]);
    await f.enableFilter();
    await processDelivery(f.id, { api: noSend, workerEnabled });
    const state = await f.state();
    assert.equal(state.status, "skipped");
    assert.match(state.error, /تم تجاوز المنشور/);
    assert.deepEqual(state.telegram_message_ids, []);
    const attempts = await pool.query("SELECT status,detail FROM delivery_attempts WHERE delivery_id=$1 AND status='skipped'", [f.id]);
    assert.equal(attempts.rowCount, 1);
    assert.match(attempts.rows[0].detail, /لا يوجد نص/);
  });
});

test("an excluded full source text skips its queued delivery without sending prices or a signature", async () => {
  await fixture("صباح الخير", async f => {
    await f.excludeTexts(["صباح الخير"]);
    await processDelivery(f.id, { api: noSend, workerEnabled });
    const state = await f.state();
    assert.equal(state.status, "skipped");
    assert.match(state.error, /مستثنى/);
    assert.deepEqual(state.telegram_message_ids, []);
    assert.equal(state.send_plan, null);
  });
});

test("queued linked content is rebuilt without URLs and sent once, never discarded wholesale", async () => {
  await fixture("Gold rose 2.5% https://example.org/report", async f => {
    await f.savePlan(["Gold rose 2.5% https://example.org/report"]);
    await f.enableFilter();
    const requests: unknown[] = [];
    const api = async (method: string, body: unknown) => {
      requests.push({ method, body });
      return { message_id: 201 };
    };
    await processDelivery(f.id, { api, workerEnabled });
    await processDelivery(f.id, { api, workerEnabled });
    assert.equal(requests.length, 1);
    assert.equal((requests[0] as any).method, "sendMessage");
    assert.equal((requests[0] as any).body.text, "Gold rose 2.5%");
    const state = await f.state();
    assert.equal(state.status, "sent");
    assert.equal(state.translation_status, "not_requested");
    assert.deepEqual(state.telegram_message_ids, [201]);
    assert.equal(state.send_plan[0].removeLinks, true);
    assert.equal(state.send_plan[0].linkPolicyVersion, CURRENT_LINK_POLICY_VERSION);
  });
});

test("a non-linked queued message remains sendable after enabling link removal", async () => {
  await fixture("BUY BTC 80,000", async f => {
    await f.enableFilter();
    let calls = 0;
    await processDelivery(f.id, {
      workerEnabled,
      api: async (method, body) => {
        calls++;
        assert.equal(method, "sendMessage");
        assert.equal((body as Record<string, unknown>).text, "BUY BTC 80,000");
        return { message_id: 301 };
      },
    });
    assert.equal(calls, 1);
    assert.equal((await f.state()).status, "sent");
  });
});

test("link removal preserves hidden-link words but strips their URL formatting", async () => {
  await fixture("Read report", async f => {
    await f.enableFilter();
    await processDelivery(f.id, {
      workerEnabled,
      api: async (_method, body) => {
        assert.equal((body as Record<string, unknown>).text, "Read report");
        return { message_id: 401 };
      },
    });
    const state = await f.state();
    assert.equal(state.status, "sent");
    assert.equal(state.send_plan[0].text, "Read report");
    assert(!JSON.stringify(state.send_plan).includes("example.org"));
  }, [{ className: "MessageEntityTextUrl", offset: 5, length: 6, url: "https://example.org" }]);
});

test("resuming a partially sent linked message after filter activation holds it without further sends", async () => {
  await fixture("First part\nhttps://example.org", async f => {
    await f.savePlan(["First part", "https://example.org"], [501]);
    await f.enableFilter();
    await processDelivery(f.id, { api: noSend, workerEnabled });
    const state = await f.state();
    assert.equal(state.status, "held");
    assert.match(state.error, /أُوقف الاستكمال/);
    assert.deepEqual(state.telegram_message_ids, [501]);
    assert.equal(state.send_plan[1].text, "https://example.org");
    const attempts = await pool.query("SELECT status FROM delivery_attempts WHERE delivery_id=$1 AND status='held'", [f.id]);
    assert.equal(attempts.rowCount, 1);
  });
});

test("unchanged partial plans resume at the next part without repeating the confirmed part", async () => {
  await fixture("First part\nSecond part", async f => {
    await f.savePlan(["First part", "Second part"], [601]);
    const texts: unknown[] = [];
    const api = async (_method: string, body: any) => {
      texts.push(body.text);
      return { message_id: 602 };
    };
    await processDelivery(f.id, { api, workerEnabled });
    await processDelivery(f.id, { api, workerEnabled });
    assert.deepEqual(texts, ["Second part"]);
    assert.deepEqual((await f.state()).telegram_message_ids, [601, 602]);
    assert.equal((await f.state()).status, "sent");
  });
});

test("old translated queue plans are rebuilt as original text; partial translations are not continued", async () => {
  await fixture("Gold rose", async f => {
    await f.savePlan(["ارتفع الذهب"], [], true);
    await processDelivery(f.id, {
      workerEnabled,
      api: async (_method, body) => {
        assert.equal((body as Record<string, unknown>).text, "Gold rose");
        return { message_id: 701 };
      },
    });
    assert.equal((await f.state()).translation_status, "not_requested");
  });
  await fixture("Gold rose", async f => {
    await f.savePlan(["ارتفع", "الذهب"], [702], true);
    await processDelivery(f.id, { api: noSend, workerEnabled });
    assert.equal((await f.state()).status, "held");
    assert.deepEqual((await f.state()).telegram_message_ids, [702]);
  });
});

test("link-only media posts retain a single media delivery rather than an extra text message", () => {
  assert.deepEqual(createSendPlan("", "", true, false), [{ method: "sendMedia", text: "" }]);
});

test("a queued video retries from its saved file, removes only the source attribution, and sends once", async () => {
  const payload = Buffer.from("saved-video-bytes");
  await fixture("Video details", async f => {
      await f.setText(`Video details https://example.org/report\nSource: ${f.sourceKey}\nhttps://t.me/${f.sourceKey.slice(1)}/1`);
      await f.saveMedia("video", payload, "video/mp4", "market-update.mp4");
      await pool.query("UPDATE routing_rules SET hide_source_link=true WHERE destination_id=(SELECT destination_id FROM message_deliveries WHERE id=$1)", [f.id]);
      const calls: Array<{ method: string; body: any }> = [];
      const api = async (method: string, body: any) => {
        calls.push({ method, body });
        const video = body.get("video") as File;
        assert.equal(video.name, "market-update.mp4");
        assert.deepEqual(Buffer.from(await video.arrayBuffer()), payload);
        assert.equal(body.get("caption"), "Video details https://example.org/report");
        if (calls.length === 1) throw new TelegramApiError("Too Many Requests", 429);
        return { message_id: 801 };
      };
      await processDelivery(f.id, { api, workerEnabled });
      await processDelivery(f.id, { api, workerEnabled });
      await processDelivery(f.id, { api, workerEnabled });
      assert.equal(calls.length, 2);
      assert(calls.every(call => call.method === "sendVideo" && call.body instanceof FormData));
      const state = await f.state();
      assert.equal(state.status, "sent");
      assert.deepEqual(state.telegram_message_ids, [801]);
    },
  );
});

test("a queued document is sent as a Telegram file with its original caption", async () => {
  const payload = Buffer.from("saved-document-bytes");
  await fixture("ملف مهم", async f => {
    await f.saveMedia("file", payload, "application/pdf", "report.pdf");
    const calls: Array<{ method: string; body: any }> = [];
    await processDelivery(f.id, {
      workerEnabled,
      api: async (method, body) => {
        calls.push({ method, body });
        const document = body.get("document") as File;
        assert.equal(document.name, "report.pdf");
        assert.deepEqual(Buffer.from(await document.arrayBuffer()), payload);
        assert.equal(body.get("caption"), "ملف مهم");
        return { message_id: 802 };
      },
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.method, "sendDocument");
    assert.equal((await f.state()).status, "sent");
    assert.deepEqual((await f.state()).telegram_message_ids, [802]);
  });
});

test("removed translation cannot be reactivated or tested through old API clients", async () => {
  const app = express();
  app.use(express.json(), operationsRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const configResponse = await fetch(`${base}/settings`);
    assert.equal(configResponse.status, 200);
    const config = await configResponse.json();
    assert.equal(config.translationProvider, undefined);
    const parsed = SaveSettingsBody.parse({ ...config, translationProvider: "gemini" });
    assert(!("translationProvider" in parsed));
    const providerTest = await fetch(`${base}/translation/test`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "gemini", model: "unused" }),
    });
    assert.equal(providerTest.status, 404);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

after(async () => { await pool.end(); });
