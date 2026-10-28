import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Languages } from 'lucide-react';
import {
  getGetServicesQueryKey, useTestTranslation, type Settings, type TranslationTestInput, type TranslationTestResponse,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ErrorBox, Field, PageHeader, Panel, RowsSkeleton, Sel } from '@/components/mz-ui';
import { useSettingsSave } from '@/lib/use-settings-save';
import { reportError } from '@/lib/mz';

const GEMINI_FREE_MODEL = 'gemini-3.5-flash-lite';
const PROVIDERS: [string, string][] = [
  ['disabled', 'معطّل'], ['replit', 'Replit AI'], ['deepl', 'DeepL'],
  ['gemini', 'Gemini المجاني'], ['openai', 'OpenAI API'],
];
const NOTES: Record<string, string> = {
  disabled: 'مزود الترجمة معطل. المصادر المفعلة للترجمة ستطبق خيارها عند الفشل: نشر الأصل أو تعليق الرسالة.',
  replit: 'يستخدم Replit AI Integrations للوصول إلى OpenAI دون مفتاح API منك. يُحتسب الاستخدام من أرصدتك؛ لن يُستخدم تلقائياً.',
  deepl: 'يتطلب مفتاح DeepL مضبوطاً على الخادم. لا يحتاج إلى اسم نموذج؛ اختبر الاتصال قبل حفظه.',
  gemini: 'يستخدم Gemini Developer API مباشرةً. النموذجان المتاحان ضمن الخطة المجانية هما gemini-3.5-flash-lite وgemini-3.1-flash-lite؛ اضغط «اختبار الترجمة» للتحقق من صلاحية المفتاح والنموذج. تجاوز الحصة المجانية يختلف عن حد الطلبات، ولا يعالجه تغيير النموذج دائماً. قد تستخدم Google بيانات الخطة المجانية لتحسين خدماتها، وقد تُحسب رسوم بعد تجاوز الحصة إذا كانت الفوترة مفعّلة. لا ينتقل التطبيق تلقائياً إلى مزود آخر.',
  openai: 'يتطلب OPENAI_API_KEY في أسرار Replit. استخدام OpenAI API قد يترتب عليه رسوم من OpenAI؛ لا يُفعّل إلا باختيارك وبعد نجاح الاختبار.',
};

function Form({ s }: { s: Settings }) {
  const qc = useQueryClient();
  const { save, saving } = useSettingsSave();
  const test = useTestTranslation();
  const [p, setP] = useState<string>(s.translationProvider);
  const [model, setModel] = useState(s.translationModel || (
    s.translationProvider === 'gemini' ? GEMINI_FREE_MODEL : s.translationProvider === 'deepl' ? 'deepl-free' : ''
  ));
  const [testResult, setTestResult] = useState<TranslationTestResponse | null>(null);
  const changed = s.translationProvider !== p || s.translationModel !== model.trim();
  const testMatches = testResult?.ok && testResult.provider === p && testResult.model === model.trim();
  const testTranslation = async () => {
    try {
      const result = await test.mutateAsync({
        data: { provider: p as TranslationTestInput['provider'], model: model.trim() },
      });
      setTestResult(result);
      await qc.invalidateQueries({ queryKey: getGetServicesQueryKey() });
    } catch (error) {
      setTestResult(null);
      reportError(error);
    }
  };
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save({ translationProvider: p as Settings['translationProvider'], translationModel: model.trim() }); }}>
      <Field label="مزوّد الترجمة"><Sel value={p} onChange={(e) => {
        const next = e.target.value;
        setP(next);
        setTestResult(null);
        if (next === 'gemini') setModel(GEMINI_FREE_MODEL);
        else if (next === 'replit' || next === 'openai') setModel('gpt-5-mini');
        else if (next === 'deepl') setModel('deepl-free');
      }} options={PROVIDERS} data-testid="select-provider" /></Field>
      <p className="rounded-md border border-border bg-muted/50 p-3 text-sm text-muted-foreground" data-testid="text-provider-note">{NOTES[p]}</p>
      <Field label="النموذج" hint={p === 'gemini' ? 'يمكنك تعديل الاسم؛ لا يُحفظ أو يستخدم قبل نجاح الاختبار، والنماذج المقبولة هنا مجانية فقط.' : p === 'deepl' ? 'يختار DeepL النموذج تلقائياً.' : 'اسم النموذج لدى المزود، حتى 100 حرف'}>
        <Input dir="ltr" maxLength={100} value={model} onChange={(e) => { setModel(e.target.value); setTestResult(null); }} disabled={p === 'disabled' || p === 'deepl'} data-testid="input-model" />
      </Field>
      {changed && p !== 'disabled' && !testMatches && (
        <p className="text-xs text-muted-foreground" data-testid="text-translation-test-required">اختبر المزود والنموذج المحددين بنجاح قبل حفظهما.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => void testTranslation()} disabled={p === 'disabled' || !model.trim() || test.isPending || saving} data-testid="button-test-translation">
          {test.isPending ? 'جارٍ اختبار الترجمة...' : 'اختبار الترجمة'}
        </Button>
        <Button type="submit" disabled={saving || test.isPending || (changed && p !== 'disabled' && !testMatches)} data-testid="button-save-translation">
          {saving ? 'جارٍ الحفظ...' : 'حفظ'}
        </Button>
      </div>
      {testResult && (
        <div
          role="status"
          aria-live="polite"
          data-testid="text-translation-test-result"
          className={`rounded-md border p-3 text-sm ${testResult.ok ? 'border-success/40 bg-success/5 text-success' : 'border-danger/40 bg-danger/5 text-danger'}`}
        >
          <p>{testResult.message}</p>
          {testResult.ok && <p className="mt-2 text-foreground" dir="rtl"><span className="font-semibold">النص التجريبي:</span> {testResult.translatedText}</p>}
        </div>
      )}
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
