import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";

export const adminSettings = pgTable("admin_settings", {
  id: integer("id").primaryKey().default(1),
  passwordHash: text("password_hash").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const adminSessions = pgTable("admin_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  level: text("level").notNull(),
  category: text("category").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
