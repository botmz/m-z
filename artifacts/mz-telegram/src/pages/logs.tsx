import { useEffect, useState } from 'react';
import { ScrollText, Search } from 'lucide-react';
import { getGetLogsQueryKey, useGetLogs, type GetLogsParams } from '@workspace/api-client-react';
import { Input } from '@/components/ui/input';
import { Empty, ErrorBox, PageHeader, Panel, RowsSkeleton, Sel, StatusBadge } from '@/components/mz-ui';
import { useFmt } from '@/lib/use-fmt';

const LEVELS: [string, string][] = [['', 'كل المستويات'], ['info', 'معلومة'], ['warn', 'تحذير'], ['error', 'خطأ']];

export default function LogsPage() {
  const fmt = useFmt();
  const [search, setSearch] = useState('');
  const [deb, setDeb] = useState('');
  const [level, setLevel] = useState('');
  useEffect(() => { const t = setTimeout(() => setDeb(search.trim()), 350); return () => clearTimeout(t); }, [search]);
  const params: GetLogsParams = {};
  if (deb) params.search = deb;
  if (level) params.level = level;
  const q = useGetLogs(params, { query: { queryKey: getGetLogsQueryKey(params), refetchInterval: 15000 } });
  const filtered = !!(deb || level);

  return (
    <>
      <PageHeader title="السجلات" desc="آخر 200 حدث مطابق كما سجله الخادم، مع تحديث كل 15 ثانية." />
      <div className="mb-4 grid gap-2 md:grid-cols-[1fr_14rem]">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث في السجلات" className="ps-9" aria-label="بحث" data-testid="input-search" />
        </div>
        <Sel value={level} onChange={(e) => setLevel(e.target.value)} options={LEVELS} aria-label="المستوى" data-testid="select-level" />
      </div>
      <Panel flush>
        {q.isLoading ? <RowsSkeleton n={6} /> : q.isError ? (
          <div className="p-4"><ErrorBox error={q.error} onRetry={() => q.refetch()} /></div>
        ) : (q.data ?? []).length === 0 ? (
          <Empty icon={ScrollText} title={filtered ? 'لا نتائج مطابقة' : 'لا توجد سجلات'} desc={filtered ? 'غيّر البحث أو المستوى.' : 'لم يسجل النظام أي حدث بعد.'} />
        ) : (
          <ul className="divide-y divide-border">
            {q.data!.map((l) => (
              <li key={l.id} className="flex flex-wrap items-start gap-3 px-4 py-3" data-testid={`row-log-${l.id}`}>
                <StatusBadge status={l.level} />
                <div className="min-w-0 flex-1 basis-60">
                  <p className="break-words text-sm">{l.message}</p>
                  <div className="text-[11px] text-muted-foreground">{l.category}</div>
                </div>
                <span className="text-xs text-muted-foreground">{fmt(l.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
