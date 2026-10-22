import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Download, FlaskConical, Pencil, Plus, Send, Trash2 } from 'lucide-react';
import {
  getGetChannelsQueryKey, getGetDashboardQueryKey, getGetRoutingQueryKey, useCreateChannel, useDeleteChannel,
  useGetChannels, useTestChannel, useUpdateChannel, type Channel, type ChannelInput,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Empty, ErrorBox, Field, PageHeader, Panel, RowsSkeleton, Sel, StatusBadge } from '@/components/mz-ui';
import {
  channelToInput, defaultChannel, failureLabels, filterLabels, formatLabels, mediaLabels, orderLabels,
  reportError, reportResult, staleLabels,
} from '@/lib/mz';
import { useFmt } from '@/lib/use-fmt';

type Kind = 'source' | 'destination';
const opts = (o: Record<string, string>): [string, string][] => Object.entries(o);

function Toggle({ label, checked, onChange, id }: { label: string; checked: boolean; onChange: (v: boolean) => void; id: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
      <span className="text-sm font-semibold">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} data-testid={`switch-${id}`} />
    </div>
  );
}

function ChannelForm({ kind, editing, onClose }: { kind: Kind; editing: Channel | null; onClose: () => void }) {
  const qc = useQueryClient();
  const create = useCreateChannel();
  const update = useUpdateChannel();
  const [f, setF] = useState<ChannelInput>(editing ? channelToInput(editing) : defaultChannel(kind));
  const set = <K extends keyof ChannelInput>(k: K, v: ChannelInput[K]) => setF((p) => ({ ...p, [k]: v }));
  const pending = create.isPending || update.isPending;
  const valid = f.name.trim().length > 0 && f.username.trim().length >= 3;

  const done = () => {
    qc.invalidateQueries({ queryKey: getGetChannelsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetRoutingQueryKey() });
    qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
    onClose();
  };
  const submit = () => {
    const body = { ...f, name: f.name.trim(), username: f.username.trim(), targetLanguage: f.translate ? f.targetLanguage || 'ar' : f.targetLanguage || 'ar' };
    if (editing) update.mutate({ id: editing.id, data: body }, { onSuccess: done, onError: (e) => reportError(e) });
    else create.mutate({ data: body }, { onSuccess: done, onError: (e) => reportError(e) });
  };
  const src = kind === 'source';

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? 'تعديل' : 'إضافة'} {src ? 'مصدر' : 'وجهة'}</DialogTitle>
          <DialogDescription>{src ? 'قناة أو مجموعة تُقرأ منها الرسائل.' : 'قناة أو مجموعة تُرسل إليها الرسائل.'}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="الاسم"><Input value={f.name} maxLength={120} onChange={(e) => set('name', e.target.value)} data-testid="input-name" /></Field>
          <Field label="اسم المستخدم" hint="مثال: @channel_name"><Input dir="ltr" value={f.username} maxLength={200} onChange={(e) => set('username', e.target.value)} data-testid="input-username" /></Field>
          <div className="sm:col-span-2"><Toggle id="enabled" label="مفعّل" checked={f.enabled} onChange={(v) => set('enabled', v)} /></div>

          {src ? (
            <>
              <div className="sm:col-span-2"><Toggle id="translate" label="ترجمة الرسائل إلى العربية" checked={f.translate} onChange={(v) => { set('translate', v); if (v) set('targetLanguage', 'ar'); }} /></div>
              {f.translate && (
                <Field label="عند فشل الترجمة"><Sel value={f.translationFailure} onChange={(e) => set('translationFailure', e.target.value as ChannelInput['translationFailure'])} options={opts(failureLabels)} data-testid="select-failure" /></Field>
              )}
              <Field label="نوع الرسائل"><Sel value={f.filter} onChange={(e) => set('filter', e.target.value as ChannelInput['filter'])} options={opts(filterLabels)} data-testid="select-filter" /></Field>
              <Field label="الوسائط"><Sel value={f.mediaMode} onChange={(e) => set('mediaMode', e.target.value as ChannelInput['mediaMode'])} options={opts(mediaLabels)} data-testid="select-media" /></Field>
              <div className="sm:col-span-2"><Toggle id="attach" label="إرفاق اسم المصدر" checked={f.attachSource} onChange={(v) => set('attachSource', v)} /></div>
            </>
          ) : (
            <>
              <Field label="الصيغة"><Sel value={f.format} onChange={(e) => set('format', e.target.value as ChannelInput['format'])} options={opts(formatLabels)} data-testid="select-format" /></Field>
              <Field label="الوسائط"><Sel value={f.mediaMode} onChange={(e) => set('mediaMode', e.target.value as ChannelInput['mediaMode'])} options={opts(mediaLabels)} /></Field>
              <div className="sm:col-span-2"><Toggle id="market" label="إرفاق أسعار السوق" checked={f.marketEnabled} onChange={(v) => set('marketEnabled', v)} /></div>
              {f.marketEnabled && (
                <>
                  <Toggle id="gold" label="إظهار الذهب" checked={f.showGold} onChange={(v) => set('showGold', v)} />
                  <Toggle id="btc" label="إظهار البتكوين" checked={f.showBitcoin} onChange={(v) => set('showBitcoin', v)} />
                  <Field label="ترتيب الأسعار"><Sel value={f.marketOrder} onChange={(e) => set('marketOrder', e.target.value as ChannelInput['marketOrder'])} options={opts(orderLabels)} /></Field>
                  <Field label="الأسعار القديمة"><Sel value={f.stalePolicy} onChange={(e) => set('stalePolicy', e.target.value as ChannelInput['stalePolicy'])} options={opts(staleLabels)} /></Field>
                </>
              )}
            </>
          )}
          <Field label="بادئة الرسالة" className="sm:col-span-2"><Textarea rows={2} maxLength={1000} value={f.prefix} onChange={(e) => set('prefix', e.target.value)} data-testid="input-prefix" /></Field>
          <Field label="خاتمة الرسالة" className="sm:col-span-2"><Textarea rows={2} maxLength={1000} value={f.suffix} onChange={(e) => set('suffix', e.target.value)} data-testid="input-suffix" /></Field>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={submit} disabled={!valid || pending} data-testid="button-save-channel">{pending ? 'جارٍ الحفظ...' : 'حفظ'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TestDialog({ channel, onClose }: { channel: Channel; onClose: () => void }) {
  const test = useTestChannel();
  const [confirm, setConfirm] = useState(false);
  const run = (send: boolean) =>
    test.mutate({ id: channel.id, data: { send } }, {
      onSuccess: (r) => { reportResult(r); if (send) { setConfirm(false); } },
      onError: (e) => reportError(e),
    });
  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>اختبار: {channel.name}</DialogTitle>
            <DialogDescription>أضف البوت مشرفاً للقناة مع صلاحية نشر الرسائل أولاً. الفحص لا يرسل شيئاً؛ الإرسال يدفع رسالة اختبار حقيقية إلى القناة.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => run(false)} disabled={test.isPending} data-testid="button-test-check">فحص دون إرسال</Button>
            <Button onClick={() => setConfirm(true)} disabled={test.isPending} data-testid="button-test-send">إرسال رسالة اختبار</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الإرسال</AlertDialogTitle>
            <AlertDialogDescription>سيتم إرسال رسالة حقيقية إلى «{channel.name}». هل تريد المتابعة؟</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={() => run(true)} data-testid="button-confirm-send">نعم، أرسل</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default function ChannelsPage({ kind }: { kind: Kind }) {
  const qc = useQueryClient();
  const q = useGetChannels({ query: { queryKey: getGetChannelsQueryKey(), refetchInterval: 15000 } });
  const update = useUpdateChannel();
  const del = useDeleteChannel();
  const fmt = useFmt();
  const [form, setForm] = useState<{ open: boolean; ch: Channel | null }>({ open: false, ch: null });
  const [testing, setTesting] = useState<Channel | null>(null);
  const [removing, setRemoving] = useState<Channel | null>(null);
  const src = kind === 'source';
  const list = (q.data ?? []).filter((c) => c.kind === kind);

  const toggle = (c: Channel, enabled: boolean) =>
    update.mutate({ id: c.id, data: { ...channelToInput(c), enabled } }, {
      onSuccess: () => qc.invalidateQueries({ queryKey: getGetChannelsQueryKey() }),
      onError: (e) => reportError(e),
    });
  const remove = () => {
    if (!removing) return;
    del.mutate({ id: removing.id }, {
      onSuccess: (r) => {
        if (reportResult(r)) {
          qc.invalidateQueries({ queryKey: getGetChannelsQueryKey() });
          qc.invalidateQueries({ queryKey: getGetRoutingQueryKey() });
          qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        }
        setRemoving(null);
      },
      onError: (e) => { reportError(e); setRemoving(null); },
    });
  };

  return (
    <>
      <PageHeader
        title={src ? 'المصادر' : 'الوجهات'}
        desc={src ? 'القنوات التي تُقرأ منها الرسائل، مع خيارات الترجمة والتصفية.' : 'القنوات التي تُرسل إليها الرسائل، مع البادئة والخاتمة وأسعار السوق.'}
        actions={<Button onClick={() => setForm({ open: true, ch: null })} data-testid="button-add-channel"><Plus /> {src ? 'إضافة مصدر' : 'إضافة وجهة'}</Button>}
      />
      <Panel flush>
        {q.isLoading ? <RowsSkeleton /> : q.isError ? (
          <div className="p-4"><ErrorBox error={q.error} onRetry={() => q.refetch()} /></div>
        ) : list.length === 0 ? (
          <Empty icon={src ? Download : Send} title={src ? 'لا توجد مصادر بعد' : 'لا توجد وجهات بعد'} desc={src ? 'أضف قناة مصدر ليبدأ العامل بقراءة رسائلها.' : 'أضف قناة وجهة لتستقبل الرسائل المحولة.'} action={<Button onClick={() => setForm({ open: true, ch: null })}><Plus /> إضافة</Button>} />
        ) : (
          <ul className="divide-y divide-border">
            {list.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5" data-testid={`row-channel-${c.id}`}>
                <div className="min-w-0 flex-1 basis-56">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold" data-testid={`text-name-${c.id}`}>{c.name}</span>
                    <StatusBadge status={c.status} />
                    {src && c.translate && <span className="rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[11px] font-semibold text-gold">ترجمة</span>}
                  </div>
                  <div className="num text-xs text-muted-foreground">{c.username}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">آخر رسالة: {fmt(c.lastMessageAt)}</div>
                  {c.lastError && <div className="mt-1 text-xs font-semibold text-danger" data-testid={`text-error-${c.id}`}>{c.lastError}</div>}
                </div>
                <Switch checked={c.enabled} onCheckedChange={(v) => toggle(c, v)} disabled={update.isPending} aria-label="تفعيل" data-testid={`switch-enabled-${c.id}`} />
                <div className="flex">
                  <Button variant="ghost" size="icon" aria-label="اختبار" onClick={() => setTesting(c)} data-testid={`button-test-${c.id}`}><FlaskConical /></Button>
                  <Button variant="ghost" size="icon" aria-label="تعديل" onClick={() => setForm({ open: true, ch: c })} data-testid={`button-edit-${c.id}`}><Pencil /></Button>
                  <Button variant="ghost" size="icon" aria-label="حذف" onClick={() => setRemoving(c)} data-testid={`button-delete-${c.id}`}><Trash2 className="text-danger" /></Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {form.open && <ChannelForm key={form.ch?.id ?? 'new'} kind={kind} editing={form.ch} onClose={() => setForm({ open: false, ch: null })} />}
      {testing && <TestDialog channel={testing} onClose={() => setTesting(null)} />}
      <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف «{removing?.name}»؟</AlertDialogTitle>
            <AlertDialogDescription>سيتم حذف القناة وقواعد التوجيه المرتبطة بها. لا يمكن التراجع.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={remove} disabled={del.isPending} data-testid="button-confirm-delete">حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
