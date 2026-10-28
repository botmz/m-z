import { test, after } from "node:test";
import assert from "node:assert/strict";
import {
  GEMINI_FREE_MODEL, GEMINI_FREE_MODELS, geminiHttpError, protectTokens, requestGeminiTranslation,
  requestOpenAITranslation, restoreTokens, translationServiceState, translate, isEnglishText, validateTranslation, needsTranslation,
} from "../src/lib/translation";
import { acceptsMessage, containsLink, sourceLink, splitText, originalHtml, escapeHtml, marketPriceLine, compose, createSendPlan } from "../src/lib/composition";
import { removeSourceReferences, removeTextLinks } from "../src/lib/source-reference";
import { direction } from "../src/lib/market";
import { channelRow, normalizeUsername, sameTelegramUsername, pool, getSetting, setSetting, settings, type Channel } from "../src/lib/store";
import { CreateChannelBody, SaveChannelRoutingBody } from "@workspace/api-zod";
import { replaceSourceRouting } from "../src/lib/routing";
import { isVideoDocument } from "../src/lib/telegram-reader";

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
test("common uppercase trading words stay translatable while tickers remain protected", () => {
  const { masked, tokens } = protectTokens("BUY BTC/USD");
  assert(masked.startsWith("BUY "));
  assert(!masked.includes("BTC/USD"));
  assert.equal(restoreTokens(masked, tokens), "BUY BTC/USD");
});
test("rejects translation that removes an immutable token", () => {
  const { masked, tokens } = protectTokens("BTC 4250");
  assert.throws(() => restoreTokens(masked.replace("⟦MZ0⟧", ""), tokens));
});
test("rejects translation that duplicates an immutable token", () => {
  const { masked, tokens } = protectTokens("BTC 4250");
  assert.throws(() => restoreTokens(masked + "⟦MZ0⟧", tokens));
});
test("translation quality check accepts Arabic output and rejects unchanged or wrong-language text", () => {
  validateTranslation("Gold price rose 2.5 percent.", "ارتفع سعر الذهب 2.5 بالمئة.", "ar");
  assert.throws(
    () => validateTranslation("Gold prices rose today.", "Gold prices rose today.", "en"),
    /لم يؤكد الفحص/,
  );
  assert.throws(
    () => validateTranslation("Gold prices rose today.", "Gold prices rose today, 2.5%.", "ar"),
    /اللغة المستهدفة/,
  );
});
test("Gemini free translation uses the fixed model and keeps its API key out of the URL", async () => {
  let requestUrl = "";
  let requestOptions: RequestInit | undefined;
  const translated = await requestGeminiTranslation(
    "⟦MZ0⟧ hello",
    "Arabic",
    "test-secret",
    GEMINI_FREE_MODEL,
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
    requestGeminiTranslation("hello", "ar", "test-secret", GEMINI_FREE_MODEL, async () => new Response(
      JSON.stringify({ error: { message: "provider response detail" } }),
      { status: 429 },
    )),
    (error: unknown) => {
      assert(error instanceof Error);
      assert.match(error.message, /حدود الاستخدام/);
      assert(!error.message.includes("provider response detail"));
      assert(!error.message.includes("test-secret"));
      return true;
    },
  );
});
test("Gemini free model choices are current and quota failures differ from request-rate limits", () => {
  assert.deepEqual(GEMINI_FREE_MODELS, ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"]);
  assert.match(geminiHttpError(429, "per day free tier quota"), /حصة Gemini المجانية/);
  assert.match(geminiHttpError(429, "requests per minute RPM"), /حد سرعة/);
  assert.match(geminiHttpError(404), /غير متاح/);
  assert.match(geminiHttpError(400, "API key not valid. Please pass a valid API key."), /GEMINI_API_KEY غير صالح/);
  assert.match(geminiHttpError(400, "invalid request payload"), /صيغة الطلب/);
  assert.match(geminiHttpError(403), /GEMINI_API_KEY/);
});
test("translation service is connected only after a successful matching live test", () => {
  const valid = {
    provider: "gemini" as const, model: GEMINI_FREE_MODEL, ok: true,
    message: "نجح اختبار ترجمة حقيقي إلى العربية.", checkedAt: "2026-10-28T08:00:00.000Z",
  };
  assert.equal(translationServiceState("gemini", GEMINI_FREE_MODEL, null, false).status, "unverified");
  assert.equal(translationServiceState("gemini", GEMINI_FREE_MODEL, { ...valid, ok: false }, false).status, "error");
  assert.equal(translationServiceState("gemini", "gemini-3.1-flash-lite", valid, false).status, "unverified");
  assert.equal(translationServiceState("gemini", GEMINI_FREE_MODEL, valid, false).status, "connected");
  assert.equal(translationServiceState("gemini", GEMINI_FREE_MODEL, valid, true).status, "error");
});
test("OpenAI API translation keeps its key in the header and does not retry", async () => {
  let requestUrl = "";
  let requestOptions: RequestInit | undefined;
  let calls = 0;
  const translated = await requestOpenAITranslation(
    "⟦MZ0⟧ hello",
    "Arabic",
    "test-secret",
    "gpt-5-mini",
    async (input, init) => {
      calls++;
      requestUrl = String(input);
      requestOptions = init;
      return new Response(JSON.stringify({ choices: [{ message: { content: "⟦MZ0⟧ مرحباً" } }] }), { status: 200 });
    },
  );
  assert.equal(translated, "⟦MZ0⟧ مرحباً");
  assert.equal(requestUrl, "https://api.openai.com/v1/chat/completions");
  assert.equal(calls, 1);
  const headers = new Headers(requestOptions?.headers);
  assert.equal(headers.get("authorization"), "Bearer test-secret");
  const body = JSON.parse(String(requestOptions?.body));
  assert.equal(body.model, "gpt-5-mini");
  assert.equal(body.generationConfig, undefined);
  assert.equal(body.max_completion_tokens, 8192);
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
test("source link-removal option keeps linked messages instead of skipping them", () => {
  const sourceWithLinkFilter = { ...source, skipMessagesWithLinks: true };
  assert(containsLink("Read https://example.com/report"));
  assert(containsLink("Open the link", [{ className: "MessageEntityTextUrl", url: "https://example.com" }]));
  assert(containsLink("example.com", [{ className: "MessageEntityUrl" }]));
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
  assert.equal(removeTextLinks("https://only.example").text, "");
  assert(acceptsMessage(source, "", true), "media remains eligible when URL removal empties its caption");
  assert(!acceptsMessage(source, "", false), "an empty text-only post has no sendable content");
  assert(acceptsMessage({ ...source, filter: "recommendations" }, "", true), "an empty link-stripped caption must not suppress attached media");
});
test("translation detects target-language text, translates other languages, and ignores ticker-only posts", async () => {
  assert(isEnglishText("The price of gold rose sharply today."));
  assert(isEnglishText("BUY BTC"));
  assert(!isEnglishText("هذا نص عربي للاختبار"));
  assert(!isEnglishText("El precio del oro subió esta mañana"));
  assert(!isEnglishText("BTC/USD 90,000"));
  assert(needsTranslation("El precio del oro subió esta mañana", "ar"));
  assert(!needsTranslation("هذا نص عربي للاختبار", "ar"));
  assert(!needsTranslation("BTC/USD 90,000", "ar"));
  let calls = 0;
  const translator = async (text: string) => {
    calls++;
    return { text: `ترجمة: ${text}`, status: "translated" };
  };
  const destination: Channel = { ...source, id: -2, kind: "destination", username: "@destination", attachSource: false };
  const english = await compose(
    { ...source, translate: true, skipMessagesWithLinks: true, attachSource: false },
    destination,
    "Gold rose 2.5% https://example.com",
    undefined,
    [],
    false,
    translator,
  );
  const arabic = await compose(
    { ...source, translate: true, attachSource: false },
    destination,
    "ارتفع الذهب بنسبة 2.5%",
    undefined,
    [],
    false,
    translator,
  );
  const spanish = await compose(
    { ...source, translate: true, attachSource: false },
    destination,
    "El precio del oro subió",
    undefined,
    [],
    false,
    translator,
  );
  assert.equal(english.text, "ترجمة: Gold rose 2.5%");
  assert.equal(arabic.text, "ارتفع الذهب بنسبة 2.5%");
  assert.equal(spanish.text, "ترجمة: El precio del oro subió");
  assert.equal(calls, 2);
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
    { ...source, translate: true, skipMessagesWithLinks: true, attachSource: false },
    destination,
    cleaned.text,
    undefined,
    cleaned.entities,
    false,
    async () => ({ text: "ارتفع الذهب 2.5%", status: "translated" }),
  );
  assert.equal(composed.text, "ارتفع الذهب 2.5%");
  assert.deepEqual(createSendPlan(composed.text, composed.html, true, true), [
    { method: "sendMedia", text: "ارتفع الذهب 2.5%", html: "ارتفع الذهب 2.5%" },
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
test("hiding a source link preserves the sender link in the same footer line", async () => {
  const text = "خبر مهم\nالمصدر: https://t.me/unit_test/123 | المرسل: https://t.me/mz05999\nتابعونا";
  const cleaned = removeSourceReferences(text, [], source.username, source.name);
  assert.equal(cleaned.text, "خبر مهم\nالمرسل: https://t.me/mz05999\nتابعونا");

  const destination: Channel = { ...source, id: -2, kind: "destination", username: "@destination", attachSource: false };
  const composed = await compose(
    { ...source, suffix: "المصدر: https://t.me/unit_test/123 | المرسل: https://t.me/mz05999" },
    destination,
    "خبر مهم",
    undefined,
    [],
    true,
  );
  assert(composed.text.includes("https://t.me/mz05999"));
  assert(!composed.text.includes("https://t.me/unit_test"));
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
test("a successful provider translation is the body sent by message composition", async () => {
  const destination: Channel = { ...source, id: -2, kind: "destination", name: "Destination", format: "plain" };
  const translated = await compose(
    { ...source, translate: true, attachSource: false },
    destination,
    "Gold price rose 2.5 percent.",
    undefined,
    [],
    false,
    async () => ({ text: "ارتفع سعر الذهب 2.5 بالمئة.", status: "translated" }),
  );
  assert.equal(translated.text, "ارتفع سعر الذهب 2.5 بالمئة.");
  assert.equal(translated.translationStatus, "translated");
});
test("source-message fan-out reuses a translated body and does not quickly repeat a failed request", async () => {
  const previousSettings = await settings();
  const previousTest = await getSetting<{
    provider: "gemini" | "openai" | "replit" | "deepl";
    model: string;
    ok: boolean;
    message: string;
    checkedAt: string;
  } | null>("translation_test", null);
  const sourceKey = `@translation_cache_${Date.now()}`;
  const inserted = await pool.query(`INSERT INTO messages(source_id,source_key,telegram_message_id,text)
    VALUES(NULL,$1,1,'gold price'),(NULL,$1,2,'gold price'),(NULL,$1,3,'Gold prices rose today.')
    RETURNING id`, [sourceKey]);
  const successfulMessageId = inserted.rows[0].id as number;
  const failedMessageId = inserted.rows[1].id as number;
  const rejectedMessageId = inserted.rows[2].id as number;
  const model = GEMINI_FREE_MODEL;
  await setSetting("settings", { ...previousSettings, translationProvider: "gemini", translationModel: model });
  await setSetting("translation_test", {
    provider: "gemini", model, ok: true, message: "نجح اختبار ترجمة حقيقي.", checkedAt: new Date().toISOString(),
  });

  try {
    let successfulCalls = 0;
    const successfulTranslator = async () => {
      successfulCalls++;
      return "ارتفع سعر الذهب.";
    };
    const translatedOnce = await translate("gold price", { ...source, translate: true }, successfulMessageId, successfulTranslator);
    const reused = await translate("gold price", { ...source, translate: true }, successfulMessageId, successfulTranslator);
    assert.equal(translatedOnce.status, "translated");
    assert.equal(reused.text, "ارتفع سعر الذهب.");
    assert.equal(successfulCalls, 1);
    await translate("gold price without source link", { ...source, translate: true }, successfulMessageId, successfulTranslator);
    assert.equal(successfulCalls, 2, "route-specific cleaned text must not reuse a different input's translation");

    let failedCalls = 0;
    const failingTranslator = async () => {
      failedCalls++;
      throw new Error("تم تجاوز حد الطلبات");
    };
    const allowOriginal = { ...source, translate: true, translationFailure: "original" as const };
    await assert.rejects(
      translate("another message", allowOriginal, failedMessageId, failingTranslator),
      (error: unknown) => Boolean(error && typeof error === "object" && "translationHeld" in error),
    );
    await assert.rejects(
      translate("another message", allowOriginal, failedMessageId, failingTranslator),
      (error: unknown) => Boolean(error && typeof error === "object" && "translationHeld" in error),
    );
    assert.equal(failedCalls, 1);
    assert.equal((await getSetting<{ ok: boolean }>("translation_test", { ok: false }))?.ok, true,
      "a single transient message failure must not invalidate the provider's explicit setup test");

    let invalidCalls = 0;
    const unchangedTranslator = async () => {
      invalidCalls++;
      return "Gold prices rose today.";
    };
    await assert.rejects(
      translate("Gold prices rose today.", allowOriginal, rejectedMessageId, unchangedTranslator),
      (error: unknown) => Boolean(error && typeof error === "object" && "translationHeld" in error),
      "an unchanged provider response must be held, even when original fallback is selected",
    );
    await assert.rejects(
      translate("Gold prices rose today.", allowOriginal, rejectedMessageId, unchangedTranslator),
      (error: unknown) => Boolean(error && typeof error === "object" && "translationHeld" in error),
    );
    assert.equal(invalidCalls, 1, "rejected translations are cached and never sent as the source text");

    await setSetting("translation_test", {
      provider: "openai", model: "missing-key-model", ok: false,
      message: "missing key", checkedAt: new Date().toISOString(),
    });
    let unverifiedCalls = 0;
    await assert.rejects(
      translate("gold price", allowOriginal, undefined, async () => {
        unverifiedCalls++;
        return "ارتفع سعر الذهب.";
      }),
      (error: unknown) => Boolean(error && typeof error === "object" && "translationHeld" in error),
    );
    assert.equal(unverifiedCalls, 0, "do not send any text until the configured provider and model pass a live test");
  } finally {
    await pool.query("DELETE FROM messages WHERE source_key=$1", [sourceKey]);
    await setSetting("settings", previousSettings);
    if (previousTest) await setSetting("translation_test", previousTest);
    else await pool.query("DELETE FROM app_settings WHERE key='translation_test'");
  }
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
