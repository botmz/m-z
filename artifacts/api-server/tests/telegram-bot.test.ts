import { test } from "node:test";
import assert from "node:assert/strict";
import { TelegramApiError, destinationTestErrorMessage, testDestination } from "../src/lib/telegram-bot";

const destinationId = -42;
const username = "@example_channel";

function destinationTest(member: { status: string; can_post_messages?: boolean }, options: {
  getChatError?: Error;
  getChatMemberError?: Error;
} = {}, send = false) {
  const calls: Array<{ method: string; body: Record<string, unknown> }> = [];
  const updates: Array<{ id: number; status: "ready" | "error"; lastError: string | null }> = [];
  const audits: Array<{ level: string; category: string; message: string }> = [];
  const result = testDestination(destinationId, username, send, {
    api: async (method, body = {}) => {
      calls.push({ method, body });
      if (method === "getMe") return { id: 123, username: "mz_test_bot" };
      if (method === "getChat") {
        if (options.getChatError) throw options.getChatError;
        return { id: -100123, type: "channel" };
      }
      if (method === "getChatMember") {
        if (options.getChatMemberError) throw options.getChatMemberError;
        return member;
      }
      throw new Error(`Unexpected Bot API method: ${method}`);
    },
    updateDestination: async (id, status, lastError) => {
      updates.push({ id, status, lastError });
    },
    audit: async (level, category, message) => {
      audits.push({ level, category, message });
    },
  });
  return { result, calls, updates, audits };
}

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

test("destination check accepts a channel owner without sending a message", async () => {
  const { result, calls, updates } = destinationTest({ status: "creator" });

  assert.deepEqual(await result, { ok: true, message: "تم التحقق من صلاحية نشر البوت دون إرسال أي رسالة" });
  assert.deepEqual(calls.map(({ method }) => method), ["getMe", "getChat", "getChatMember"]);
  assert.deepEqual(calls[1], { method: "getChat", body: { chat_id: username } });
  assert.deepEqual(calls[2], {
    method: "getChatMember",
    body: { chat_id: -100123, user_id: 123 },
  });
  assert.deepEqual(updates, [{ id: 42, status: "ready", lastError: null }]);
});

test("a legacy request to send a destination test still never publishes a message", async () => {
  const { result, calls } = destinationTest({ status: "creator" }, {}, true);

  assert.deepEqual(await result, {
    ok: true,
    message: "تم التحقق من صلاحية نشر البوت دون إرسال أي رسالة",
  });
  assert.deepEqual(calls.map(({ method }) => method), ["getMe", "getChat", "getChatMember"]);
  assert(!calls.some(({ method }) => method.startsWith("send")));
});

test("mocked destination check needs no BOT_TOKEN and never contacts Telegram", async () => {
  const previousToken = process.env.BOT_TOKEN;
  const previousFetch = globalThis.fetch;
  delete process.env.BOT_TOKEN;
  globalThis.fetch = async () => {
    throw new Error("Unexpected Telegram network request");
  };

  try {
    const { result, calls } = destinationTest({ status: "creator" });
    assert.equal((await result).ok, true);
    assert.deepEqual(calls.map(({ method }) => method), ["getMe", "getChat", "getChatMember"]);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousToken === undefined) delete process.env.BOT_TOKEN;
    else process.env.BOT_TOKEN = previousToken;
  }
});

test("destination check accepts an administrator who can post", async () => {
  const { result, calls, updates } = destinationTest({
    status: "administrator",
    can_post_messages: true,
  });

  assert.equal((await result).ok, true);
  assert.deepEqual(calls.map(({ method }) => method), ["getMe", "getChat", "getChatMember"]);
  assert.deepEqual(updates, [{ id: 42, status: "ready", lastError: null }]);
});

test("destination check rejects an administrator without posting permission", async () => {
  const { result, calls, updates } = destinationTest({
    status: "administrator",
    can_post_messages: false,
  });

  assert.deepEqual(await result, {
    ok: false,
    message: "أضف البوت مشرفاً للقناة مع صلاحية نشر الرسائل",
  });
  assert.deepEqual(calls.map(({ method }) => method), ["getMe", "getChat", "getChatMember"]);
  assert.equal(updates[0]?.status, "error");
});

test("destination check rejects a regular member without posting rights", async () => {
  const { result, calls, updates } = destinationTest({ status: "member" });

  assert.deepEqual(await result, {
    ok: false,
    message: "أضف البوت مشرفاً للقناة مع صلاحية نشر الرسائل",
  });
  assert.deepEqual(calls.map(({ method }) => method), ["getMe", "getChat", "getChatMember"]);
  assert.equal(updates[0]?.status, "error");
});

test("missing channels return guidance without checking membership or sending", async () => {
  const { result, calls, updates } = destinationTest({ status: "creator" }, {
    getChatError: new TelegramApiError("Bad Request: chat not found", 400),
  });

  assert.deepEqual(await result, {
    ok: false,
    message: "لم يعثر Telegram على الوجهة. تحقق من اسم المستخدم، وأن القناة عامة وأن البوت مضاف إليها.",
  });
  assert.deepEqual(calls.map(({ method }) => method), ["getMe", "getChat"]);
  assert.equal(updates[0]?.status, "error");
});

test("inaccessible member lists return guidance without sending", async () => {
  const { result, calls, updates } = destinationTest({ status: "creator" }, {
    getChatMemberError: new TelegramApiError("Bad Request: member list is inaccessible", 400),
  });

  assert.deepEqual(await result, {
    ok: false,
    message: "تعذّر على Telegram التحقق من عضوية البوت. أضفه إلى القناة كمشرف مع صلاحية نشر الرسائل، ثم أعد الفحص.",
  });
  assert.deepEqual(calls.map(({ method }) => method), ["getMe", "getChat", "getChatMember"]);
  assert.equal(updates[0]?.status, "error");
});
