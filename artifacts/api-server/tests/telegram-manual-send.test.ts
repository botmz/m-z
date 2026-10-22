import { test } from "node:test";
import assert from "node:assert/strict";
import { manualSendParts, PartialManualSendError, sendManualMessage } from "../src/lib/telegram-manual-send";

test("manual send uses destination HTML formatting when the composed message fits one Telegram message", async () => {
  const requests: Record<string, unknown>[] = [];
  const sent = await sendManualMessage(
    "@destination",
    "النص النهائي",
    "<b>النص النهائي</b>",
    "html",
    async body => { requests.push(body); return {}; },
  );

  assert.equal(sent, 1);
  assert.deepEqual(requests, [{
    chat_id: "@destination",
    text: "<b>النص النهائي</b>",
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
  }]);
});

test("long manual messages split safely and fall back to plain text", () => {
  const text = "a".repeat(3999) + "🚀" + "\n" + "b".repeat(4001);
  const parts = manualSendParts(text, "<b>not used</b>", "html");

  assert(parts.length > 1);
  assert.equal(parts.map(part => part.text).join(""), text);
  assert(parts.every(part => part.text.length <= 4000));
  assert(parts.every(part => part.parse_mode === undefined));
  assert(parts.every(part => part.link_preview_options.is_disabled));
});

test("manual send stops after a partial failure and reports how many parts were sent", async () => {
  const requests: Record<string, unknown>[] = [];

  await assert.rejects(
    sendManualMessage("@destination", "a".repeat(8001), "ignored", "html", async body => {
      requests.push(body);
      if (requests.length === 2) throw new Error("Telegram unavailable");
      return {};
    }),
    error => {
      assert(error instanceof PartialManualSendError);
      assert.match(error.message, /تم إرسال 1 من 3 أجزاء فقط/);
      assert.match(error.message, /تحقّق من القناة/);
      return true;
    },
  );

  assert.equal(requests.length, 2, "do not retry or send remaining parts after failure");
});
