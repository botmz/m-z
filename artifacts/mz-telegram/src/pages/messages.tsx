import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Inbox, RotateCw, Search } from 'lucide-react';
import {
  getGetChannelsQueryKey, getGetDashboardQueryKey, getGetMessagesQueryKey, useGetChannels, useGetMessages,
  useRetryMessage, type GetMessagesParams,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Empty, ErrorBox, PageHeader, Panel, RowsSkeleton, Sel, StatusBadge } from '@/components/mz-ui';
import { reportError, reportResult, statusInfo } from '@/lib/mz';
import { useFmt } from '@/lib/use-fmt';

const STATUSES: [string, string][] = [['', 'كل الحالات'], ['sent', 'تم الإرسال'], ['skipped', 'تم التجاهل'], ['failed', 'فشل'], ['pending', 'قيد الانتظار'], ['held', 'محتجزة'], ['retrying', 'إعادة محاولة تلقائية'], ['processing', 'قيد المعالجة'], ['sending', 'جارٍ الإرسال'], ['unknown', 'إرسال غير مؤكد']];

export default function MessagesPage() {
  const qc = useQueryClient();
  const fmt = useFmt();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState('');
  const [channelId, setChannelId] = useState('');
  useEffect(() => { const t = setTimeout(() => setDebounced(search.trim()), 350); return () => clearTimeout(t); }, [search]);

  const params: GetMessagesParams = {};
  if (debounced) params.search = debounced;
  if (status) params.status = status;
  if (channelId) params.channelId = Number(channelId);

  const q = useGetMessages(params, { query: { queryKey: getGetMessagesQueryKey(params), refetchInterval: 15000 } });
  const ch = useGetChannels({ query: { queryKey: getGetChannelsQueryKey() } });
  const retry = useRetryMessage();
  const [busy, setBusy] = useState<number | null>(null);
  const filtered = !!(debounced || status || channelId);

  const doRetry = (id: number) => {
    setBusy(id);
    retry.mutate({ id }, {
      onSuccess: (r) => { reportResult(r); qc.invalidateQueries({ queryKey: ['/api/mz/messages'] }); qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); },
      onError: (e) => reportError(e),
      onSettled: () => setBusy(null),
    });
  };

  return (
    <>
      <PageHeader title="الرسائل" desc="آخر 200 نتيجة مطابقة مع المصدر والوجهة والمحاولات. يبقى السجل الكامل محفوظاً في قاعدة البيانات." />
      <div className="mb-4 grid gap-2 md:grid-cols-[1fr_12rem_14rem]">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث في نص الرسائل" className="ps-9" aria-label="بحث" data-testid="input-search" />
        </div>
        <Sel value={status} onChange={(e) => setStatus(e.target.value)} options={STATUSES} aria-label="الحالة" data-testid="select-status" />
        <Sel value={channelId} onChange={(e) => setChannelId(e.target.value)} aria-label="القناة" data-testid="select-channel" options={[['', 'كل القنوات'], ...(ch.data ?? []).map((c): [string, string] => [String(c.id), c.name])]} />
      </div>
      <Panel flush>
        {q.isLoading ? <RowsSkeleton n={5} /> : q.isError ? (
          <div className="p-4"><ErrorBox error={q.error} onRetry={() => q.refetch()} /></div>
        ) : (q.data ?? []).length === 0 ? (
          <Empty icon={Inbox} title={filtered ? 'لا نتائج مطابقة' : 'لا توجد رسائل بعد'} desc={filtered ? 'غيّر البحث أو المرشحات.' : 'ستظهر الرسائل هنا بعد أن يعالجها العامل.'} />
        ) : (
          <ul className="divide-y divide-border">
            {q.data!.map((m) => (
              <li key={m.id} className="space-y-2 px-4 py-3.5" data-testid={`row-message-${m.id}`}>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <StatusBadge status={m.status} />
                  <span className="font-semibold text-foreground">{m.sourceName} ← {m.destinationName}</span>
                  <span>الترجمة: {statusInfo(m.translationStatus).label}</span>
                  <span>المحاولات: <span className="num">{m.attempts}</span></span>
                  <span className="ms-auto">{fmt(m.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap break-words text-sm">{m.text}</p>
                {m.error && <p className="text-xs font-semibold text-danger" data-testid={`text-error-${m.id}`}>{m.error}</p>}
                {(m.status === 'failed' || m.status === 'held') && (
                  <Button size="sm" variant="outline" onClick={() => doRetry(m.id)} disabled={busy === m.id} data-testid={`button-retry-${m.id}`}>
                    <RotateCw className={busy === m.id ? 'animate-spin' : ''} /> إعادة المحاولة
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
