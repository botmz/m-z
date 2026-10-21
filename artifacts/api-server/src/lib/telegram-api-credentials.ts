export function validateTelegramApiCredentials(apiIdValue: string | undefined, apiHashValue: string | undefined) {
  const normalizedId = apiIdValue?.trim() ?? "";
  if (!/^[0-9]+$/.test(normalizedId) || !Number.isSafeInteger(Number(normalizedId)) || Number(normalizedId) <= 0) {
    throw new Error("API_ID غير مضبوط: أدخل رقم التطبيق (App api_id) من my.telegram.org، وليس اسم الحقل أو BOT_TOKEN");
  }
  const normalizedHash = apiHashValue?.trim() ?? "";
  if (!/^[0-9a-f]{32}$/i.test(normalizedHash)) {
    throw new Error("API_HASH غير مضبوط: أدخل قيمة api_hash المكونة من 32 خانة سداسية من my.telegram.org، وليس BOT_TOKEN");
  }
  return { apiId: Number(normalizedId), apiHash: normalizedHash };
}
