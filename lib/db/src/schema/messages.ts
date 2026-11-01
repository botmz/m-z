import { pgTable, serial, text, integer, timestamp, boolean, uniqueIndex, index, jsonb, primaryKey, customType } from "drizzle-orm/pg-core";
import { sourceChannels, destinationChannels } from "./channels";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  sourceId: integer("source_id").references(() => sourceChannels.id, { onDelete: "set null" }),
  sourceKey: text("source_key").notNull(),
  telegramMessageId: integer("telegram_message_id").notNull(),
  text: text("text").notNull(),
  hasPhoto: boolean("has_photo").notNull().default(false),
  mediaKind: text("media_kind").notNull().default("none"),
  mediaData: bytea("media_data"),
  mediaMimeType: text("media_mime_type"),
  mediaFilename: text("media_filename"),
  entities: jsonb("entities").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("messages_dedup").on(t.sourceKey, t.telegramMessageId)]);
export const messageTranslations = pgTable("message_translations", {
  messageId: integer("message_id").notNull().references(() => messages.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  targetLanguage: text("target_language").notNull(),
  inputHash: text("input_hash").notNull(),
  status: text("status").notNull(),
  translatedText: text("translated_text"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({
  name: "message_translations_key",
  columns: [t.messageId, t.provider, t.model, t.targetLanguage, t.inputHash],
})]);
export const messageDeliveries = pgTable("message_deliveries", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").notNull().references(() => messages.id, { onDelete: "cascade" }),
  destinationId: integer("destination_id").references(() => destinationChannels.id, { onDelete: "set null" }),
  destinationKey: text("destination_key").notNull(),
  status: text("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  translationStatus: text("translation_status").notNull().default("not_requested"),
  renderedText: text("rendered_text"),
  sendPlan: jsonb("send_plan"),
  error: text("error"),
  telegramMessageIds: jsonb("telegram_message_ids").notNull().default([]),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("deliveries_dedup").on(t.messageId, t.destinationKey), index("deliveries_queue").on(t.status, t.nextAttemptAt)]);
export const deliveryAttempts = pgTable("delivery_attempts", {
  id: serial("id").primaryKey(),
  deliveryId: integer("delivery_id").notNull().references(() => messageDeliveries.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  detail: text("detail"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
