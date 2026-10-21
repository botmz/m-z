import { test, after } from "node:test";
import assert from "node:assert/strict";
import { protectTokens, restoreTokens } from "../src/lib/translation";
import { acceptsMessage, sourceLink, splitText, originalHtml, escapeHtml } from "../src/lib/composition";
import { direction } from "../src/lib/market";
import { normalizeUsername, pool, type Channel } from "../src/lib/store";
import { CreateChannelBody } from "@workspace/api-zod";

const source: Channel = {
  id: 1, kind: "source", name: "Unit Test", username: "@unit_test", enabled: true,
  translate: false, targetLanguage: "ar", attachSource: true, prefix: "", suffix: "",
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
test("market direction uses only the previous successful reading", () => {
  assert.equal(direction(10, null), "neutral");
  assert.equal(direction(10, 10), "neutral");
  assert.equal(direction(11, 10), "up");
  assert.equal(direction(9, 10), "down");
});
test("valid public channel names normalize consistently", () => {
  for (const value of ["@Market_channel", "https://t.me/Market_channel", "Market_channel"]) assert.equal(normalizeUsername(value), "@market_channel");
});
test("private links, arbitrary URLs, users and malformed references are rejected", () => {
  for (const value of ["https://t.me/+abc", "https://evil.test/channel", "@a", "t.me/c/123/1", "x';DELETE"]) assert.throws(() => normalizeUsername(value));
});
test("disabled sources cannot enter routing", () => { assert(!acceptsMessage({ ...source, enabled: false }, "BUY BTC", false)); });
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
test("PostgreSQL prevents duplicate reception, routing and per-destination delivery atomically", async () => {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const s = (await db.query("INSERT INTO source_channels(name,username,enabled) VALUES('unit source','@mz_unit_source',false) RETURNING id")).rows[0].id;
    const d = (await db.query("INSERT INTO destination_channels(name,username,enabled) VALUES('unit destination','@mz_unit_destination',false) RETURNING id")).rows[0].id;
    await db.query("INSERT INTO routing_rules(source_id,destination_id) VALUES($1,$2)", [s, d]);
    const route = await db.query("INSERT INTO routing_rules(source_id,destination_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING id", [s, d]);
    assert.equal(route.rowCount, 0);
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
after(async () => { await pool.end(); });
