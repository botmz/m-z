import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import pino from "pino";
import { Writable } from "node:stream";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { OneTimeSecretGate } from "../src/lib/one-time-secret-gate";
import { decrypt, encrypt } from "../src/lib/auth";
import { createHttpLogger } from "../src/lib/http-logger";
import { signInWithQrCode } from "../src/lib/telegram-qr-sign-in";

const credentials = { apiId: 123456, apiHash: "opaque-api-hash" };

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

async function waitForPasswordPrompt(gate: OneTimeSecretGate) {
  for (let attempt = 0; attempt < 50 && !gate.isWaiting; attempt++) {
    await new Promise<void>(resolve => setImmediate(resolve));
  }
  assert.equal(gate.isWaiting, true, "Teleproto should be waiting for a password");
}

function makeClient(signIn: (callbacks: any) => Promise<void>) {
  return {
    session: { save: () => "mock-telegram-session" },
    // This has the same callback contract as Teleproto's signInUserWithQrCode.
    signInUserWithQrCode: async (_credentials: typeof credentials, callbacks: any) => signIn(callbacks),
  } as any;
}

function makeFlow(gate: OneTimeSecretGate, client: any, abortSignal = new AbortController().signal) {
  const qrState = { status: "connecting", message: "", url: null as string | null, expiresAt: null as string | null };
  const persisted: string[] = [];
  const auditEntries: string[] = [];
  const flow = signInWithQrCode({
    client,
    credentials,
    abortSignal,
    passwordGate: gate,
    qrState,
    isCurrent: () => true,
    persistEncryptedSession: async session => { persisted.push(encrypt(session)); },
    auditAuthorization: async () => { auditEntries.push("تم تفويض جلسة Telegram وحفظها مشفرة في الخادم"); },
  });
  return { flow, qrState, persisted, auditEntries };
}

test("Teleproto asks again after PASSWORD_HASH_INVALID and only persists an encrypted session after login succeeds", async () => {
  const previousSecret = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "test-session-secret-that-is-long-enough";
  try {
    const gate = new OneTimeSecretGate();
    const accepted = deferred();
    const finishSignIn = deferred();
    const client = makeClient(async callbacks => {
      for (;;) {
        const password = await callbacks.password();
        if (password === "correct-2fa-password") {
          accepted.resolve();
          await finishSignIn.promise;
          return;
        }
        const stop = await callbacks.onError(Object.assign(new Error("invalid password"), { errorMessage: "PASSWORD_HASH_INVALID" }));
        if (stop) throw new Error("Telegram rejected authorization");
      }
    });
    const { flow, qrState, persisted, auditEntries } = makeFlow(gate, client);

    await waitForPasswordPrompt(gate);
    assert.equal(gate.submit("wrong-2fa-password"), true);
    await waitForPasswordPrompt(gate);
    assert.equal(qrState.status, "needs_2fa");
    assert.match(qrState.message, /كلمة المرور غير صحيحة/);

    assert.equal(gate.submit("correct-2fa-password"), true);
    await accepted.promise;
    assert.equal(persisted.length, 0, "do not save while Teleproto is still completing sign-in");
    finishSignIn.resolve();
    await flow;

    assert.equal(persisted.length, 1);
    assert.equal(decrypt(persisted[0]!), "mock-telegram-session");
    assert.deepEqual(auditEntries, ["تم تفويض جلسة Telegram وحفظها مشفرة في الخادم"]);
    assert(!JSON.stringify({ persisted, auditEntries }).includes("correct-2fa-password"));
    assert.equal(gate.isWaiting, false);
  } finally {
    if (previousSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previousSecret;
  }
});

test("five incorrect 2FA attempts stop sign-in and clear the pending password", async () => {
  const gate = new OneTimeSecretGate();
  const client = makeClient(async callbacks => {
    for (;;) {
      const password = await callbacks.password();
      assert.match(password, /^wrong-password-/);
      const stop = await callbacks.onError(Object.assign(new Error("invalid password"), { errorMessage: "PASSWORD_HASH_INVALID" }));
      if (stop) throw new Error(`Telegram rejected authorization for ${password}`);
    }
  });
  const { flow, qrState, persisted, auditEntries } = makeFlow(gate, client);

  for (let attempt = 1; attempt <= 5; attempt++) {
    await waitForPasswordPrompt(gate);
    assert.equal(gate.submit(`wrong-password-${attempt}`), true);
  }

  await assert.rejects(flow, error => {
    assert.match(error.message, /تعذر إتمام التحقق بخطوتين/);
    assert(!error.message.includes("wrong-password-5"));
    return true;
  });
  assert.equal(qrState.status, "error");
  assert.match(qrState.message, /بعد عدة محاولات/);
  assert.equal(gate.isWaiting, false);
  assert.equal(gate.submit("late-password"), false);
  assert.deepEqual(persisted, []);
  assert.deepEqual(auditEntries, []);
});

test("aborting while waiting for 2FA cancels the gate without persisting or auditing", async () => {
  const gate = new OneTimeSecretGate();
  const abort = new AbortController();
  const client = makeClient(async callbacks => { await callbacks.password(); });
  const { flow, persisted, auditEntries } = makeFlow(gate, client, abort.signal);

  await waitForPasswordPrompt(gate);
  abort.abort();
  await assert.rejects(flow, /انتهت مهلة التحقق/);
  assert.equal(gate.isWaiting, false);
  assert.equal(gate.submit("late-password"), false);
  assert.deepEqual(persisted, []);
  assert.deepEqual(auditEntries, []);
});

test("the production HTTP request logger never records a submitted 2FA password", async () => {
  const password = "http-log-must-not-contain-this-password";
  const output: string[] = [];
  const destination = new Writable({
    write(chunk, _encoding, callback) {
      output.push(chunk.toString());
      callback();
    },
  });
  const requestLogger = pino({ level: "info" }, destination);
  const app = express();
  app.use(createHttpLogger(requestLogger));
  app.use(express.json());
  app.post("/telegram/qr/2fa", (_req, res) => { res.json({ status: "confirming" }); });

  const server = app.listen(0);
  await once(server, "listening");
  try {
    const { port } = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}/telegram/qr/2fa`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    assert.equal(response.status, 200);
    await response.arrayBuffer();
  } finally {
    server.close();
    await once(server, "close");
  }

  assert(output.length > 0, "the HTTP logger should have emitted a request record");
  assert(!output.join("").includes(password));
});
