import { pool } from "@workspace/db";
import type { ChannelInput, Settings } from "@workspace/api-zod";

export { pool };
export const defaults: Settings = {
  marketInterval: 300, marketStaleMinutes: 15, translationProvider: "disabled",
  translationModel: "gpt-5-mini", timezone: "Asia/Jerusalem", maxAttempts: 5,
};
export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const { rows } = await pool.query("SELECT value FROM app_settings WHERE key=$1", [key]);
  return rows[0]?.value ?? fallback;
}
export async function setSetting(key: string, value: unknown) {
  await pool.query("INSERT INTO app_settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value", [key, JSON.stringify(value)]);
}
export async function settings(): Promise<Settings> {
  return { ...defaults, ...await getSetting<Partial<Settings>>("settings", {}) };
}
export function safeError(error: unknown): string {
  let message = error instanceof Error ? error.message : "خطأ غير معروف";
  for (const key of ["BOT_TOKEN", "API_HASH", "API_ID", "SESSION_SECRET", "ADMIN_INITIAL_PASSWORD", "DEEPL_API_KEY", "AI_INTEGRATIONS_OPENAI_API_KEY"]) {
    const value = process.env[key];
    if (value) message = message.split(value).join("[محجوب]");
  }
  return message.replace(/tg:\/\/login\?token=[^\s]+/g, "[محجوب]").replace(/postgres(?:ql)?:\/\/[^\s]+/g, "[محجوب]").slice(0, 500);
}
export async function audit(level: string, category: string, message: string) {
  await pool.query("INSERT INTO audit_logs(level,category,message) VALUES($1,$2,$3)", [level, category, safeError(new Error(message))]);
}
export type Channel = ChannelInput & {
  id: number; status: string; lastError: string | null; lastMessageAt: string | null; createdAt: string;
};
export function channelRow(row: Record<string, any>, kind: "source" | "destination"): Channel {
  return { ...row.config, id: kind === "destination" ? -row.id : row.id, kind, name: row.name, username: row.username, enabled: row.enabled, status: row.status,
    lastError: row.last_error, lastMessageAt: row.last_message_at?.toISOString() ?? null, createdAt: row.created_at.toISOString() } as Channel;
}
export async function channels(): Promise<Channel[]> {
  const [s, d] = await Promise.all([pool.query("SELECT * FROM source_channels ORDER BY id"), pool.query("SELECT * FROM destination_channels ORDER BY id")]);
  return [...s.rows.map(r => channelRow(r, "source")), ...d.rows.map(r => channelRow(r, "destination"))];
}
export async function channel(id: number): Promise<Channel> {
  const kind = id < 0 ? "destination" : "source";
  const table = kind === "source" ? "source_channels" : "destination_channels";
  const { rows } = await pool.query(`SELECT * FROM ${table} WHERE id=$1`, [Math.abs(id)]);
  if (!rows[0]) throw Object.assign(new Error("القناة غير موجودة"), { status: 404 });
  return channelRow(rows[0], kind);
}
export function normalizeUsername(input: string): string {
  const match = input.trim().match(/^(?:https?:\/\/(?:www\.)?t\.me\/|@)?([a-zA-Z][a-zA-Z0-9_]{3,31})\/?$/);
  if (!match) throw Object.assign(new Error("أدخل معرف قناة عامة مثل @channelname أو رابط https://t.me/channelname"), { status: 400 });
  return `@${match[1]!.toLowerCase()}`;
}
export async function messageHistory(search = "", status = "", channelId?: number) {
  const { rows } = await pool.query(`
    SELECT d.id,m.text,COALESCE(s.name,m.source_key) AS "sourceName",
      COALESCE(c.name,d.destination_key) AS "destinationName",d.status,d.attempts,
      d.translation_status AS "translationStatus",d.error,d.created_at AS "createdAt"
    FROM message_deliveries d JOIN messages m ON m.id=d.message_id
    LEFT JOIN source_channels s ON s.id=m.source_id LEFT JOIN destination_channels c ON c.id=d.destination_id
    WHERE ($1='' OR m.text ILIKE '%'||$1||'%' OR s.name ILIKE '%'||$1||'%' OR c.name ILIKE '%'||$1||'%')
      AND ($2='' OR d.status=$2)
      AND ($3::int IS NULL OR ($3>0 AND m.source_id=$3) OR ($3<0 AND d.destination_id=-$3))
    ORDER BY d.id DESC LIMIT 200`, [search, status, channelId ?? null]);
  return rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() }));
}
export async function logs(search = "", level = "") {
  const { rows } = await pool.query(`SELECT id,level,category,message,created_at AS "createdAt" FROM audit_logs
    WHERE ($1='' OR message ILIKE '%'||$1||'%' OR category ILIKE '%'||$1||'%') AND ($2='' OR level=$2)
    ORDER BY id DESC LIMIT 200`, [search, level]);
  return rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() }));
}
