import { test, after } from "node:test";
import assert from "node:assert/strict";
import { acceptsMessage, containsLink, sourceLink, splitText, originalHtml, escapeHtml, marketPriceLine, compose, createSendPlan, isBotTestMessage, savedPlanDisposition, savedPlanNeedsLinkRefresh } from "../src/lib/composition";
import { removeSourceReferences, removeTextLinks } from "../src/lib/source-reference";
import { direction } from "../src/lib/market";
import { channelRow, normalizeUsername, sameTelegramUsername, pool, claimDelivery, type Channel } from "../src/lib/store";
import { CreateChannelBody, SaveChannelRoutingBody } from "@workspace/api-zod";
import { replaceSourceRouting } from "../src/lib/routing";
import { ingest, isVideoDocument } from "../src/lib/telegram-reader";
import { resolveWorkerHealth, WORKER_HEARTBEAT_STALE_AFTER_MS } from "../src/lib/worker-health";
import { normalizeRouteContentSettings, routeAllowsMedia, isRouteMessageExcluded } from "../src/lib/route-content";
import { Api } from "teleproto";

const source: Channel = {
  id: 1, kind: "source", name: "Unit Test", username: "@unit_test", enabled: true,
  skipMessagesWithLinks: false, attachSource: true, signatureEnabled: false, prefix: "", suffix: "",
  filter: "all", mediaMode: "include",
  marketEnabled: false, showGold: true, showBitcoin: true, marketOrder: "goldFirst",
  stalePolicy: "hide", format: "plain", status: "unverified", lastError: null,
  lastMessageAt: null, createdAt: new Date().toISOString(),
};
test("market direction uses only the previous successful reading", () => {
  assert.equal(direction(10, null), "neutral");
  assert.equal(direction(10, 10), "neutral");
  assert.equal(direction(11, 10), "up");
  assert.equal(direction(9, 10), "down");
});
test("worker health distinguishes a fresh heartbeat, a missing heartbeat, and a stale heartbeat", () => {
  const now = Date.parse("2026-10-28T12:00:00.000Z");
  const fresh = {
    status: "running",
    detail: "العامل يستقبل ويعالج الرسائل",
    checkedAt: new Date(now - WORKER_HEARTBEAT_STALE_AFTER_MS + 1).toISOString(),
  };
  assert.equal(resolveWorkerHealth(fresh, true, now).status, "running");
  assert.equal(resolveWorkerHealth(null, true, now).status, "stale");
  assert.equal(
    resolveWorkerHealth({ ...fresh, checkedAt: new Date(now - WORKER_HEARTBEAT_STALE_AFTER_MS - 1).toISOString() }, true, now).status,
    "stale",
  );
  assert.equal(resolveWorkerHealth(fresh, false, now).status, "stopped");
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
test("bot connectivity test posts are skipped instead of being forwarded with market and signature text", () => {
  const testPost = "مرحباً 🥺🥺🥺 هذه رسالة اختبار للتحقق مما إذا كان البوت يعمل بشكل صحيح. يرجى تأكيد استلامك لهذه الرسالة";
  assert(isBotTestMessage(testPost));
  assert(!acceptsMessage(source, testPost, false));
  assert(!acceptsMessage(source, testPost, true));
  assert(!isBotTestMessage("شرح كيفية اختبار البوت في إصدار جديد"));
});
test("source link-removal option keeps linked messages instead of skipping them", () => {
  const sourceWithLinkFilter = { ...source, skipMessagesWithLinks: true };
  assert(containsLink("Read https://example.com/report"));
  assert(containsLink("Visit example.com/contact"));
  assert(containsLink("Open the link", [{ className: "MessageEntityTextUrl", url: "https://example.com" }]));
  assert(containsLink("example.com", [{ className: "MessageEntityUrl" }]));
  assert(!containsLink("Email owner@example.com"));
  assert(!containsLink("BTC/USD reached 80,000"));
  assert(acceptsMessage(sourceWithLinkFilter, "Trade setup https://example.com", false));
  assert(acceptsMessage(sourceWithLinkFilter, "More information", false, [{ className: "MessageEntityTextUrl", url: "https://example.com" }]));
  assert(acceptsMessage(sourceWithLinkFilter, "Trade setup without a link", false));
  assert(acceptsMessage(source, "Trade setup https://example.com", false));
});
test("link cleanup removes visible URLs, keeps hidden-link words, and preserves surrounding content", () => {
  assert.equal(
    removeTextLinks("Price rose 2.5% https://example.com/report.").text,
    "Price rose 2.5%.",
  );
  assert.equal(
    removeTextLinks("BUY BTC https://example.com/mid now; target 80,000").text,
    "BUY BTC now; target 80,000",
  );
  assert.equal(
    removeTextLinks("خبر عربي https://t.me/news/10، ثم https://example.com/a\nwww.example.org").text,
    "خبر عربي، ثم",
  );
  assert.equal(
    removeTextLinks("سعر 80,415$ ▼\n\nوصل الذهب للمقاومة\n\nللتواصل: https://example.com/contact\n\nnews.example.net\n//mirror.example.org").text,
    "سعر 80,415$ ▼\n\nوصل الذهب للمقاومة\n\nللتواصل:",
  );
  const hiddenText = "Read the report";
  const hidden = removeTextLinks(hiddenText, [
    { className: "MessageEntityTextUrl", offset: 9, length: 6, url: "https://hidden.example/report" },
  ]);
  assert.equal(hidden.text, hiddenText);
  assert.deepEqual(hidden.entities, []);
  const visibleEntity = "💰 visit https://example.org now";
  const urlOffset = visibleEntity.indexOf("https://");
  const entityCleaned = removeTextLinks(visibleEntity, [
    { className: "MessageEntityUrl", offset: urlOffset, length: "https://example.org".length },
  ]);
  assert.equal(entityCleaned.text, "💰 visit now");
  assert.deepEqual(removeTextLinks("No URLs here", []).text, "No URLs here");
  assert.equal(removeTextLinks("Email me at owner@example.com").text, "Email me at owner@example.com");
  assert.equal(removeTextLinks("https://only.example").text, "");
  assert(acceptsMessage(source, "", true), "media remains eligible when URL removal empties its caption");
  assert(!acceptsMessage(source, "", false), "an empty text-only post has no sendable content");
  assert(acceptsMessage({ ...source, filter: "recommendations" }, "", true), "an empty link-stripped caption must not suppress attached media");
});
test("messages keep their source language while preserving route link settings", async () => {
  const destination: Channel = { ...source, id: -2, kind: "destination", username: "@destination", attachSource: false };
  const english = await compose(
    { ...source, skipMessagesWithLinks: true, attachSource: false },
    destination,
    "Gold rose 2.5% https://example.com",
  );
  const arabic = await compose({ ...source, attachSource: false }, destination, "ارتفع الذهب بنسبة 2.5%");
  assert.equal(english.text, "Gold rose 2.5%");
  assert.equal(arabic.text, "ارتفع الذهب بنسبة 2.5%");
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
test("video captions remain eligible and media-only plans still send the original video", async () => {
  assert(isVideoDocument({ mimeType: "video/mp4" }));
  assert(isVideoDocument({ mimeType: "application/octet-stream", attributes: [{ className: "DocumentAttributeVideo" }] }));
  assert(!isVideoDocument({ mimeType: "image/jpeg" }));
  assert(acceptsMessage(source, "", true), "a video with an empty caption remains eligible");
  assert.deepEqual(createSendPlan("", "", true, false), [{ method: "sendMedia", text: "" }]);

  const cleaned = removeTextLinks("Gold rose 2.5% https://example.com");
  const destination: Channel = { ...source, id: -2, kind: "destination", username: "@destination", attachSource: false };
  const composed = await compose(
    { ...source, skipMessagesWithLinks: true, attachSource: false },
    destination,
    cleaned.text,
    undefined,
    cleaned.entities,
    false,
  );
  assert.equal(composed.text, "Gold rose 2.5%");
  assert.deepEqual(createSendPlan(composed.text, composed.html, true, true), [
    { method: "sendMedia", text: "Gold rose 2.5%", html: "Gold rose 2.5%" },
  ]);
  const longCaption = createSendPlan("x".repeat(1100), "x".repeat(1100), true, true);
  assert.equal(longCaption[0]?.method, "sendMedia");
  assert.equal(longCaption[0]?.text, "");
  assert.equal(longCaption[1]?.method, "sendMessage");
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
  assert.equal(removeSourceReferences("خبر\nالمصدر: Unit Test\nتفاصيل", [], source.username, source.name).text, "خبر\nتفاصيل");
  const otherAttribution = "خبر\nالمصدر: مصدر إخباري آخر\nتفاصيل";
  assert.equal(removeSourceReferences(otherAttribution, [], source.username, source.name).text, otherAttribution);
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
test("hiding a source link preserves unrelated links but ignores legacy source footer settings", async () => {
  const text = "خبر مهم\nالمصدر: https://t.me/unit_test/123 | المرسل: https://t.me/mz05999\nتابعونا";
  const cleaned = removeSourceReferences(text, [], source.username, source.name);
  assert.equal(cleaned.text, "خبر مهم\nالمرسل: https://t.me/mz05999\nتابعونا");

  const destination: Channel = {
    ...source, id: -2, kind: "destination", username: "@destination",
    attachSource: false, signatureEnabled: true, suffix: "رابطنا https://t.me/official",
  };
  const composed = await compose(
    { ...source, prefix: "بادئة قديمة https://t.me/legacy", suffix: "المصدر: https://t.me/unit_test/123 | المرسل: https://t.me/mz05999" },
    destination,
    "خبر مهم",
    undefined,
    [],
    true,
  );
  assert(!composed.text.includes("https://t.me/mz05999"));
  assert(!composed.text.includes("https://t.me/legacy"));
  assert(!composed.text.includes("https://t.me/unit_test"));
  assert(composed.text.includes("https://t.me/official"));
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
test("per-route link removal keeps adjacent text and suppresses link-only text without dropping media", async () => {
  const destination: Channel = {
    ...source, id: -2, kind: "destination", username: "@destination", attachSource: false,
    signatureEnabled: true, suffix: "روابطنا\nhttps://mz-trading.blogspot.com/",
  };
  const routeSettings = {
    showText: true, showImages: true, showVideos: true, showFiles: true,
    showLinks: false, showMarketPrices: false, showSignature: true,
  };
  const composed = await compose(
    { ...source, attachSource: false },
    destination,
    "للتواصل: https://example.com/contact",
    undefined,
    [],
    false,
    routeSettings,
  );
  assert.equal(composed.text, "للتواصل:\n\nروابطنا");
  const keepLinks = await compose(
    { ...source, attachSource: false },
    destination,
    "للتواصل: https://example.com/contact",
    undefined,
    [],
    false,
    { ...routeSettings, showLinks: true },
  );
  assert.equal(keepLinks.text, "للتواصل: https://example.com/contact\n\nروابطنا\nhttps://mz-trading.blogspot.com/");
  const linkOnly = await compose(
    { ...source, attachSource: false },
    { ...destination, signatureEnabled: false, suffix: "" },
    "https://example.com/contact",
    undefined,
    [],
    false,
    routeSettings,
  );
  assert.equal(linkOnly.text, "");
  assert.deepEqual(createSendPlan(linkOnly.text, linkOnly.html, false, false), []);
  assert.deepEqual(createSendPlan(linkOnly.text, linkOnly.html, true, false), [{ method: "sendMedia", text: "" }]);
});
test("message composition passes through the original source text", async () => {
  const destination: Channel = { ...source, id: -2, kind: "destination", name: "Destination", format: "plain" };
  const composed = await compose({ ...source, attachSource: false }, destination, "Gold price rose 2.5 percent.");
  assert.equal(composed.text, "Gold price rose 2.5 percent.");
  assert.deepEqual(Object.keys(composed).sort(), ["html", "text", "warnings"]);
});
test("legacy saved plans are rebuilt unless a converted partial send needs review", () => {
  assert.equal(savedPlanDisposition("translated", 0), "rebuild");
  assert.equal(savedPlanDisposition("translated", 1), "hold");
  assert.equal(savedPlanDisposition("not_requested", 0), "reuse");
});
test("queued plans refresh old link filtering before any signature URL can be resent", () => {
  assert(savedPlanNeedsLinkRefresh(true, undefined));
  assert(savedPlanNeedsLinkRefresh(true, 1));
  assert(!savedPlanNeedsLinkRefresh(true, 2));
  assert(!savedPlanNeedsLinkRefresh(false, undefined));
});
test("destination signature is appended only when enabled", async () => {
  const destination: Channel = {
    ...source, id: -2, kind: "destination", name: "Destination", username: "@destination",
    attachSource: false, suffix: "للتواصل: @owner", signatureEnabled: true,
  };
  const enabled = await compose({ ...source, attachSource: false }, destination, "محتوى الرسالة");
  assert.equal(enabled.text, "محتوى الرسالة\n\nللتواصل: @owner");
  const disabled = await compose({ ...source, attachSource: false }, { ...destination, signatureEnabled: false }, "محتوى الرسالة");
  assert.equal(disabled.text, "محتوى الرسالة");
});
test("per-route controls can suppress source text and keep prices or signatures only", async () => {
  const noSourceText = {
    showText: false, showImages: false, showVideos: false, showFiles: false,
    showLinks: false, showMarketPrices: false, showSignature: true,
  };
  const destination: Channel = {
    ...source, id: -2, kind: "destination", username: "@destination",
    attachSource: false, signatureEnabled: true, suffix: "تواصل: @owner",
  };
  for (const original of ["Original English source text", "نص عربي أصلي"]) {
    const composed = await compose(
      { ...source, translate: true, attachSource: true },
      destination,
      original,
      undefined,
      [],
      false,
      noSourceText,
    );
    assert.equal(composed.text, "تواصل: @owner");
  }

  const pricesOnly = await compose(
    source,
    { ...destination, marketEnabled: true, signatureEnabled: false, suffix: "" },
    "Must not be sent",
    undefined,
    [],
    false,
    { ...noSourceText, showMarketPrices: true, showSignature: false },
    async () => [
      { symbol: "XAU/USD", price: 4041.7, previousPrice: 4040, direction: "up", provider: "test", updatedAt: new Date().toISOString(), stale: false },
      { symbol: "BTC/USD", price: 80429.7, previousPrice: 80400, direction: "up", provider: "test", updatedAt: new Date().toISOString(), stale: false },
    ],
  );
  assert(pricesOnly.text.includes("XAU/USD"));
  assert(pricesOnly.text.includes("BTC/USD"));
  assert(!pricesOnly.text.includes("Must not be sent"));

  const empty = await compose(source, destination, "Must not be sent", undefined, [], false, {
    ...noSourceText, showSignature: false,
  });
  assert.equal(empty.text, "");
});
test("route media switches allow each Telegram media kind independently", () => {
  const content = normalizeRouteContentSettings({
    showText: false, showImages: true, showVideos: false, showFiles: true,
    showLinks: true, showMarketPrices: false, showSignature: false,
  });
  assert(routeAllowsMedia("photo", content));
  assert(!routeAllowsMedia("video", content));
  assert(routeAllowsMedia("file", content));
  assert(!routeAllowsMedia("none", content));
  assert(!routeAllowsMedia("legacy", normalizeRouteContentSettings({
    showImages: false, showVideos: false, showFiles: false,
  })));
});
test("route exclusions match only a normalized full message on that route", () => {
  const excludedRoute = normalizeRouteContentSettings({ excludedTexts: ["  555 ", "صباح   الخير", "555", ""] });
  const otherRoute = normalizeRouteContentSettings({});
  assert.deepEqual(excludedRoute.excludedTexts, ["555", "صباح الخير"]);
  assert(isRouteMessageExcluded("555", excludedRoute));
  assert(isRouteMessageExcluded(" صباح الخير \n", excludedRoute));
  assert(!isRouteMessageExcluded("صباح الخير يا جماعة", excludedRoute));
  assert(!isRouteMessageExcluded("555", otherRoute));
});
test("link removal preserves destination signature text without its URL", async () => {
  const composed = await compose(
    {
      ...source,
      attachSource: false,
      skipMessagesWithLinks: true,
      prefix: "تابعوني https://t.me/mz05999",
      suffix: "للتواصل https://t.me/mz05999",
    },
    {
      ...source,
      id: -2,
      kind: "destination",
      username: "@destination",
      attachSource: false,
      signatureEnabled: true,
      suffix: "القناة الرسمية https://t.me/mz05999",
    },
    "خبر مهم https://t.me/unit_test/123",
  );
  assert(!composed.text.includes("https://t.me/unit_test/123"));
  assert(!composed.text.includes("https://t.me/mz05999"));
  assert(composed.text.includes("القناة الرسمية"));
  assert(composed.text.includes("خبر مهم"));
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
test("concurrent workers can claim a queued delivery only once", async () => {
  const suffix = `${process.pid}_${Date.now()}`;
  let sourceId: number | undefined;
  let destinationId: number | undefined;
  let messageId: number | undefined;
  let deliveryId: number | undefined;
  try {
    sourceId = (await pool.query(
      "INSERT INTO source_channels(name,username,enabled) VALUES($1,$2,false) RETURNING id",
      [`claim source ${suffix}`, `@mz_claim_src_${suffix}`],
    )).rows[0].id;
    destinationId = (await pool.query(
      "INSERT INTO destination_channels(name,username,enabled) VALUES($1,$2,false) RETURNING id",
      [`claim destination ${suffix}`, `@mz_claim_dst_${suffix}`],
    )).rows[0].id;
    messageId = (await pool.query(
      "INSERT INTO messages(source_id,source_key,telegram_message_id,text) VALUES($1,$2,1,'claim test') RETURNING id",
      [sourceId, `@mz_claim_src_${suffix}`],
    )).rows[0].id;
    deliveryId = (await pool.query(
      `INSERT INTO message_deliveries(message_id,destination_id,destination_key,next_attempt_at)
       VALUES($1,$2,$3,now()+interval '1 day') RETURNING id`,
      [messageId, destinationId, `@mz_claim_dst_${suffix}`],
    )).rows[0].id;

    const results = await Promise.all([claimDelivery(deliveryId), claimDelivery(deliveryId)]);
    assert.equal(results.filter(Boolean).length, 1);
    const state = await pool.query("SELECT status,attempts FROM message_deliveries WHERE id=$1", [deliveryId]);
    assert.deepEqual(state.rows[0], { status: "processing", attempts: 1 });
  } finally {
    if (deliveryId) await pool.query("DELETE FROM message_deliveries WHERE id=$1", [deliveryId]);
    if (messageId) await pool.query("DELETE FROM messages WHERE id=$1", [messageId]);
    if (destinationId) await pool.query("DELETE FROM destination_channels WHERE id=$1", [destinationId]);
    if (sourceId) await pool.query("DELETE FROM source_channels WHERE id=$1", [sourceId]);
  }
});
test("ingest creates deliveries only for selected destinations and ignores duplicate messages", async () => {
  const db = await pool.connect();
  const suffix = `${process.pid}_${Date.now()}`;
  const sourceUsername = `@mz_ingest_${suffix}`;
  const telegramMessageId = Math.floor(Date.now() / 1000);
  let sourceId: number | undefined;
  const destinationIds: number[] = [];
  try {
    sourceId = (await db.query(
      "INSERT INTO source_channels(name,username,enabled) VALUES($1,$2,true) RETURNING id",
      [`ingest source ${suffix}`, sourceUsername],
    )).rows[0].id;
    const destinationUsernames = [
      `@mz_ingest_selected_a_${suffix}`,
      `@mz_ingest_selected_b_${suffix}`,
      `@mz_ingest_unselected_${suffix}`,
    ];
    for (const [index, username] of destinationUsernames.entries()) {
      destinationIds.push((await db.query(
        "INSERT INTO destination_channels(name,username,enabled) VALUES($1,$2,true) RETURNING id",
        [`ingest destination ${index} ${suffix}`, username],
      )).rows[0].id);
    }
    await db.query(
      "INSERT INTO routing_rules(source_id,destination_id) VALUES($1,$2),($1,$3)",
      [sourceId, destinationIds[0], destinationIds[1]],
    );
    const sourceRow = (await db.query("SELECT * FROM source_channels WHERE id=$1", [sourceId])).rows[0];
    const message = {
      id: telegramMessageId,
      message: "A Telegram message for explicitly selected destinations",
      entities: [],
      noforwards: false,
      media: undefined,
    } as unknown as Api.Message;

    await ingest(channelRow(sourceRow, "source"), message);
    await ingest(channelRow(sourceRow, "source"), message);

    const persisted = await db.query(
      `SELECT d.username, count(m.id)::int AS deliveries
       FROM destination_channels d
       LEFT JOIN message_deliveries md ON md.destination_id=d.id
       LEFT JOIN messages m ON m.id=md.message_id
         AND m.source_key=$1 AND m.telegram_message_id=$2
       WHERE d.id=ANY($3::int[])
       GROUP BY d.id,d.username ORDER BY d.username`,
      [sourceUsername, telegramMessageId, destinationIds],
    );
    assert.deepEqual(persisted.rows, [
      { username: destinationUsernames[2], deliveries: 0 },
      { username: destinationUsernames[0], deliveries: 1 },
      { username: destinationUsernames[1], deliveries: 1 },
    ].sort((a, b) => a.username.localeCompare(b.username)));
    const messageCount = await db.query(
      "SELECT count(*)::int AS count FROM messages WHERE source_key=$1 AND telegram_message_id=$2",
      [sourceUsername, telegramMessageId],
    );
    assert.equal(messageCount.rows[0].count, 1);
  } finally {
    await db.query(
      "DELETE FROM messages WHERE source_key=$1 AND telegram_message_id=$2",
      [sourceUsername, telegramMessageId],
    );
    if (sourceId) await db.query("DELETE FROM source_channels WHERE id=$1", [sourceId]);
    if (destinationIds.length) await db.query("DELETE FROM destination_channels WHERE id=ANY($1::int[])", [destinationIds]);
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

    await replaceSourceRouting(sourceId, [-destinationId, -otherDestinationId], [-destinationId], [
      {
        destinationId: -destinationId,
        contentSettings: {
          showText: false, showImages: true, showVideos: false, showFiles: false,
          showLinks: false, showMarketPrices: true, showSignature: true, excludedTexts: ["555", "صباح الخير"],
        },
      },
    ]);
    await replaceSourceRouting(otherSourceId, [-otherDestinationId], []);
    await replaceSourceRouting(sourceId, [-destinationId]);

    const selected = await db.query(
      "SELECT destination_id,hide_source_link,content_settings FROM routing_rules WHERE source_id=$1 ORDER BY destination_id",
      [sourceId],
    );
    const otherSelected = await db.query(
      "SELECT destination_id FROM routing_rules WHERE source_id=$1",
      [otherSourceId],
    );
    assert.deepEqual(selected.rows.map((row) => ({ destinationId: row.destination_id, hideSourceLink: row.hide_source_link, contentSettings: row.content_settings })), [
      {
        destinationId, hideSourceLink: true,
        contentSettings: {
          showText: false, showImages: true, showVideos: false, showFiles: false,
          showLinks: false, showMarketPrices: true, showSignature: true, excludedTexts: ["555", "صباح الخير"],
        },
      },
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
