export type TelegramTextEntity = {
  className?: string;
  offset: number;
  length: number;
  url?: string;
  [key: string]: unknown;
};

type Range = { start: number; end: number };
type MappedUnit = { value: string; origin: number };

const attributionPrefix = /^\s*(?:المصدر(?:\s+الأصلي)?|source|تابعونا|تابعوا|تابع القناة|قناة المصدر|follow(?:\s+(?:us|the channel))?)\s*[:：–—-]?\s*/iu;
const separator = /^[|•·–—\-,:،؛.!?؟]+$/u;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isSourceChannelUrl(value: string, username: string) {
  const expected = username.replace(/^@/, "").toLocaleLowerCase();
  if (!expected) return false;
  try {
    if (/^tg:\/\//i.test(value)) {
      const url = new URL(value);
      return url.hostname.toLowerCase() === "resolve" &&
        url.searchParams.get("domain")?.replace(/^@/, "").toLocaleLowerCase() === expected;
    }
    const candidate = value.trim().replace(/[.,،؛:!?؟)\]}]+$/u, "");
    const url = new URL(/^https?:\/\//i.test(candidate) ? candidate : `https://${candidate.replace(/^\/\//, "")}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host !== "t.me" && host !== "telegram.me") return false;
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments[0]?.toLowerCase() === "s") segments.shift();
    return segments[0]?.replace(/^@/, "").toLocaleLowerCase() === expected;
  } catch {
    return false;
  }
}

function mergeRanges(ranges: Range[]) {
  const sorted = ranges
    .filter((range) => Number.isInteger(range.start) && Number.isInteger(range.end) && range.start >= 0 && range.end > range.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: Range[] = [];
  for (const range of sorted) {
    const last = merged.at(-1);
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }
  return merged;
}

function includeAdjacentSeparators(text: string, range: Range): Range {
  let { start, end } = range;
  const left = text.slice(0, start).match(/[ \t]*(?:[|•·–—\-,:،؛.!?؟])[ \t]*$/u);
  const right = text.slice(end).match(/^[ \t]*(?:[|•·–—\-,:،؛.!?؟])[ \t]*/u);
  if (left) start -= left[0].length;
  if (right) end += right[0].length;
  return { start, end };
}

function cleanLine(units: MappedUnit[], removeDanglingAtStart: boolean, removeDanglingAtEnd: boolean) {
  const collapsed: MappedUnit[] = [];
  for (const unit of units) {
    if (unit.value === "\r") continue;
    if (unit.value === " " || unit.value === "\t") {
      if (!collapsed.length || collapsed.at(-1)!.value === " ") continue;
      collapsed.push({ ...unit, value: " " });
      continue;
    }
    if (/^[,،;؛:!?؟]$/u.test(unit.value)) {
      while (collapsed.at(-1)?.value === " ") collapsed.pop();
    }
    collapsed.push(unit);
  }
  while (collapsed.at(-1)?.value === " ") collapsed.pop();
  while (collapsed[0]?.value === " ") collapsed.shift();
  if (removeDanglingAtStart) {
    while (collapsed.length && separator.test(collapsed[0]!.value)) collapsed.shift();
    while (collapsed[0]?.value === " ") collapsed.shift();
  }
  if (removeDanglingAtEnd) {
    while (collapsed.length && separator.test(collapsed.at(-1)!.value)) collapsed.pop();
    while (collapsed.at(-1)?.value === " ") collapsed.pop();
  }
  return collapsed;
}

/**
 * Remove only references to this source channel. Telegram entity offsets use
 * UTF-16 code units, so all ranges and remapped offsets intentionally use JS
 * string indices. Other links and their entities are retained.
 */
export function removeSourceReferences(
  text: string,
  entities: TelegramTextEntity[],
  username: string,
  sourceName = "",
): { text: string; entities: TelegramTextEntity[] } {
  const cleanUsername = username.replace(/^@/, "");
  if (!cleanUsername || !text) return { text, entities };

  const sourceRanges: Range[] = [];
  const add = (start: number, end: number) => {
    if (start >= 0 && end > start && end <= text.length) {
      sourceRanges.push(includeAdjacentSeparators(text, { start, end }));
    }
  };

  const urlPattern = /(?<![\p{L}\p{N}_])(?:(?:https?:)?\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\/[^\s<>"'()[\]{}]+/giu;
  for (const match of text.matchAll(urlPattern)) {
    const raw = match[0];
    if (!isSourceChannelUrl(raw, cleanUsername)) continue;
    let length = raw.length;
    while (length && /[.,،؛:!?؟)\]}]/u.test(raw[length - 1]!)) length--;
    add(match.index!, match.index! + length);
  }

  const mentionPattern = new RegExp(`(?<![\\p{L}\\p{N}_])@${escapeRegExp(cleanUsername)}(?![\\p{L}\\p{N}_])`, "giu");
  for (const match of text.matchAll(mentionPattern)) add(match.index!, match.index! + match[0].length);

  for (const entity of entities) {
    if (
      entity.className === "MessageEntityTextUrl" &&
      isSourceChannelUrl(entity.url ?? "", cleanUsername) &&
      Number.isInteger(entity.offset) &&
      Number.isInteger(entity.length)
    ) add(entity.offset, entity.offset + entity.length);
  }

  const matchingRanges = mergeRanges(sourceRanges);
  const allRanges = [...matchingRanges];
  const exactSourceName = sourceName.trim().replace(/^[|•·–—\-,:،؛.!?؟\s]+|[|•·–—\-,:،؛.!?؟\s]+$/gu, "").replace(/\s+/gu, " ").toLocaleLowerCase();
  let lineStart = 0;
  while (lineStart <= text.length) {
    const newline = text.indexOf("\n", lineStart);
    const lineEnd = newline < 0 ? text.length : newline;
    const line = text.slice(lineStart, lineEnd);
    const trimmedName = line.trim().replace(/^[|•·–—\-,:،؛.!?؟\s]+|[|•·–—\-,:،؛.!?؟\s]+$/gu, "").replace(/\s+/gu, " ").toLocaleLowerCase();
    const hasSourceReference = matchingRanges.some((range) => range.start < lineEnd && range.end > lineStart);
    const attributionValue = line.replace(attributionPrefix, "").trim()
      .replace(/^[|•·–—\-,:،؛.!?؟\s]+|[|•·–—\-,:،؛.!?؟\s]+$/gu, "")
      .replace(/\s+/gu, " ").toLocaleLowerCase();
    const namedAttribution = attributionPrefix.test(line) &&
      (attributionValue === exactSourceName || attributionValue === cleanUsername.toLocaleLowerCase());
    if ((hasSourceReference && attributionPrefix.test(line)) || namedAttribution || (exactSourceName && trimmedName === exactSourceName)) {
      allRanges.push({ start: lineStart, end: lineEnd });
    }
    if (newline < 0) break;
    lineStart = newline + 1;
  }

  const ranges = mergeRanges(allRanges);
  if (!ranges.length) return { text, entities };

  const cleanedLines: { units: MappedUnit[]; newlineIndex?: number; start: number; end: number; sourceRemoved: boolean; }[] = [];
  let rangeIndex = 0;
  lineStart = 0;
  for (let index = 0; index <= text.length; index++) {
    if (index !== text.length && text[index] !== "\n") continue;
    const lineEnd = index;
    const units: MappedUnit[] = [];
    while (rangeIndex < ranges.length && ranges[rangeIndex]!.end <= lineStart) rangeIndex++;
    let currentRange = rangeIndex;
    for (let offset = lineStart; offset < lineEnd; offset++) {
      while (currentRange < ranges.length && ranges[currentRange]!.end <= offset) currentRange++;
      const range = ranges[currentRange];
      if (range && range.start <= offset && offset < range.end) continue;
      units.push({ value: text[offset]!, origin: offset });
    }
    const startOfContent = text.slice(lineStart, lineEnd).search(/\S/u);
    const trailingWhitespace = text.slice(lineStart, lineEnd).match(/\s*$/u)?.[0].length ?? 0;
    const firstContent = startOfContent < 0 ? lineEnd : lineStart + startOfContent;
    const lastContent = lineEnd - trailingWhitespace;
    const removeAtStart = matchingRanges.some((range) => range.start <= firstContent && range.end > lineStart);
    const removeAtEnd = matchingRanges.some((range) => range.end >= lastContent && range.start < lineEnd);
    cleanedLines.push({
      units: cleanLine(units, removeAtStart, removeAtEnd),
      ...(index < text.length ? { newlineIndex: index } : {}),
      start: lineStart,
      end: lineEnd,
      sourceRemoved: ranges.some((range) => range.start < lineEnd && range.end > lineStart),
    });
    lineStart = index + 1;
  }

  const keptLines: typeof cleanedLines = [];
  let blankLine: (typeof cleanedLines)[number] | undefined;
  for (const line of cleanedLines) {
    if (!line.units.length) {
      if (keptLines.length && !line.sourceRemoved) blankLine ??= line;
      continue;
    }
    if (keptLines.length && blankLine) {
      keptLines.push(blankLine);
    }
    keptLines.push(line);
    blankLine = undefined;
  }

  const output: MappedUnit[] = [];
  for (let index = 0; index < keptLines.length; index++) {
    const line = keptLines[index]!;
    if (index > 0) {
      const previous = keptLines[index - 1]!;
      const newlineIndex = previous.newlineIndex;
      output.push({ value: "\n", origin: newlineIndex ?? previous.end });
    }
    output.push(...line.units);
  }

  const outputText = output.map((unit) => unit.value).join("");
  const remappedEntities: TelegramTextEntity[] = [];
  for (const entity of entities) {
    if (!Number.isInteger(entity.offset) || !Number.isInteger(entity.length) || entity.offset < 0 || entity.length <= 0) continue;
    const end = entity.offset + entity.length;
    let runStart: number | undefined;
    let runLength = 0;
    const flush = () => {
      if (runStart !== undefined && runLength) remappedEntities.push({ ...entity, offset: runStart, length: runLength });
      runStart = undefined;
      runLength = 0;
    };
    output.forEach((unit, outputIndex) => {
      if (unit.origin >= entity.offset && unit.origin < end) {
        if (runStart === undefined) runStart = outputIndex;
        runLength++;
      } else {
        flush();
      }
    });
    flush();
  }
  remappedEntities.sort((a, b) => a.offset - b.offset || a.length - b.length);
  return { text: outputText, entities: remappedEntities };
}
