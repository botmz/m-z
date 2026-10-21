import { test } from "node:test";
import assert from "node:assert/strict";
import { customFetch } from "../../../lib/api-client-react/src/custom-fetch";
import { sameOrigin } from "../src/lib/auth";
import type { Request, Response } from "express";

test("bodyless MZ commands send JSON accepted by the unchanged CSRF guard", async () => {
  const original = globalThis.fetch;
  const requests: RequestInit[] = [];
  globalThis.fetch = async (_input, init) => {
    requests.push(init!);
    return new globalThis.Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } });
  };
  try {
    for (const path of ["/api/mz/telegram/qr", "/api/mz/market", "/api/mz/messages/1/retry"]) {
      await customFetch(path, { method: "POST" });
    }
    assert.equal(requests.length, 3);
    for (const request of requests) {
      assert.equal(request.body, "{}");
      assert.equal(new Headers(request.headers).get("content-type"), "application/json");
      let allowed = false;
      const req = {
        method: "POST",
        get: (name: string) => ({ origin: "https://example.test", host: "example.test", "sec-fetch-site": "same-origin" }[name]),
        is: (type: string) => type === new Headers(request.headers).get("content-type") ? type : false,
      } as Request;
      sameOrigin(req, { setHeader() {}, status() { throw new Error("valid JSON command rejected"); } } as unknown as Response, () => { allowed = true; });
      assert(allowed);
    }
  } finally { globalThis.fetch = original; }
});
test("JSON command normalization preserves bodies and unrelated API requests", async () => {
  const original = globalThis.fetch;
  const requests: RequestInit[] = [];
  globalThis.fetch = async (_input, init) => {
    requests.push(init!);
    return new globalThis.Response("{}", { headers: { "content-type": "application/json" } });
  };
  try {
    await customFetch("/api/mz/control", { method: "POST", body: '{"action":"pause"}' });
    await customFetch("/other/service", { method: "POST" });
    await customFetch("/api/mz/telegram/qr", { method: "GET" });
    assert.equal(requests[0]!.body, '{"action":"pause"}');
    assert.equal(requests[1]!.body, undefined);
    assert.equal(requests[2]!.body, undefined);
  } finally { globalThis.fetch = original; }
});
test("cross-site QR commands are still rejected", () => {
  let status = 0, passed = false;
  const req = {
    method: "POST",
    get: (name: string) => ({ origin: "https://untrusted.test", host: "example.test", "sec-fetch-site": "cross-site" }[name]),
    is: () => "application/json",
  } as Request;
  const res = { setHeader() {}, status(code: number) { status = code; return this; }, json() {} } as unknown as Response;
  sameOrigin(req, res, () => { passed = true; });
  assert.equal(status, 403);
  assert.equal(passed, false);
});
