import { pool, settings, getSetting, setSetting, audit, safeError } from "./store";

export function direction(price: number, previous: number | null) {
  return previous === null || price === previous ? "neutral" : price > previous ? "up" : "down";
}
export async function marketQuotes() {
  const config = await settings();
  const { rows } = await pool.query("SELECT * FROM market_prices ORDER BY symbol");
  return rows.map(r => ({
    symbol: r.symbol, price: r.price, previousPrice: r.previous_price, direction: direction(r.price, r.previous_price),
    provider: r.provider, updatedAt: r.updated_at.toISOString(),
    stale: Date.now() - r.updated_at.getTime() > config.marketStaleMinutes * 60000,
  }));
}
let refreshing = false;
export async function refreshPrices() {
  if (refreshing) return { ok: false, message: "تحديث الأسعار قيد التنفيذ" };
  const last = await getSetting<number>("market_last_attempt", 0);
  if (Date.now() - last < 60000) return { ok: false, message: "يرجى الانتظار دقيقة بين تحديثات الأسعار احتراماً لحدود المزود" };
  refreshing = true;
  await setSetting("market_last_attempt", Date.now());
  const errors: string[] = [];
  let count = 0;
  try {
    for (const quote of [
      { symbol: "BTC/USD", url: "https://api.coinbase.com/v2/prices/BTC-USD/spot", provider: "Coinbase", parse: (j: any) => Number(j?.data?.amount) },
      { symbol: "XAU/USD", url: "https://api.gold-api.com/price/XAU", provider: "Gold API", parse: (j: any) => Number(j?.price) },
    ]) {
      try {
        const response = await fetch(quote.url, { signal: AbortSignal.timeout(12000) });
        if (!response.ok) throw new Error(`${quote.provider}: HTTP ${response.status}`);
        const json = await response.json() as { updatedAt?: string };
        const price = quote.parse(json);
        if (!Number.isFinite(price) || price <= 0) throw new Error(`${quote.provider}: سعر غير صالح`);
        if (quote.symbol === "XAU/USD" && json.updatedAt && Date.now() - new Date(json.updatedAt).getTime() > 60 * 60 * 1000) {
          throw new Error("بيانات الذهب لدى المزود قديمة، لن تُعرض كسعر حديث");
        }
        await pool.query(`INSERT INTO market_prices(symbol,price,provider,updated_at) VALUES($1,$2,$3,now())
          ON CONFLICT(symbol) DO UPDATE SET previous_price=market_prices.price,price=EXCLUDED.price,
          provider=EXCLUDED.provider,updated_at=EXCLUDED.updated_at`, [quote.symbol, price, quote.provider]);
        count++;
      } catch (e) { errors.push(safeError(e)); }
    }
    const message = `تم تحديث ${count} من 2 من أسعار السوق${errors.length ? ` — ${errors.join("؛ ")}` : ""}`;
    await setSetting("market_error", errors.join("؛ "));
    await audit(errors.length ? "warning" : "info", "market", message);
    return { ok: errors.length === 0, message };
  } finally { refreshing = false; }
}
