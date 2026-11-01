import { test } from "node:test";
import assert from "node:assert/strict";
import { decrypt, encrypt } from "../src/lib/auth";
import { recoverTelegramReaderSession } from "../src/lib/telegram-session-recovery";

const secret = "telegram-reader-session-material-that-must-not-leak";
const testSecret = "test-session-secret-that-is-long-enough-for-aes";

test("loads the encrypted saved session and authorizes a fresh reader client", async () => {
  const previousSecret = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = testSecret;
  try {
    const encryptedSession = encrypt(secret);
    let createdSession: string | undefined;
    let connectCount = 0;
    let authorizationChecks = 0;
    let attached = false;
    const state = { status: "not_authorized", detail: "pending", checkedAt: null as string | null };
    const errors: string[] = [];

    const client = await recoverTelegramReaderSession({
      loadEncryptedSession: async () => encryptedSession,
      decryptSession: decrypt,
      createClient: session => {
        createdSession = session;
        return {
          connect: async () => { connectCount++; },
          isUserAuthorized: async () => { authorizationChecks++; return true; },
        };
      },
      attachHandlers: () => { attached = true; },
      state,
      reportError: async message => { errors.push(message); },
    });

    assert(client);
    assert.equal(createdSession, secret);
    assert.equal(connectCount, 1);
    assert.equal(authorizationChecks, 1);
    assert(attached);
    assert.equal(state.status, "connected");
    assert.equal(state.detail, "جلسة MTProto مفوضة ومتصلة");
    assert.equal(errors.length, 0);
    assert(!JSON.stringify({ state, errors }).includes(secret));
    assert(!JSON.stringify({ state, errors }).includes(encryptedSession));
  } finally {
    if (previousSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previousSecret;
  }
});

test("missing saved session reports a safe not-authorized status without creating a client", async () => {
  let createCount = 0;
  const state = { status: "connected", detail: "old state", checkedAt: null as string | null };
  const errors: string[] = [];

  const client = await recoverTelegramReaderSession({
    loadEncryptedSession: async () => "",
    decryptSession: value => value,
    createClient: () => {
      createCount++;
      return { connect: async () => {}, isUserAuthorized: async () => true };
    },
    attachHandlers: () => assert.fail("no client should be attached"),
    state,
    reportError: async message => { errors.push(message); },
  });

  assert.equal(client, undefined);
  assert.equal(createCount, 0);
  assert.equal(state.status, "not_authorized");
  assert.equal(state.detail, "يلزم تفويض جلسة MTProto لقراءة المصادر العامة");
  assert.equal(errors.length, 0);
});

test("a saved-session database read failure is safe and a later retry restores the reader", async () => {
  const previousSecret = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = testSecret;
  try {
    const plaintextSession = secret;
    const encryptedSession = encrypt(plaintextSession);
    const privateDatabaseError = `database read failed: ${plaintextSession} ${encryptedSession}`;
    const state = { status: "connected", detail: "old state", checkedAt: null as string | null };
    const errors: string[] = [];
    let loadCount = 0;
    let createCount = 0;
    let createdSession: string | undefined;
    let authorized = false;
    let attached = false;

    const recover = () => recoverTelegramReaderSession({
      loadEncryptedSession: async () => {
        loadCount++;
        if (loadCount === 1) throw new Error(privateDatabaseError);
        return encryptedSession;
      },
      decryptSession: decrypt,
      createClient: session => {
        createCount++;
        createdSession = session;
        return {
          connect: async () => {},
          isUserAuthorized: async () => {
            authorized = true;
            return true;
          },
        };
      },
      attachHandlers: () => { attached = true; },
      state,
      reportError: async message => { errors.push(message); },
    });

    const failedClient = await recover();
    assert.equal(failedClient, undefined);
    assert.equal(state.status, "disconnected");
    assert.match(state.detail, /تعذر تحميل جلسة Telegram/);
    assert.deepEqual(errors, [state.detail]);
    assert.equal(createCount, 0);

    const recoveredClient = await recover();
    assert(recoveredClient);
    assert.equal(state.status, "connected");
    assert.equal(state.detail, "جلسة MTProto مفوضة ومتصلة");
    assert.equal(createdSession, plaintextSession);
    assert.equal(authorized, true);
    assert.equal(attached, true);
    assert.equal(loadCount, 2);
    assert.equal(createCount, 1);

    const output = JSON.stringify({ state, errors });
    assert(!output.includes(plaintextSession));
    assert(!output.includes(encryptedSession));
    assert(!output.includes(privateDatabaseError));
  } finally {
    if (previousSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previousSecret;
  }
});

test("unusable saved sessions request QR reauthorization without exposing session data", async () => {
  const previousSecret = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = testSecret;
  try {
    const plaintextSession = secret;
    const encryptedSession = encrypt(plaintextSession);
    const tamperedSession = `${encryptedSession.slice(0, -4)}AAAA`;
    const state = { status: "connected", detail: "old state", checkedAt: null as string | null };
    const errors: string[] = [];

    const invalidClient = await recoverTelegramReaderSession({
      loadEncryptedSession: async () => tamperedSession,
      decryptSession: decrypt,
      createClient: () => assert.fail("invalid ciphertext must not create a client"),
      attachHandlers: () => assert.fail("invalid ciphertext must not attach a client"),
      state,
      reportError: async message => { errors.push(message); },
    });

    assert.equal(invalidClient, undefined);
    assert.equal(state.status, "reauthorization_required");
    assert.equal(state.detail, "جلسة Telegram المحفوظة غير قابلة للاستخدام؛ أعد تفويض الحساب عبر رمز QR");
    assert.deepEqual(errors, [state.detail]);
    const output = JSON.stringify({ state, errors });
    assert(!output.includes(plaintextSession));
    assert(!output.includes(encryptedSession));
  } finally {
    if (previousSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previousSecret;
  }
});

test("temporary Telegram connection failures stay distinct from reauthorization and hide session data", async () => {
  const previousSecret = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = testSecret;
  try {
    const plaintextSession = secret;
    const encryptedSession = encrypt(plaintextSession);
    const state = { status: "connected", detail: "old state", checkedAt: null as string | null };
    const errors: string[] = [];
    let disconnected = 0;

    const failedClient = await recoverTelegramReaderSession({
      loadEncryptedSession: async () => encryptedSession,
      decryptSession: decrypt,
      createClient: () => ({
        connect: async () => { throw new Error(`Telegram error included ${plaintextSession}`); },
        isUserAuthorized: async () => true,
        disconnect: async () => { disconnected++; },
      }),
      attachHandlers: () => assert.fail("failed client must not attach"),
      state,
      reportError: async message => { errors.push(message); },
    });

    assert.equal(failedClient, undefined);
    assert.equal(disconnected, 1);
    assert.equal(state.status, "disconnected");
    assert.match(state.detail, /مؤقتاً/);
    assert.deepEqual(errors, [state.detail]);
    const output = JSON.stringify({ state, errors });
    assert(!output.includes(plaintextSession));
    assert(!output.includes(encryptedSession));
  } finally {
    if (previousSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previousSecret;
  }
});

test("client configuration failures are not reported as temporary network failures", async () => {
  const previousSecret = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = testSecret;
  try {
    const state = { status: "connected", detail: "old state", checkedAt: null as string | null };
    const errors: string[] = [];

    const client = await recoverTelegramReaderSession({
      loadEncryptedSession: async () => encrypt(secret),
      decryptSession: decrypt,
      createClient: () => { throw new Error("private configuration detail"); },
      attachHandlers: () => assert.fail("an unconfigured client must not attach"),
      state,
      reportError: async message => { errors.push(message); },
    });

    assert.equal(client, undefined);
    assert.equal(state.status, "error");
    assert.match(state.detail, /إعداد الخدمة/);
    assert.deepEqual(errors, [state.detail]);
    assert(!JSON.stringify({ state, errors }).includes("private configuration detail"));
    assert(!JSON.stringify({ state, errors }).includes(secret));
  } finally {
    if (previousSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previousSecret;
  }
});
