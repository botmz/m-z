import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("the services page restores the 2FA field and Arabic Telegram error from polled QR state", async () => {
  const source = await readFile(new URL("../../mz-telegram/src/pages/services.tsx", import.meta.url), "utf8");

  assert.match(source, /const QR_POLLING = \[[^\]]*'needs_2fa'/);
  assert.match(source, /const st = poll\.data \?\? begin\.data/);
  assert.match(source, /data-testid="text-qr-message">\{st\.message\}/);

  const retryBlock = source.match(/\{st\.status === 'needs_2fa' && \(\s*<>[\s\S]*?<\/>\s*\)\}/)?.[0];
  assert.ok(retryBlock, "the needs_2fa response must render its retry prompt");
  assert.match(retryBlock, /data-testid="form-telegram-2fa"/);
  assert.match(retryBlock, /data-testid="input-telegram-2fa-password"/);
  assert.match(source, /setQueryData\(getGetTelegramQrQueryKey\(\), result\)/);
  assert.match(source, /setPassword\(''\)/);
});
