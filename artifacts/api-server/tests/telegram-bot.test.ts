import { test } from "node:test";
import assert from "node:assert/strict";
import { TelegramApiError, destinationTestErrorMessage } from "../src/lib/telegram-bot";

test("inaccessible Telegram channel member list explains how to grant the bot posting access", () => {
  const error = new TelegramApiError("Bad Request: member list is inaccessible", 400);
  assert.equal(
    destinationTestErrorMessage(error),
    "تعذّر على Telegram التحقق من عضوية البوت. أضفه إلى القناة كمشرف مع صلاحية نشر الرسائل، ثم أعد الفحص.",
  );
});

test("missing Telegram destinations return actionable Arabic guidance", () => {
  const error = new TelegramApiError("Bad Request: chat not found", 400);
  assert.equal(
    destinationTestErrorMessage(error),
    "لم يعثر Telegram على الوجهة. تحقق من اسم المستخدم، وأن القناة عامة وأن البوت مضاف إليها.",
  );
});

test("permission errors explain how to restore publishing rights", () => {
  const error = new TelegramApiError("Bad Request: not enough rights to send text messages", 400);
  assert.equal(
    destinationTestErrorMessage(error),
    "البوت لا يملك صلاحية النشر في هذه القناة. أضفه كمشرف وفعّل صلاحية نشر الرسائل.",
  );
});
