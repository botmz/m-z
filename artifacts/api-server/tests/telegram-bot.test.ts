import { test } from "node:test";
import assert from "node:assert/strict";
import { TelegramApiError, destinationTestErrorMessage } from "../src/lib/telegram-bot";

test("inaccessible Telegram channel member list explains how to grant the bot posting access", () => {
  const error = new TelegramApiError("Bad Request: member list is inaccessible", 400);
  assert.equal(
    destinationTestErrorMessage(error),
    "تعذر التحقق من صلاحيات البوت في القناة. أضف البوت مشرفاً مع صلاحية نشر الرسائل، ثم أعد الفحص.",
  );
});

test("unrelated Telegram destination test errors retain their sanitized details", () => {
  const error = new TelegramApiError("Bad Request: chat not found", 400);
  assert.equal(destinationTestErrorMessage(error), "Bad Request: chat not found");
});
