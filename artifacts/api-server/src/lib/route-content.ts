export type RouteContentSettings = {
  showText: boolean;
  showImages: boolean;
  showVideos: boolean;
  showFiles: boolean;
  showLinks: boolean;
  showMarketPrices: boolean;
  showSignature: boolean;
  excludedTexts: string[];
};
export type RouteMediaKind = "photo" | "video" | "file" | "none" | "legacy";

export const DEFAULT_ROUTE_CONTENT_SETTINGS: RouteContentSettings = {
  showText: true,
  showImages: true,
  showVideos: true,
  showFiles: true,
  showLinks: true,
  showMarketPrices: true,
  showSignature: true,
  excludedTexts: [],
};

function normalizeExcludedText(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

export function normalizeRouteContentSettings(
  value: unknown,
  defaultShowLinks = true,
): RouteContentSettings {
  const input = value && typeof value === "object" ? value as Partial<RouteContentSettings> : {};
  const excludedTexts: string[] = [];
  const seenExcludedTexts = new Set<string>();
  for (const item of Array.isArray(input.excludedTexts) ? input.excludedTexts : []) {
    if (typeof item !== "string") continue;
    const normalized = normalizeExcludedText(item);
    const key = normalized.toLocaleLowerCase();
    if (!normalized || normalized.length > 200 || seenExcludedTexts.has(key)) continue;
    seenExcludedTexts.add(key);
    excludedTexts.push(normalized);
    if (excludedTexts.length === 20) break;
  }
  return {
    showText: typeof input.showText === "boolean" ? input.showText : true,
    showImages: typeof input.showImages === "boolean" ? input.showImages : true,
    showVideos: typeof input.showVideos === "boolean" ? input.showVideos : true,
    showFiles: typeof input.showFiles === "boolean" ? input.showFiles : true,
    showLinks: typeof input.showLinks === "boolean" ? input.showLinks : defaultShowLinks,
    showMarketPrices: typeof input.showMarketPrices === "boolean" ? input.showMarketPrices : true,
    showSignature: typeof input.showSignature === "boolean" ? input.showSignature : true,
    excludedTexts,
  };
}

export function routeContentSettingsKey(settings: RouteContentSettings) {
  return JSON.stringify(settings);
}

export function routeAllowsMedia(kind: RouteMediaKind, settings: RouteContentSettings) {
  if (kind === "photo") return settings.showImages;
  if (kind === "video") return settings.showVideos;
  if (kind === "file") return settings.showFiles;
  return kind === "legacy" && (settings.showImages || settings.showVideos || settings.showFiles);
}

export function isRouteMessageExcluded(text: string, settings: Pick<RouteContentSettings, "excludedTexts">) {
  const normalized = normalizeExcludedText(text).toLocaleLowerCase();
  return Boolean(normalized) && settings.excludedTexts.some((value) =>
    normalizeExcludedText(value).toLocaleLowerCase() === normalized,
  );
}
