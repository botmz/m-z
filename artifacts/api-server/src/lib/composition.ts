import { marketQuotes } from "./market";
import { settings, type Channel } from "./store";
import { containsVisibleUrl, removeSourceReferences, removeTextLinks, type TelegramTextEntity } from "./source-reference";
import { normalizeRouteContentSettings, type RouteContentSettings } from "./route-content";

export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export function sourceLink(username: string, messageId?: number) {
  return `https://t.me/${username.replace(/^@/, "")}${messageId ? `/${messageId}` : ""}`;
}
export function marketPriceLine(symbol: string, price: number, quoteDirection: string, stale: boolean) {
  const name = symbol === "XAU/USD" ? "الذهب" : "البيتكوين";
  const indicator = quoteDirection === "up" ? "▲" : quoteDirection === "down" ? "▼" : "—";
  const value = `${name} ${symbol}: ${price.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 })} $ ${indicator}`;
  return stale ? `${value} • سعر قديم` : value;
}
export function containsLink(text: string, entities: Array<{ className?: string; url?: string }> = []) {
  if (entities.some((entity) => entity.className === "MessageEntityUrl" || entity.className === "MessageEntityTextUrl")) return true;
  return containsVisibleUrl(text);
}
export function isBotTestMessage(text: string) {
  const normalized = text.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ");
  const testPhrase = /(?:رسالة\s+اختبار|اختبار\s+رسالة|test\s+message|message\s+test)/i.test(normalized);
  const botMention = /(?:البوت|بوت|bot)/i.test(normalized);
  const verificationPhrase = /(?:يعمل|يشتغل|استلام|تأكيد|confirm|receive|working|works)/i.test(normalized);
  return testPhrase && botMention && verificationPhrase;
}
export function acceptsMessage(
  source: Channel,
  text: string,
  hasMedia: boolean,
  entities: Array<{ className?: string; url?: string }> = [],
) {
  if (!source.enabled) return false;
  if (isBotTestMessage(text)) return false;
  if (source.filter === "text" && hasMedia) return false;
  if (source.filter === "recommendations" && text && !/(شراء|بيع|هدف|وقف|دخول|توصية|\bbuy\b|\bsell\b|entry|take.?profit|stop.?loss)/i.test(text)) return false;
  return Boolean(text || (hasMedia && source.mediaMode === "include"));
}
// Preserve non-overlapping Telegram emphasis and text links without accepting HTML from message text.
export function originalHtml(text: string, entities: any[] = []) {
  const supported: Record<string, [string, string]> = {
    MessageEntityBold: ["<b>", "</b>"], MessageEntityItalic: ["<i>", "</i>"],
    MessageEntityUnderline: ["<u>", "</u>"], MessageEntityStrike: ["<s>", "</s>"],
    MessageEntityCode: ["<code>", "</code>"], MessageEntityPre: ["<pre>", "</pre>"],
    MessageEntitySpoiler: ["<tg-spoiler>", "</tg-spoiler>"],
  };
  let cursor = 0, out = "";
  for (const e of [...entities].sort((a, b) => a.offset - b.offset || b.length - a.length)) {
    if (!Number.isInteger(e.offset) || !Number.isInteger(e.length) || e.offset < cursor || e.offset + e.length > text.length) continue;
    let tags = supported[e.className];
    if (e.className === "MessageEntityTextUrl" && /^https?:\/\//.test(e.url ?? "")) tags = [`<a href="${escapeHtml(e.url)}">`, "</a>"];
    if (!tags) continue;
    out += escapeHtml(text.slice(cursor, e.offset)) + tags[0] + escapeHtml(text.slice(e.offset, e.offset + e.length)) + tags[1];
    cursor = e.offset + e.length;
  }
  return out + escapeHtml(text.slice(cursor));
}
export async function compose(
  source: Channel,
  destination: Channel,
  text: string,
  messageId?: number,
  entities: TelegramTextEntity[] = [],
  hideSourceLink = false,
  routeSettings?: Partial<RouteContentSettings>,
  marketQuotesProvider: typeof marketQuotes = marketQuotes,
) {
  const content = normalizeRouteContentSettings(routeSettings, !source.skipMessagesWithLinks);
  const sourceCleanedBody = hideSourceLink
    ? content.showText ? removeSourceReferences(text, entities, source.username, source.name) : { text: "", entities: [] }
    : content.showText ? { text, entities } : { text: "", entities: [] };
  const cleanedBody = content.showLinks
    ? sourceCleanedBody
    : removeTextLinks(sourceCleanedBody.text, sourceCleanedBody.entities);
  const warnings: string[] = [];
  const prefix: string[] = [];
  if (!source.enabled || !destination.enabled) warnings.push("القناة معطلة؛ المعاينة لا تعني السماح بالإرسال");
  if (destination.marketEnabled && content.showMarketPrices) {
    const config = await settings();
    const prices = await marketQuotesProvider();
    const order = destination.marketOrder === "bitcoinFirst" ? ["BTC/USD", "XAU/USD"] : ["XAU/USD", "BTC/USD"];
    for (const symbol of order) {
      if ((symbol === "BTC/USD" && !destination.showBitcoin) || (symbol === "XAU/USD" && !destination.showGold)) continue;
      const quote = prices.find(p => p.symbol === symbol);
      if (!quote) { warnings.push(`لا يوجد سعر فعلي لـ ${symbol}`); continue; }
      if (quote.stale && destination.stalePolicy === "hide") { warnings.push(`أُخفي سعر ${symbol} القديم`); continue; }
      prefix.push(marketPriceLine(symbol, quote.price, quote.direction, quote.stale));
    }
  }
  const suffix: string[] = [];
  if (destination.signatureEnabled && content.showSignature && destination.suffix.trim()) {
    const configuredSignature = destination.suffix.trim();
    const signature = content.showLinks ? configuredSignature : removeTextLinks(configuredSignature).text.trim();
    if (signature) suffix.push(signature);
  }
  const channelUrl = sourceLink(source.username);
  const existingText = [...prefix, cleanedBody.text, ...suffix].join("\n").toLowerCase();
  if (content.showText && content.showLinks && source.attachSource && !hideSourceLink && !existingText.includes(channelUrl.toLowerCase())) {
    suffix.push(`المصدر: ${source.name}\n${sourceLink(source.username, messageId)}`);
  }
  const renderedText = [...prefix, cleanedBody.text, ...suffix].filter(Boolean).join("\n\n");
  const bodyHtml = originalHtml(cleanedBody.text, cleanedBody.entities);
  const html = [...prefix.map(escapeHtml), bodyHtml, ...suffix.map(escapeHtml)].filter(Boolean).join("\n\n");
  if (renderedText.length > 4096) warnings.push("سيُقسم النص إلى عدة رسائل بسبب حدود Telegram؛ التنسيق الطويل سيستخدم النص العادي");
  return { text: renderedText, html, warnings };
}
export function splitText(text: string, max = 4000): string[] {
  const chunks: string[] = [];
  while (text.length > max) {
    let cut = text.lastIndexOf("\n", max);
    if (cut < max / 2) cut = max;
    if (/[\uD800-\uDBFF]/.test(text[cut - 1] ?? "")) cut--;
    chunks.push(text.slice(0, cut));
    text = text.slice(cut);
  }
  if (text) chunks.push(text);
  return chunks;
}

export type ComposedPart = { method: "sendMessage" | "sendMedia"; text: string; html?: string };
export const CURRENT_LINK_POLICY_VERSION = 2;
export function savedPlanNeedsLinkRefresh(removeLinks: boolean, savedVersion: unknown) {
  return removeLinks && savedVersion !== CURRENT_LINK_POLICY_VERSION;
}
export function savedPlanDisposition(savedStatus: string, sentPartCount: number): "reuse" | "rebuild" | "hold" {
  if (savedStatus !== "translated") return "reuse";
  return sentPartCount > 0 ? "hold" : "rebuild";
}

export function createSendPlan(text: string, html: string, hasMedia: boolean, useHtml: boolean): ComposedPart[] {
  const plan: ComposedPart[] = [];
  if (hasMedia && text.length <= 1024) {
    plan.push({ method: "sendMedia", text, ...(useHtml ? { html } : {}) });
  } else {
    if (hasMedia) plan.push({ method: "sendMedia", text: "" });
    if (text.length <= 4000) {
      if (text) plan.push({ method: "sendMessage", text, ...(useHtml ? { html } : {}) });
    } else {
      plan.push(...splitText(text).map((part) => ({
        method: "sendMessage" as const,
        text: part,
      })));
    }
  }
  return plan;
}
