import { test } from "node:test";
import assert from "node:assert/strict";
import { recoverTelegramReaderSession } from "../src/lib/telegram-session-recovery";
import { control } from "../src/lib/worker";
import { readerState } from "../src/lib/telegram-reader";

function recoveryDependencies(authorized: boolean, events: string[]) {
  return {
    connectReader: async () => {
      events.push("restore");
      await recoverTelegramReaderSession({
        loadEncryptedSession: async () => "saved-encrypted-session",
        decryptSession: encrypted => {
          assert.equal(encrypted, "saved-encrypted-session");
          return "saved-session";
        },
        createClient: session => {
          assert.equal(session, "saved-session");
          return {
            connect: async () => { events.push("connect"); },
            isUserAuthorized: async () => {
              events.push("authorize");
              return authorized;
            },
          };
        },
        attachHandlers: () => { events.push("attach"); },
        state: readerState,
        reportError: async () => {},
      });
    },
    readerConnected: () => readerState.status === "connected",
  };
}

test("failed saved-session recovery leaves the current worker running and processing disabled", async () => {
  const events: string[] = [];
  let workerRunning = true;
  let workerEnabled = false;
  Object.assign(readerState, { status: "connected", detail: "previous state", checkedAt: null });

  const result = await control("restart", {
    ...recoveryDependencies(false, events),
    testBot: async () => { events.push("testBot"); return { ok: true, message: "bot connected" }; },
    stopWorker: async () => { events.push("stop"); workerRunning = false; },
    startWorker: () => { events.push("start"); workerRunning = true; },
    setWorkerEnabled: async enabled => { events.push(`enabled:${enabled}`); workerEnabled = enabled; },
    audit: async () => { events.push("audit"); },
    tick: () => { events.push("tick"); },
  });

  assert.equal(result.ok, false);
  assert.equal(readerState.status, "reauthorization_required");
  assert.equal(workerRunning, true);
  assert.equal(workerEnabled, false);
  assert.deepEqual(events, ["testBot", "restore", "connect", "authorize"]);
});

test("successful saved-session recovery follows the normal worker restart sequence", async () => {
  const events: string[] = [];
  let workerRunning = true;
  let workerEnabled = false;
  Object.assign(readerState, { status: "disconnected", detail: "old connection", checkedAt: null });

  const result = await control("restart", {
    ...recoveryDependencies(true, events),
    testBot: async () => { events.push("testBot"); return { ok: true, message: "bot connected" }; },
    stopWorker: async () => { events.push("stop"); workerRunning = false; },
    startWorker: () => { events.push("start"); workerRunning = true; },
    setWorkerEnabled: async enabled => { events.push(`enabled:${enabled}`); workerEnabled = enabled; },
    audit: async () => { events.push("audit"); },
    tick: () => { events.push("tick"); },
  });

  assert.equal(result.ok, true);
  assert.equal(readerState.status, "connected");
  assert.equal(workerRunning, true);
  assert.equal(workerEnabled, true);
  assert.deepEqual(events, [
    "testBot", "restore", "connect", "authorize", "attach",
    "stop", "start", "enabled:true", "audit", "tick",
  ]);
});
