export function validateTelegramApiCredentials(apiIdValue: string | undefined, apiHashValue: string | undefined) {
  const normalizedId = apiIdValue?.trim() ?? "";
  if (!/^[0-9]+$/.test(normalizedId) || !Number.isSafeInteger(Number(normalizedId)) || Number(normalizedId) <= 0) {
    throw new Error("API_ID غير مضبوط: أدخل رقم التطبيق (App api_id) من my.telegram.org، وليس اسم الحقل أو BOT_TOKEN");
  }
  const normalizedHash = apiHashValue?.trim() ?? "";
  if (!normalizedHash) throw new Error("API_HASH_MISSING: أضف قيمة api_hash للتطبيق من my.telegram.org");
  if (/^\d+:[A-Za-z0-9_-]{20,}$/.test(normalizedHash)) throw new Error("API_HASH_IS_BOT_TOKEN: لا تضع BOT_TOKEN في خانة API_HASH");
  if (normalizedHash.length > 128) throw new Error("API_HASH_INVALID_LENGTH: قيمة API_HASH أطول من المتوقع");
  if (/[\u0000-\u0020\u007f]/.test(normalizedHash)) throw new Error("API_HASH_HAS_WHITESPACE: أزل المسافات أو الأسطر من API_HASH");
  return { apiId: Number(normalizedId), apiHash: normalizedHash };
}
