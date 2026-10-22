import { useState } from 'react';
import { Eye, Send } from 'lucide-react';
import {
  getGetChannelsQueryKey, useGetChannels, usePreviewMessage, useSendPreviewMessage, type PreviewInput,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Empty, ErrorBox, Field, PageHeader, Panel, RowsSkeleton, Sel } from '@/components/mz-ui';
import { reportError, reportResult, statusInfo } from '@/lib/mz';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function PreviewPage() {
  const ch = useGetChannels({ query: { queryKey: getGetChannelsQueryKey() } });
  const prev = usePreviewMessage();
  const send = useSendPreviewMessage();
  const [s, setS] = useState('');
  const [d, setD] = useState('');
  const [text, setText] = useState('');
  const [previewed, setPreviewed] = useState<PreviewInput | null>(null);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [attemptedPreview, setAttemptedPreview] = useState(false);
  const sources = (ch.data ?? []).filter((c) => c.kind === 'source');
  const dests = (ch.data ?? []).filter((c) => c.kind === 'destination');
  const sid = s || String(sources[0]?.id ?? '');
  const did = d || String(dests[0]?.id ?? '');
  const res = prev.data;
  const currentInput = { sourceId: Number(sid), destinationId: Number(did), text };
  const previewIsCurrent = Boolean(previewed &&
    previewed.sourceId === currentInput.sourceId &&
    previewed.destinationId === currentInput.destinationId &&
    previewed.text === currentInput.text);
  const selectedSource = sources.find((channel) => channel.id === previewed?.sourceId);
  const selectedDestination = dests.find((channel) => channel.id === previewed?.destinationId);

  const previewMessage = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const input = currentInput;
    prev.mutate({ data: input }, {
      onSuccess: () => {
        setPreviewed(input);
        setAttemptedPreview(false);
      },
      onError: (error) => reportError(error),
    });
  };

  const sendMessage = () => {
    if (!previewed || !previewIsCurrent || attemptedPreview || send.isPending) return;
    setAttemptedPreview(true);
    setSendDialogOpen(false);
    send.mutate({ data: previewed }, {
      onSuccess: (result) => { reportResult(result); },
      onError: (error) => reportError(error, 'تعذر إرسال الرسالة'),
    });
  };

  return (
    <>
      <PageHeader title="معاينة الرسالة" desc="راجع الشكل النهائي، ثم أرسل هذه الرسالة يدويًا إلى الوجهة المختارة. هذا لا ينشئ توجيهًا دائمًا." />
      {ch.isLoading ? <Panel flush><RowsSkeleton n={3} /></Panel> : ch.isError ? <ErrorBox error={ch.error} onRetry={() => ch.refetch()} /> : sources.length === 0 || dests.length === 0 ? (
        <Panel><Empty icon={Eye} title="المعاينة تحتاج مصدراً ووجهة" desc="أضف مصدراً ووجهة أولاً." /></Panel>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <Panel title="الإدخال">
            <form className="space-y-4" onSubmit={previewMessage}>
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
                {!previewIsCurrent && <p className="text-sm text-muted-foreground" data-testid="text-preview-stale">غيّرت القناة أو النص؛ أعد المعاينة قبل الإرسال.</p>}
                {attemptedPreview && <p className="text-sm text-warn" data-testid="text-send-attempted">تمت محاولة الإرسال لهذه المعاينة. أعد المعاينة قبل أي محاولة أخرى، وتحقق من الوجهة إذا لم يظهر التأكيد.</p>}
                <Button
                  type="button"
                  onClick={() => setSendDialogOpen(true)}
                  disabled={!previewIsCurrent || attemptedPreview || send.isPending || !selectedSource?.enabled || !selectedDestination?.enabled}
                  data-testid="button-send-preview"
                >
                  <Send /> {send.isPending ? 'جارٍ الإرسال...' : attemptedPreview ? 'أعد المعاينة للمحاولة مجددًا' : 'إرسال مرة واحدة'}
                </Button>
              </div>
            )}
          </Panel>
        </div>
      )}
      <AlertDialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد إرسال الرسالة</AlertDialogTitle>
            <AlertDialogDescription>
              ستُرسل الرسالة المعروضة مرة واحدة إلى «{selectedDestination?.name}». هذا لا ينشئ توجيهًا دائمًا. إذا انقطع الاتصال أثناء الإرسال، تحقّق من القناة قبل المحاولة مجددًا.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel disabled={send.isPending}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => { event.preventDefault(); sendMessage(); }}
              disabled={send.isPending || attemptedPreview || !previewIsCurrent}
              data-testid="button-confirm-preview-send"
            >
              نعم، أرسل الآن
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
