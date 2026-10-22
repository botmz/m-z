import { test } from "node:test";
import assert from "node:assert/strict";
import { OneTimeSecretGate } from "../src/lib/one-time-secret-gate";

test("verification value resolves one waiter once and cannot be replayed", async () => {
  const gate = new OneTimeSecretGate();
  const result = gate.wait();
  assert.equal(gate.isWaiting, true);
  assert.equal(gate.submit("one-time value"), true);
  assert.equal(await result, "one-time value");
  assert.equal(gate.isWaiting, false);
  assert.equal(gate.submit("replay"), false);
});

test("verification gate rejects concurrent prompts and clears pending state on cancel", async () => {
  const gate = new OneTimeSecretGate();
  const pending = gate.wait();
  await assert.rejects(gate.wait(), /already pending/);
  gate.cancel("expired");
  await assert.rejects(pending, /expired/);
  assert.equal(gate.isWaiting, false);
  assert.equal(gate.submit("late"), false);
});
