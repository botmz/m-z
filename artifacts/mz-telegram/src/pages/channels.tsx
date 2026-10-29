import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Download, FlaskConical, Pencil, Plus, Send, Trash2 } from 'lucide-react';
import {
  getGetChannelsQueryKey, getGetDashboardQueryKey, getGetRoutingQueryKey, useCreateChannel, useDeleteChannel,
  useGetChannels, useGetRouting, useSaveChannelRouting, useTestChannel, useUpdateChannel, type Channel, type ChannelInput,
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
  channelToInput, defaultChannel, filterLabels, formatLabels, mediaLabels, orderLabels,
  reportError, reportResult, staleLabels,
} from '@/lib/mz';
import { useFmt } from '@/lib/use-fmt';
import { Link } from 'wouter';

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

function ChannelForm({
  kind, editing, onClose, destinations, destinationsLoading, destinationsError, retryDestinations,
}: {
  kind: Kind;
  editing: Channel | null;
  onClose: () => void;
  destinations: Channel[];
  destinationsLoading: boolean;
  destinationsError: boolean;
  retryDestinations: () => void;
}) {
  const qc = useQueryClient();
  const create = useCreateChannel();
  const update = useUpdateChannel();
  const saveRouting = useSaveChannelRouting();
  const src = kind === 'source';
  const routeQuery = useGetRouting({ query: { queryKey: getGetRoutingQueryKey(), enabled: src && Boolean(editing) } });
  const [f, setF] = useState<ChannelInput>(editing ? channelToInput(editing) : defaultChannel(kind));
  const [selectedDestinations, setSelectedDestinations] = useState<number[]>([]);
  const [routesHydrated, setRoutesHydrated] = useState(!src || !editing);
  const [createdChannel, setCreatedChannel] = useState<Channel | null>(null);
  const [routeSaveError, setRouteSaveError] = useState('');
  const set = <K extends keyof ChannelInput>(k: K, v: ChannelInput[K]) => setF((p) => ({ ...p, [k]: v }));
  const pending = create.isPending || update.isPending || saveRouting.isPending;
  const valid = f.name.trim().length > 0 && f.username.trim().length >= 3;
  const routingReady = !src || (!destinationsLoading && !destinationsError && routesHydrated);

  useEffect(() => {
    if (!src || !editing || !routeQuery.data) return;
    setSelectedDestinations(routeQuery.data.filter((route) => route.sourceId === editing.id).map((route) => route.destinationId));
    setRoutesHydrated(true);
  }, [src, editing, routeQuery.data]);

  const done = () => {
    qc.invalidateQueries({ queryKey: getGetChannelsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetRoutingQueryKey() });
    qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
    onClose();
  };
  const submit = async () => {
    setRouteSaveError('');
    const body = {
      ...f,
      name: f.name.trim(),
      username: f.username.trim(),
    };
    const existing = editing ?? createdChannel;
    let channelSaved = false;
    try {
      const saved = existing
        ? await update.mutateAsync({ id: existing.id, data: body })
        : await create.mutateAsync({ data: body });
      channelSaved = true;
      if (!existing && src) setCreatedChannel(saved);
      if (src) {
        await saveRouting.mutateAsync({ id: saved.id, data: { destinationIds: selectedDestinations } });
      }
      done();
    } catch (error) {
      if (channelSaved && src) {
        setRouteSaveError('تم حفظ بيانات المصدر، لكن تعذّر حفظ وجهاته. أعد المحاولة؛ لن تتغير وجهات المصادر الأخرى.');
      }
      reportError(error);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? 'تعديل' : 'إضافة'} {src ? 'مصدر' : 'وجهة'}</DialogTitle>
          <DialogDescription>{src ? 'قناة أو مجموعة تُقرأ منها الرسائل.' : 'قناة أو مجموعة تُرسل إليها الرسائل.'}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="الاسم"><Input value={f.name} maxLength={120} onChange={(e) => set('name', e.target.value)} data-testid="input-name" /></Field>
          <Field label="اسم المستخدم" hint="مثال: @channel_name؛ الأحرف الكبيرة والصغيرة مقبولة"><Input dir="ltr" value={f.username} maxLength={200} onChange={(e) => set('username', e.target.value)} data-testid="input-username" /></Field>
          <div className="sm:col-span-2"><Toggle id="enabled" label="مفعّل" checked={f.enabled} onChange={(v) => set('enabled', v)} /></div>

          {src ? (
            <>
              <div className="sm:col-span-2 space-y-1.5">
                <div id="source-destinations-label" className="text-sm font-semibold">قنوات الوجهة</div>
                <p className="text-xs text-muted-foreground">اختر يدوياً وجهة واحدة أو أكثر؛ لن تصل الرسائل إلى الوجهات غير المحددة.</p>
                {destinationsLoading ? (
                  <p className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">جارٍ تحميل الوجهات...</p>
                ) : destinationsError ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-danger/40 px-3 py-2">
                    <span className="text-sm text-danger">تعذّر تحميل قائمة الوجهات؛ أعد المحاولة قبل الحفظ.</span>
                    <Button type="button" variant="outline" size="sm" onClick={retryDestinations}>إعادة المحاولة</Button>
                  </div>
                ) : editing && routeQuery.isLoading ? (
                  <p className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">جارٍ تحميل الربط المحفوظ...</p>
                ) : editing && routeQuery.isError ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-danger/40 px-3 py-2">
                    <span className="text-sm text-danger">تعذّر تحميل وجهات هذا المصدر؛ أعد المحاولة قبل الحفظ.</span>
                    <Button type="button" variant="outline" size="sm" onClick={() => { void routeQuery.refetch(); }}>إعادة المحاولة</Button>
                  </div>
                ) : destinations.length === 0 ? (
                  <p className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">لا توجد وجهات بعد؛ احفظ المصدر دون توجيه أو أضف وجهة أولاً.</p>
                ) : (
                  <div className="space-y-2">
                    <div className="grid max-h-40 gap-2 overflow-y-auto sm:grid-cols-2" role="group" aria-labelledby="source-destinations-label">
                      {destinations.map((destination) => {
                        const selected = selectedDestinations.includes(destination.id);
                        return (
                          <button
                            key={destination.id}
                            type="button"
                            aria-pressed={selected}
                            aria-label={`${destination.name}${destination.enabled ? '' : '، معطلة'}`}
                            onClick={() => setSelectedDestinations((current) => (
                              selected
                                ? current.filter((id) => id !== destination.id)
                                : [...current, destination.id]
                            ))}
                            data-testid={`toggle-source-destination-${destination.id}`}
                            className={`flex min-w-0 items-center justify-between gap-3 rounded-md border px-3 py-2 text-right text-sm transition-colors ${
                              selected ? 'border-gold bg-gold/10 text-gold' : 'border-border hover:border-gold/50'
                            }`}
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="min-w-0">
                                <span className="block truncate font-semibold">{destination.name}</span>
                                <span dir="ltr" className="block truncate text-xs text-muted-foreground">{destination.username}</span>
                              </span>
                              {!destination.enabled && <span className="shrink-0 rounded-full border border-warn/40 px-2 py-0.5 text-[10px] font-semibold text-warn">معطّلة</span>}
                            </span>
                            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                              selected ? 'border-gold bg-gold text-background' : 'border-muted-foreground/50'
                            }`}>
                              {selected && <Check size={14} aria-hidden="true" />}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-xs text-muted-foreground" data-testid="text-source-route-count">
                      {selectedDestinations.length === 0
                        ? 'لا توجد وجهات محددة؛ لن تُرسل رسائل هذا المصدر تلقائياً.'
                        : `محدد ${selectedDestinations.length} من ${destinations.length} وجهة.`}
                    </p>
                  </div>
                )}
              </div>
              {routeSaveError && <div className="sm:col-span-2 rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger" role="alert" data-testid="text-route-save-error">{routeSaveError}</div>}
              <div className="sm:col-span-2">
                <Toggle id="skip-links" label="حذف الروابط افتراضياً" checked={f.skipMessagesWithLinks} onChange={(v) => set('skipMessagesWithLinks', v)} />
                <p className="mt-1 text-xs text-muted-foreground">هذه قيمة افتراضية للمسارات الجديدة؛ إعداد «حذف الروابط من الرسائل» المحفوظ لكل مسار له الأولوية. يبقى توقيع الوجهة كما ضبطته، وتبقى الكلمات المرتبطة برابط مخفي كنص عادي.</p>
              </div>
              <Field label="نوع الرسائل"><Sel value={f.filter} onChange={(e) => set('filter', e.target.value as ChannelInput['filter'])} options={opts(filterLabels)} data-testid="select-filter" /></Field>
              <Field label="الوسائط"><Sel value={f.mediaMode} onChange={(e) => set('mediaMode', e.target.value as ChannelInput['mediaMode'])} options={opts(mediaLabels)} data-testid="select-media" /></Field>
              <div className="sm:col-span-2"><Toggle id="attach" label="إرفاق اسم المصدر" checked={f.attachSource} onChange={(v) => set('attachSource', v)} /></div>
            </>
          ) : (
            <>
              <Field label="الصيغة"><Sel value={f.format} onChange={(e) => set('format', e.target.value as ChannelInput['format'])} options={opts(formatLabels)} data-testid="select-format" /></Field>
              <Field label="الوسائط"><Sel value={f.mediaMode} onChange={(e) => set('mediaMode', e.target.value as ChannelInput['mediaMode'])} options={opts(mediaLabels)} /></Field>
              <div className="sm:col-span-2"><Toggle id="market" label="إرفاق أسعار السوق" checked={f.marketEnabled} onChange={(v) => set('marketEnabled', v)} /></div>
              <div className="sm:col-span-2"><Toggle id="signature-enabled" label="إضافة التوقيع الثابت بعد الرسالة" checked={f.signatureEnabled} onChange={(v) => set('signatureEnabled', v)} /></div>
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
          {!src && (
            <>
              <Field label="بادئة الرسالة" className="sm:col-span-2"><Textarea rows={2} maxLength={1000} value={f.prefix} onChange={(e) => set('prefix', e.target.value)} data-testid="input-prefix" /></Field>
              <Field label="نص التوقيع الثابت" className="sm:col-span-2">
                <Textarea rows={2} maxLength={1000} value={f.suffix} onChange={(e) => set('suffix', e.target.value)} data-testid="input-suffix" />
                <p className="mt-1 text-xs text-muted-foreground">يُضاف بعد محتوى الرسالة إلى هذه الوجهة فقط عند تفعيل التوقيع.</p>
              </Field>
            </>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={submit} disabled={!valid || !routingReady || pending} data-testid="button-save-channel">{pending ? 'جارٍ الحفظ...' : 'حفظ'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TestDialog({ channel, onClose }: { channel: Channel; onClose: () => void }) {
  const test = useTestChannel();
  const [sourceResult, setSourceResult] = useState<{ ok: boolean; message: string } | null>(null);
  const source = channel.kind === 'source';
  const needsReaderAuth = source && sourceResult && !sourceResult.ok && /(MTProto|تفويض)/i.test(sourceResult.message);
  const run = () => {
    setSourceResult(null);
    test.mutate({ id: channel.id, data: { send: false } }, {
      onSuccess: (r) => {
        if (source) setSourceResult(r);
        else reportResult(r);
      },
      onError: (e) => reportError(e),
    });
  };
  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>اختبار: {channel.name}</DialogTitle>
            <DialogDescription>
              {source
                ? 'يفحص صلاحية القراءة بحساب Telegram المفوّض (MTProto) فقط؛ لا ينشر أي رسالة. فعّل العامل من صفحة الخدمات لبدء تحويل الرسائل.'
                : 'أضف البوت مشرفاً في الوجهة مع صلاحية نشر الرسائل. يفحص الاتصال والصلاحية دون نشر أي رسالة.'}
            </DialogDescription>
          </DialogHeader>
          {source && sourceResult && (
            <div
              className={`space-y-2 rounded-md border px-3 py-2 text-sm ${
                sourceResult.ok ? 'border-success/30 bg-success/10 text-success' : 'border-danger/30 bg-danger/10 text-danger'
              }`}
              role={sourceResult.ok ? 'status' : 'alert'}
              aria-live="polite"
              data-testid="source-test-result"
            >
              <p>{sourceResult.message}</p>
              {needsReaderAuth && (
                <Link
                  href="/services"
                  className="inline-flex rounded-md border border-gold/50 px-3 py-1.5 font-semibold text-gold hover:bg-gold/10"
                  data-testid="link-reader-authorization"
                >
                  تفويض حساب القراءة من الخدمات
                </Link>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            {source ? (
              <Button variant="outline" onClick={run} disabled={test.isPending} data-testid="button-test-check">فحص صلاحية القراءة</Button>
            ) : (
              <Button variant="outline" onClick={run} disabled={test.isPending} data-testid="button-test-check">فحص صلاحية النشر دون إرسال</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
  const destinations = (q.data ?? []).filter((c) => c.kind === 'destination');

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
        desc={src ? 'القنوات التي تُقرأ منها الرسائل، مع خيارات التصفية والروابط.' : 'القنوات التي تُرسل إليها الرسائل، مع البادئة والخاتمة وأسعار السوق.'}
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
      {form.open && <ChannelForm
        key={form.ch?.id ?? 'new'}
        kind={kind}
        editing={form.ch}
        destinations={destinations}
        destinationsLoading={q.isLoading}
        destinationsError={q.isError}
        retryDestinations={() => { void q.refetch(); }}
        onClose={() => setForm({ open: false, ch: null })}
      />}
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
