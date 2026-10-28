import { toast } from '@/hooks/use-toast';
import type { ActionResult, Channel, ChannelInput } from '@workspace/api-client-react';

export function errMsg(e: unknown): string {
  const x = e as { data?: { error?: string } | null; message?: string } | null;
  return x?.data?.error || x?.message || 'حدث خطأ غير متوقع';
}

export function reportError(e: unknown, title = 'تعذر تنفيذ الطلب') {
  toast({ title, description: errMsg(e), variant: 'destructive' });
}

/** Shows server ActionResult. Returns true only when ok. */
export function reportResult(r: ActionResult): boolean {
  toast({
    title: r.ok ? 'تم بنجاح' : 'لم تكتمل العملية',
    description: r.message,
    variant: r.ok ? 'default' : 'destructive',
  });
  return r.ok;
}

export const defaultChannel = (kind: 'source' | 'destination'): ChannelInput => ({
  kind,
  name: '',
  username: '',
  enabled: true,
  translate: false,
  skipMessagesWithLinks: false,
  targetLanguage: 'ar',
  attachSource: false,
  prefix: '',
  suffix: '',
  filter: 'all',
  mediaMode: 'include',
  translationFailure: 'original',
  marketEnabled: false,
  showGold: true,
  showBitcoin: true,
  marketOrder: 'goldFirst',
  stalePolicy: 'hide',
  format: 'plain',
});

export function channelToInput(c: Channel): ChannelInput {
  const d = defaultChannel(c.kind);
  const out = { ...d } as Record<string, unknown>;
  for (const k of Object.keys(d)) {
    const v = (c as unknown as Record<string, unknown>)[k];
    if (v !== undefined && v !== null) out[k] = v;
  }
  return out as unknown as ChannelInput;
}

export type Tone = 'good' | 'bad' | 'warn' | 'neutral';

const LABELS: Record<string, [string, Tone]> = {
  running: ['يعمل', 'good'],
  active: ['نشط', 'good'],
  connected: ['متصل', 'good'],
  authorized: ['مصرّح', 'good'],
  ready: ['جاهز', 'good'],
  ok: ['سليم', 'good'],
  healthy: ['سليم', 'good'],
  sent: ['تم الإرسال', 'good'],
  success: ['نجاح', 'good'],
  translated: ['تمت الترجمة', 'good'],
  failed: ['فشل', 'bad'],
  error: ['خطأ', 'bad'],
  down: ['متوقف', 'bad'],
  disconnected: ['غير متصل', 'bad'],
  expired: ['منتهي', 'bad'],
  pending: ['قيد الانتظار', 'warn'],
  queued: ['في الطابور', 'warn'],
  waiting: ['بانتظار', 'warn'],
  connecting: ['جارٍ الاتصال', 'warn'],
  paused: ['موقوف مؤقتاً', 'warn'],
  held: ['محتجزة', 'warn'],
  hold: ['محتجزة', 'warn'],
  degraded: ['أداء منخفض', 'warn'],
  warn: ['تحذير', 'warn'],
  warning: ['تحذير', 'warn'],
  needs_2fa: ['يتطلب التحقق بخطوتين', 'warn'],
  confirming: ['جارٍ تأكيد الربط', 'warn'],
  unconfigured: ['غير مهيأ', 'warn'],
  not_configured: ['غير مهيأ', 'warn'],
  stopped: ['متوقف', 'neutral'],
  disabled: ['معطل', 'neutral'],
  idle: ['خامل', 'neutral'],
  skipped: ['متجاوزة', 'neutral'],
  info: ['معلومة', 'neutral'],
  unknown: ['إرسال غير مؤكد', 'bad'],
  unverified: ['لم يُختبر', 'warn'],
  not_authorized: ['بانتظار تفويض Telegram', 'warn'],
  reauthorization_required: ['يلزم إعادة التفويض', 'bad'],
  configured: ['مُعدّ ولم يُختبر', 'warn'],
  retrying: ['بانتظار إعادة المحاولة', 'warn'],
  processing: ['قيد المعالجة', 'warn'],
  sending: ['جارٍ الإرسال', 'warn'],
  standby: ['عامل احتياطي', 'neutral'],
  not_requested: ['غير مطلوبة', 'neutral'],
  fallback_original: ['النص الأصلي بعد تعذر الترجمة', 'warn'],
  not_required: ['غير مطلوبة', 'neutral'],
};

export function statusInfo(s: string): { label: string; tone: Tone } {
  const hit = LABELS[s?.toLowerCase?.() ?? ''];
  return hit ? { label: hit[0], tone: hit[1] } : { label: s || 'غير معروف', tone: 'neutral' };
}

export const toneText: Record<Tone, string> = {
  good: 'text-success',
  bad: 'text-danger',
  warn: 'text-warn',
  neutral: 'text-muted-foreground',
};
export const toneBox: Record<Tone, string> = {
  good: 'bg-success/10 text-success border-success/30',
  bad: 'bg-danger/10 text-danger border-danger/30',
  warn: 'bg-warn/10 text-warn border-warn/30',
  neutral: 'bg-muted text-muted-foreground border-border',
};
export const toneDot: Record<Tone, string> = {
  good: 'bg-success',
  bad: 'bg-danger',
  warn: 'bg-warn',
  neutral: 'bg-muted-foreground/50',
};

export function fmtDate(iso: string | null | undefined, tz?: string): string {
  if (!iso) return 'لا يوجد';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' };
  try {
    return new Intl.DateTimeFormat('ar-EG-u-nu-latn', { ...opts, timeZone: tz || undefined }).format(d);
  } catch {
    return new Intl.DateTimeFormat('ar-EG-u-nu-latn', opts).format(d);
  }
}

export const filterLabels = { all: 'كل الرسائل', text: 'النصوص فقط', recommendations: 'التوصيات فقط' };
export const mediaLabels = { include: 'تضمين الوسائط', textOnly: 'النص فقط' };
export const failureLabels = { original: 'إرسال النص الأصلي', hold: 'احتجاز الرسالة' };
export const orderLabels = { goldFirst: 'الذهب أولاً', bitcoinFirst: 'البتكوين أولاً' };
export const staleLabels = { hide: 'إخفاء الأسعار القديمة', lastKnown: 'عرض آخر سعر معروف' };
export const formatLabels = { plain: 'نص عادي', html: 'HTML' };
