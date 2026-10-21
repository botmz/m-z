import { useState } from 'react';
import { Languages } from 'lucide-react';
import type { Settings } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ErrorBox, Field, PageHeader, Panel, RowsSkeleton, Sel } from '@/components/mz-ui';
import { useSettingsSave } from '@/lib/use-settings-save';

const PROVIDERS: [string, string][] = [['disabled', 'معطّل'], ['replit', 'Replit AI'], ['deepl', 'DeepL']];
const NOTES: Record<string, string> = {
  disabled: 'مزود الترجمة معطل. المصادر المفعلة للترجمة ستطبق خيارها عند الفشل: نشر الأصل أو تعليق الرسالة.',
  replit: 'يستخدم Replit AI Integrations للوصول إلى OpenAI دون مفتاح API منك. يُحتسب الاستخدام من أرصدتك؛ فعّله فقط للمصادر المطلوبة وحدد النموذج.',
  deepl: 'يتطلب مفتاح DeepL مضبوطاً على الخادم. إن لم يكن موجوداً ستظهر رسالة الخطأ الفعلية عند الترجمة.',
};

function Form({ s }: { s: Settings }) {
  const { save, saving } = useSettingsSave();
  const [p, setP] = useState<string>(s.translationProvider);
  const [model, setModel] = useState(s.translationModel);
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save({ translationProvider: p as Settings['translationProvider'], translationModel: model.trim() }); }}>
      <Field label="مزوّد الترجمة"><Sel value={p} onChange={(e) => setP(e.target.value)} options={PROVIDERS} data-testid="select-provider" /></Field>
      <p className="rounded-md border border-border bg-muted/50 p-3 text-sm text-muted-foreground" data-testid="text-provider-note">{NOTES[p]}</p>
      <Field label="النموذج" hint="اختياري، حتى 100 حرف"><Input dir="ltr" maxLength={100} value={model} onChange={(e) => setModel(e.target.value)} disabled={p === 'disabled'} data-testid="input-model" /></Field>
      <Button type="submit" disabled={saving} data-testid="button-save-translation">{saving ? 'جارٍ الحفظ...' : 'حفظ'}</Button>
    </form>
  );
}

export default function TranslationPage() {
  const { query: q } = useSettingsSave();
  return (
    <>
      <PageHeader title="الترجمة" desc="المزوّد المستخدم لترجمة رسائل المصادر المفعّل فيها خيار الترجمة إلى العربية." />
      <Panel title="مزوّد الترجمة" className="max-w-xl">
        {q.isLoading ? <RowsSkeleton n={2} /> : q.isError ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : q.data && <Form key={JSON.stringify(q.data)} s={q.data} />}
      </Panel>
      <p className="mt-4 flex max-w-xl items-center gap-2 text-xs text-muted-foreground"><Languages className="size-4 text-gold" /> نتيجة الترجمة الفعلية تظهر في صفحة معاينة الرسالة.</p>
    </>
  );
}
