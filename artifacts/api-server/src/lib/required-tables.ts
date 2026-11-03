export const requiredDatabaseTables = [
  "admin_settings",
  "admin_sessions",
  "audit_logs",
  "source_channels",
  "destination_channels",
  "routing_rules",
  "messages",
  "message_deliveries",
  "delivery_attempts",
  "app_settings",
  "market_prices",
  "message_translations",
  "message_album_items",
] as const;

export function findMissingDatabaseTables(foundTables: readonly string[]): string[] {
  const found = new Set(foundTables);
  return requiredDatabaseTables.filter((table) => !found.has(table));
}
