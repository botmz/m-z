import { pgTable, serial, text, boolean, jsonb, timestamp, integer, uniqueIndex } from "drizzle-orm/pg-core";

export const sourceChannels = pgTable("source_channels", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  username: text("username").notNull().unique(),
  enabled: boolean("enabled").notNull().default(false),
  config: jsonb("config").notNull().default({}),
  status: text("status").notNull().default("unverified"),
  lastError: text("last_error"),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
  lastMessageId: integer("last_message_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
// Destination IDs use a separate range in API responses to avoid ambiguous IDs.
export const destinationChannels = pgTable("destination_channels", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  username: text("username").notNull().unique(),
  enabled: boolean("enabled").notNull().default(false),
  config: jsonb("config").notNull().default({}),
  status: text("status").notNull().default("unverified"),
  lastError: text("last_error"),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const routingRules = pgTable("routing_rules", {
  id: serial("id").primaryKey(),
  sourceId: integer("source_id").notNull().references(() => sourceChannels.id, { onDelete: "cascade" }),
  destinationId: integer("destination_id").notNull().references(() => destinationChannels.id, { onDelete: "cascade" }),
}, (t) => [uniqueIndex("routing_unique").on(t.sourceId, t.destinationId)]);
