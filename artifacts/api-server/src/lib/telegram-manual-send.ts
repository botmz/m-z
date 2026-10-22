import { splitText } from "./composition";
import { botApi } from "./telegram-bot";

export type ManualSendPart = {
  text: string;
  parse_mode?: "HTML";
  link_preview_options: { is_disabled: true };
};

export function manualSendParts(text: string, html: string, format: string): ManualSendPart[] {
  if (text.length <= 4000) {
    return [{
      text: format === "html" ? html : text,
      ...(format === "html" ? { parse_mode: "HTML" as const } : {}),
      link_preview_options: { is_disabled: true },
    }];
  }
  return splitText(text).map(part => ({ text: part, link_preview_options: { is_disabled: true } }));
}

export class PartialManualSendError extends Error {
  constructor(sentCount: number, totalCount: number) {
    super(`تم إرسال ${sentCount} من ${totalCount} أجزاء فقط. تحقّق من القناة قبل محاولة الإرسال مرة أخرى.`);
  }
}

export async function sendManualMessage(
  destination: string,
  text: string,
  html: string,
  format: string,
  send: (body: Record<string, unknown>) => Promise<unknown> = body => botApi("sendMessage", body),
): Promise<number> {
  const parts = manualSendParts(text, html, format);
  let sentCount = 0;
  for (const part of parts) {
    try {
      await send({ chat_id: destination, ...part });
      sentCount += 1;
    } catch (error) {
      if (sentCount > 0) throw new PartialManualSendError(sentCount, parts.length);
      throw error;
    }
  }
  return sentCount;
}
