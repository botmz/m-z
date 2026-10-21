import { pgTable, text, jsonb, timestamp, doublePrecision } from "drizzle-orm/pg-core";

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
});
export const marketPrices = pgTable("market_prices", {
  symbol: text("symbol").primaryKey(),
  price: doublePrecision("price").notNull(),
  previousPrice: doublePrecision("previous_price"),
  provider: text("provider").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
