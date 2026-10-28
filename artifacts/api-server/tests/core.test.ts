import { test, after } from "node:test";
import assert from "node:assert/strict";
import { GEMINI_FREE_MODEL, protectTokens, requestGeminiTranslation, restoreTokens } from "../src/lib/translation";
import { acceptsMessage, containsLink, sourceLink, splitText, originalHtml, escapeHtml, marketPriceLine, compose } from "../src/lib/composition";
import { removeSourceReferences } from "../src/lib/source-reference";
import { direction } from "../src/lib/market";
import { channelRow, normalizeUsername, sameTelegramUsername, pool, type Channel } from "../src/lib/store";
import { CreateChannelBody, SaveChannelRoutingBody } from "@workspace/api-zod";
import { replaceSourceRouting } from "../src/lib/routing";

const source: Channel = {
  id: 1, kind: "source", name: "Unit Test", username: "@unit_test", enabled: true,
  translate: false, skipMessagesWithLinks: false, targetLanguage: "ar", attachSource: true, prefix: "", suffix: "",
  filter: "all", mediaMode: "include", translationFailure: "hold",
  marketEnabled: false, showGold: true, showBitcoin: true, marketOrder: "goldFirst",
  stalePolicy: "hide", format: "plain", status: "unverified", lastError: null,
  lastMessageAt: null, createdAt: new Date().toISOString(),
};
test("financial numbers, assets, links and identifiers are restored unchanged", () => {
  const text = "BUY BTC/USD 108,500.00 SL 107000.25 +2.5% https://example.org/x?a=12 @channel";
  const { masked, tokens } = protectTokens(text);
  assert.equal(restoreTokens(masked, tokens), text);
  assert(!masked.includes("108,500.00"));
  assert(!masked.includes("https://example.org"));
});
test("rejects translation that removes an immutable token", () => {
  const { masked, tokens } = protectTokens("BTC 4250");
  assert.throws(() => restoreTokens(masked.replace("⟦MZ0⟧", ""), tokens));
});
test("rejects translation that duplicates an immutable token", () => {
  const { masked, tokens } = protectTokens("BTC 4250");
  assert.throws(() => restoreTokens(masked + "⟦MZ0⟧", tokens));
});
test("Gemini free translation uses the fixed model and keeps its API key out of the URL", async () => {
  let requestUrl = "";
  let requestOptions: RequestInit | undefined;
  const translated = await requestGeminiTranslation(
    "⟦MZ0⟧ hello",
    "Arabic",
    "test-secret",
    async (input, init) => {
      requestUrl = String(input);
      requestOptions = init;
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: "⟦MZ0⟧ مرحباً" }] } }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  );
  assert.equal(translated, "⟦MZ0⟧ مرحباً");
  assert(requestUrl.endsWith(`/models/${GEMINI_FREE_MODEL}:generateContent`));
  assert.equal(new URL(requestUrl).search, "");
  const headers = new Headers(requestOptions?.headers);
  assert.equal(headers.get("x-goog-api-key"), "test-secret");
  const body = JSON.parse(String(requestOptions?.body));
  assert.equal(body.contents[0].parts[0].text, "⟦MZ0⟧ hello");
  assert.equal(body.generationConfig.temperature, undefined);
  assert.equal(body.generationConfig.maxOutputTokens, 8192);
});
test("Gemini quota failures explain the free limit without exposing response content", async () => {
  await assert.rejects(
    requestGeminiTranslation("hello", "ar", "test-secret", async () => new Response(
      JSON.stringify({ error: { message: "provider response detail" } }),
      { status: 429 },
    )),
    (error: unknown) => {
      assert(error instanceof Error);
      assert.match(error.message, /تم تجاوز حصة Gemini المجانية.*HTTP 429/);
      assert(!error.message.includes("provider response detail"));
      assert(!error.message.includes("test-secret"));
      return true;
    },
  );
});
test("market direction uses only the previous successful reading", () => {
  assert.equal(direction(10, null), "neutral");
  assert.equal(direction(10, 10), "neutral");
  assert.equal(direction(11, 10), "up");
  assert.equal(direction(9, 10), "down");
});
test("valid public channel names normalize consistently", () => {
  for (const value of [
    "@Market_channel", "@MARKET_CHANNEL", "Market_channel",
    "https://t.me/Market_channel", "HTTPS://WWW.T.ME/MARKET_CHANNEL/",
  ]) assert.equal(normalizeUsername(value), "@market_channel");
  assert.equal(normalizeUsername("@Market_channel"), normalizeUsername("@market_channel"));
});
test("Telegram usernames compare without case sensitivity for legacy delivery records", () => {
  assert(sameTelegramUsername("@Market_channel", "@market_channel"));
  assert(sameTelegramUsername("Market_channel", "@MARKET_CHANNEL"));
  assert(!sameTelegramUsername("@market_channel", "@other_channel"));
});
test("private links, arbitrary URLs, users and malformed references are rejected", () => {
  for (const value of ["https://t.me/+abc", "https://evil.test/channel", "@a", "t.me/c/123/1", "x';DELETE"]) assert.throws(() => normalizeUsername(value));
});
test("disabled sources cannot enter routing", () => { assert(!acceptsMessage({ ...source, enabled: false }, "BUY BTC", false)); });
test("source link filtering ignores linked messages while preserving unlinked ones", () => {
  const sourceWithLinkFilter = { ...source, skipMessagesWithLinks: true };
  assert(containsLink("Read https://example.com/report"));
  assert(containsLink("Open the link", [{ className: "MessageEntityTextUrl", url: "https://example.com" }]));
  assert(containsLink("example.com", [{ className: "MessageEntityUrl" }]));
  assert(!containsLink("BTC/USD reached 80,000"));
  assert(!acceptsMessage(sourceWithLinkFilter, "Trade setup https://example.com", false));
  assert(!acceptsMessage(sourceWithLinkFilter, "More information", false, [{ className: "MessageEntityTextUrl", url: "https://example.com" }]));
  assert(acceptsMessage(sourceWithLinkFilter, "Trade setup without a link", false));
  assert(acceptsMessage(source, "Trade setup https://example.com", false));
});
test("recommendation filter matches Arabic and English but not unrelated text", () => {
  const s = { ...source, filter: "recommendations" as const };
  assert(acceptsMessage(s, "شراء الذهب هدف 1234", false));
  assert(acceptsMessage(s, "BUY BTC", false));
  assert(!acceptsMessage(s, "صباح الخير", false));
});
test("text-only filter excludes images and image-only sources respect media policy", () => {
  assert(!acceptsMessage({ ...source, filter: "text" }, "caption", true));
  assert(!acceptsMessage({ ...source, mediaMode: "textOnly" }, "", true));
  assert(acceptsMessage(source, "", true));
});
test("source link uses real public message identifiers", () => {
  assert.equal(sourceLink("@abcde", 234), "https://t.me/abcde/234");
  assert.equal(sourceLink("@abcde"), "https://t.me/abcde");
});
test("source reference cleanup removes only the selected channel's visible links and mentions", () => {
  assert.equal(
    removeSourceReferences("خبر اليوم https://t.me/unit_test/123.", [], source.username, source.name).text,
    "خبر اليوم",
  );
  assert.equal(
    removeSourceReferences("قبل https://t.me/s/UNIT_TEST/123 وبعد", [], source.username, source.name).text,
    "قبل وبعد",
  );
  assert.equal(
    removeSourceReferences("تابعونا @UNIT_TEST", [], source.username, source.name).text,
    "",
  );
  assert.equal(
    removeSourceReferences("معلومة مهمة\nالمصدر: http://t.me/unit_test\nتفاصيل إضافية", [], source.username, source.name).text,
    "معلومة مهمة\nتفاصيل إضافية",
  );
  const caption = "تعليق الصورة https://t.me/unit_test/52";
  assert.equal(removeSourceReferences(caption, [], source.username, source.name).text, "تعليق الصورة");
  const unrelated = "رابط الخبر https://news.example/story وقناة أخرى https://t.me/other_channel/9";
  assert.equal(removeSourceReferences(unrelated, [], source.username, source.name).text, unrelated);
  const plain = "لا يحتوي المنشور على إحالة";
  assert.deepEqual(removeSourceReferences(plain, [], source.username, source.name), { text: plain, entities: [] });
});
test("source cleanup removes hidden source links and remaps unrelated link entities", () => {
  const text = "Read link, keep external";
  const cleaned = removeSourceReferences(text, [
    { className: "MessageEntityTextUrl", offset: text.indexOf("link"), length: 4, url: "https://t.me/unit_test/22" },
    { className: "MessageEntityTextUrl", offset: text.indexOf("external"), length: 8, url: "https://example.com" },
  ], source.username, source.name);
  assert.equal(cleaned.text, "Read keep external");
  assert.deepEqual(cleaned.entities, [
    { className: "MessageEntityTextUrl", offset: 10, length: 8, url: "https://example.com" },
  ]);
});
test("route hide-source option runs before composition while disabled routes keep the source link", async () => {
  const destination: Channel = {
    ...source, id: -2, kind: "destination", name: "Destination", username: "@unit_destination",
    attachSource: false,
  };
  const message = "خبر https://t.me/unit_test/3";
  const preserved = await compose(source, destination, message, undefined, [], false);
  const hidden = await compose(source, destination, message, undefined, [], true);
  assert(preserved.text.includes("https://t.me/unit_test/3"));
  assert(!hidden.text.includes("t.me/unit_test"));
  assert(!hidden.text.includes(source.name));
});
test("market price line omits provider and timestamp while retaining stale-price warning", () => {
  const fresh = marketPriceLine("BTC/USD", 81671.65, "down", false);
  assert.equal(fresh, "البيتكوين BTC/USD: 81,671.65 $ ▼");
  assert(!fresh.includes("Coinbase"));
  assert(!fresh.includes("2026"));
  assert.equal(marketPriceLine("XAU/USD", 2400, "up", true), "الذهب XAU/USD: 2,400.00 $ ▲ • سعر قديم");
});
test("splitting preserves content and Telegram length limits including surrogate pairs", () => {
  const input = "a".repeat(3999) + "🚀" + "\n" + "b".repeat(6000);
  const chunks = splitText(input);
  assert.equal(chunks.join(""), input);
  assert(chunks.every(c => c.length <= 4000));
  assert(chunks.every(c => !/[\uD800-\uDBFF]$/.test(c)));
});
test("plain content is HTML-escaped instead of executing user markup", () => {
  assert.equal(escapeHtml('<b>a&b</b>'), "&lt;b&gt;a&amp;b&lt;/b&gt;");
  assert.equal(originalHtml("<script>x</script>"), "&lt;script&gt;x&lt;/script&gt;");
});
test("original Telegram emphasis and text links preserve supported formatting", () => {
  assert.equal(originalHtml("BUY BTC", [{ className: "MessageEntityBold", offset: 0, length: 3 }]), "<b>BUY</b> BTC");
  assert.equal(originalHtml("link", [{ className: "MessageEntityTextUrl", offset: 0, length: 4, url: "javascript:alert(1)" }]), "link");
});
test("channel input contract requires per-channel switches", () => {
  assert(CreateChannelBody.safeParse(source).success);
  assert(!CreateChannelBody.safeParse({ name: "incomplete", username: "@abcde" }).success);
});
test("legacy saved source configs default link filtering off", () => {
  const legacy = channelRow({
    id: 8, name: "Legacy source", username: "@legacy_source", enabled: true,
    config: {}, status: "ready", last_error: null, last_message_at: null, created_at: new Date(),
  }, "source");
  assert.equal(legacy.skipMessagesWithLinks, false);
});
test("PostgreSQL allows explicitly selected many-to-many routing and prevents duplicate deliveries", async () => {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const s = (await db.query("INSERT INTO source_channels(name,username,enabled) VALUES('unit source','@mz_unit_source',false) RETURNING id")).rows[0].id;
    const s2 = (await db.query("INSERT INTO source_channels(name,username,enabled) VALUES('unit source 2','@mz_unit_source_2',false) RETURNING id")).rows[0].id;
    const d = (await db.query("INSERT INTO destination_channels(name,username,enabled) VALUES('unit destination','@mz_unit_destination',false) RETURNING id")).rows[0].id;
    const d2 = (await db.query("INSERT INTO destination_channels(name,username,enabled) VALUES('unit destination 2','@mz_unit_destination_2',false) RETURNING id")).rows[0].id;
    await db.query("INSERT INTO routing_rules(source_id,destination_id) VALUES($1,$2)", [s, d]);
    const route = await db.query("INSERT INTO routing_rules(source_id,destination_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING id", [s, d]);
    assert.equal(route.rowCount, 0);
    const secondDestination = await db.query("INSERT INTO routing_rules(source_id,destination_id) VALUES($1,$2) RETURNING id", [s, d2]);
    const secondSource = await db.query("INSERT INTO routing_rules(source_id,destination_id) VALUES($1,$2) RETURNING id", [s2, d]);
    assert.equal(secondDestination.rowCount, 1);
    assert.equal(secondSource.rowCount, 1);
    const m = (await db.query("INSERT INTO messages(source_id,source_key,telegram_message_id,text) VALUES($1,'@mz_unit_source',1,'unit') RETURNING id", [s])).rows[0].id;
    const duplicate = await db.query("INSERT INTO messages(source_id,source_key,telegram_message_id,text) VALUES($1,'@mz_unit_source',1,'unit') ON CONFLICT DO NOTHING RETURNING id", [s]);
    assert.equal(duplicate.rowCount, 0);
    const noRouteToDisabled = await db.query(`SELECT d.id FROM routing_rules r JOIN destination_channels d ON d.id=r.destination_id WHERE r.source_id=$1 AND d.enabled=true`, [s]);
    assert.equal(noRouteToDisabled.rowCount, 0);
    await db.query("INSERT INTO message_deliveries(message_id,destination_id,destination_key) VALUES($1,$2,'@mz_unit_destination')", [m, d]);
    const repeatDelivery = await db.query("INSERT INTO message_deliveries(message_id,destination_id,destination_key) VALUES($1,$2,'@mz_unit_destination') ON CONFLICT DO NOTHING RETURNING id", [m, d]);
    assert.equal(repeatDelivery.rowCount, 0);
    // Uncertain sends must not be selected by the automatic retry queue.
    await db.query("UPDATE message_deliveries SET status='unknown' WHERE message_id=$1", [m]);
    const retryable = await db.query("SELECT id FROM message_deliveries WHERE message_id=$1 AND status IN ('pending','retrying')", [m]);
    assert.equal(retryable.rowCount, 0);
  } finally {
    await db.query("ROLLBACK"); // No test channels/messages persist.
    db.release();
  }
});
test("editing a source replaces only its selected destinations and rolls back invalid choices", async () => {
  const db = await pool.connect();
  const suffix = `${process.pid}_${Date.now()}`;
  let sourceId: number | undefined;
  let otherSourceId: number | undefined;
  let destinationId: number | undefined;
  let otherDestinationId: number | undefined;
  try {
    sourceId = (await db.query(
      "INSERT INTO source_channels(name,username,enabled) VALUES($1,$2,false) RETURNING id",
      [`route source ${suffix}`, `@mz_src_${suffix}`],
    )).rows[0].id;
    otherSourceId = (await db.query(
      "INSERT INTO source_channels(name,username,enabled) VALUES($1,$2,false) RETURNING id",
      [`route source other ${suffix}`, `@mz_src_other_${suffix}`],
    )).rows[0].id;
    destinationId = (await db.query(
      "INSERT INTO destination_channels(name,username,enabled) VALUES($1,$2,false) RETURNING id",
      [`route destination ${suffix}`, `@mz_dst_${suffix}`],
    )).rows[0].id;
    otherDestinationId = (await db.query(
      "INSERT INTO destination_channels(name,username,enabled) VALUES($1,$2,false) RETURNING id",
      [`route destination other ${suffix}`, `@mz_dst_other_${suffix}`],
    )).rows[0].id;

    assert(SaveChannelRoutingBody.safeParse({
      destinationIds: [-destinationId, -otherDestinationId],
      hideSourceLinkDestinationIds: [-destinationId],
    }).success);
    assert(!SaveChannelRoutingBody.safeParse({ destinationIds: [destinationId] }).success);

    await replaceSourceRouting(sourceId, [-destinationId, -otherDestinationId], [-destinationId]);
    await replaceSourceRouting(otherSourceId, [-otherDestinationId], []);
    await replaceSourceRouting(sourceId, [-destinationId]);

    const selected = await db.query(
      "SELECT destination_id,hide_source_link FROM routing_rules WHERE source_id=$1 ORDER BY destination_id",
      [sourceId],
    );
    const otherSelected = await db.query(
      "SELECT destination_id FROM routing_rules WHERE source_id=$1",
      [otherSourceId],
    );
    assert.deepEqual(selected.rows.map((row) => ({ destinationId: row.destination_id, hideSourceLink: row.hide_source_link })), [
      { destinationId, hideSourceLink: true },
    ]);
    assert.deepEqual(otherSelected.rows.map((row) => row.destination_id), [otherDestinationId]);
    await assert.rejects(() => replaceSourceRouting(sourceId!, [-destinationId!], [-otherDestinationId!]), /غير صالحة/);
    await replaceSourceRouting(sourceId, [-destinationId], []);
    const unhidden = await db.query("SELECT hide_source_link FROM routing_rules WHERE source_id=$1", [sourceId]);
    assert.equal(unhidden.rows[0].hide_source_link, false);

    await assert.rejects(() => replaceSourceRouting(sourceId!, [-2147483647]), /غير موجودة/);
    const afterFailure = await db.query(
      "SELECT destination_id FROM routing_rules WHERE source_id=$1",
      [sourceId],
    );
    assert.deepEqual(afterFailure.rows.map((row) => row.destination_id), [destinationId]);

    await replaceSourceRouting(sourceId, []);
    const cleared = await db.query("SELECT id FROM routing_rules WHERE source_id=$1", [sourceId]);
    assert.equal(cleared.rowCount, 0);
  } finally {
    if (sourceId) await db.query("DELETE FROM source_channels WHERE id=$1", [sourceId]);
    if (otherSourceId) await db.query("DELETE FROM source_channels WHERE id=$1", [otherSourceId]);
    if (destinationId) await db.query("DELETE FROM destination_channels WHERE id=$1", [destinationId]);
    if (otherDestinationId) await db.query("DELETE FROM destination_channels WHERE id=$1", [otherDestinationId]);
    db.release();
  }
});
after(async () => { await pool.end(); });
