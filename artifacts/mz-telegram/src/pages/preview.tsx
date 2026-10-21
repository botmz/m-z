import { useState } from 'react';
import { Eye } from 'lucide-react';
import { getGetChannelsQueryKey, useGetChannels, usePreviewMessage } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Empty, ErrorBox, Field, PageHeader, Panel, RowsSkeleton, Sel } from '@/components/mz-ui';
import { reportError, statusInfo } from '@/lib/mz';

export default function PreviewPage() {
  const ch = useGetChannels({ query: { queryKey: getGetChannelsQueryKey() } });
  const prev = usePreviewMessage();
  const [s, setS] = useState('');
  const [d, setD] = useState('');
  const [text, setText] = useState('');
  const sources = (ch.data ?? []).filter((c) => c.kind === 'source');
  const dests = (ch.data ?? []).filter((c) => c.kind === 'destination');
  const sid = s || String(sources[0]?.id ?? '');
  const did = d || String(dests[0]?.id ?? '');
  const res = prev.data;

  return (
    <>
      <PageHeader title="معاينة الرسالة" desc="جرّب نصاً لترى الشكل النهائي بعد الترجمة والبادئة والخاتمة. لا يُرسل شيء إلى تيليجرام." />
      {ch.isLoading ? <Panel flush><RowsSkeleton n={3} /></Panel> : ch.isError ? <ErrorBox error={ch.error} onRetry={() => ch.refetch()} /> : sources.length === 0 || dests.length === 0 ? (
        <Panel><Empty icon={Eye} title="المعاينة تحتاج مصدراً ووجهة" desc="أضف مصدراً ووجهة أولاً." /></Panel>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <Panel title="الإدخال">
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); prev.mutate({ data: { sourceId: Number(sid), destinationId: Number(did), text } }, { onError: (er) => reportError(er) }); }}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="المصدر"><Sel value={sid} onChange={(e) => setS(e.target.value)} options={sources.map((c): [string, string] => [String(c.id), c.name])} data-testid="select-source" /></Field>
                <Field label="الوجهة"><Sel value={did} onChange={(e) => setD(e.target.value)} options={dests.map((c): [string, string] => [String(c.id), c.name])} data-testid="select-destination" /></Field>
              </div>
              <Field label="نص الرسالة" hint={`${text.length} / 4096`}><Textarea rows={8} maxLength={4096} value={text} onChange={(e) => setText(e.target.value)} data-testid="input-text" /></Field>
              <Button type="submit" disabled={!text.trim() || prev.isPending} data-testid="button-preview">{prev.isPending ? 'جارٍ التجهيز...' : 'معاينة'}</Button>
            </form>
          </Panel>
          <Panel title="النتيجة">
            {prev.isError ? <ErrorBox error={prev.error} /> : !res ? (
              <Empty icon={Eye} title="لا توجد معاينة بعد" desc="أدخل نصاً واضغط معاينة." />
            ) : (
              <div className="space-y-3" data-testid="preview-result">
                <div className="text-xs text-muted-foreground">حالة الترجمة: <span className="font-bold text-foreground">{statusInfo(res.translationStatus).label}</span></div>
                <div className="whitespace-pre-wrap break-words rounded-lg border border-gold/40 bg-gold/5 p-4 text-sm leading-7" data-testid="text-preview">{res.text}</div>
                {res.warnings.length > 0 && (
                  <ul className="space-y-1" data-testid="list-warnings">
                    {res.warnings.map((w, i) => <li key={i} className="rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">{w}</li>)}
                  </ul>
                )}
              </div>
            )}
          </Panel>
        </div>
      )}
    </>
  );
}
