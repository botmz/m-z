import assert from "node:assert/strict";
import { test } from "node:test";
import {
  findMissingDatabaseTables,
  requiredDatabaseTables,
} from "../src/lib/required-tables";

test("the required application schema includes the admin login tables", () => {
  assert.ok(requiredDatabaseTables.includes("admin_settings"));
  assert.ok(requiredDatabaseTables.includes("admin_sessions"));
  assert.ok(requiredDatabaseTables.includes("audit_logs"));
});

test("schema verification reports missing admin and application tables", () => {
  assert.deepEqual(findMissingDatabaseTables(["admin_sessions", "messages"]), [
    "admin_settings",
    "audit_logs",
    "source_channels",
    "destination_channels",
    "routing_rules",
    "message_deliveries",
    "delivery_attempts",
    "app_settings",
    "market_prices",
    "message_translations",
    "message_album_items",
  ]);
});

test("schema verification succeeds when all required tables exist", () => {
  assert.deepEqual(findMissingDatabaseTables([...requiredDatabaseTables]), []);
});
