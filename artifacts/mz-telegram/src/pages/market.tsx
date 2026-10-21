import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowDownRight, ArrowUpRight, Minus, RefreshCw, TrendingUp } from 'lucide-react';
import { getGetMarketQueryKey, useGetMarket, useRefreshMarket, type Settings } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Empty, ErrorBox, Field, PageHeader, Panel, RowsSkeleton } from '@/components/mz-ui';
import { reportError, reportResult } from '@/lib/mz';
import { useFmt } from '@/lib/use-fmt';
import { useSettingsSave } from '@/lib/use-settings-save';
import { cn } from '@/lib/utils';

function SettingsForm({ s }: { s: Settings }) {
  const { save, saving } = useSettingsSave();
  const [iv, setIv] = useState(String(s.marketInterval));
  const [st, setSt] = useState(String(s.marketStaleMinutes));
  const ivN = Number(iv), stN = Number(st);
  const bad = !(ivN >= 60 && ivN <= 86400) || !(stN >= 1 && stN <= 1440);
  return (
    <form className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); save({ marketInterval: Math.round(ivN), marketStaleMinutes: Math.round(stN) }); }}>
      <Field label="فترة التحديث (ثانية)" hint="60 ثانية على الأقل"><Input type="number" min={60} max={86400} value={iv} onChange={(e) => setIv(e.target.value)} data-testid="input-market-interval" /></Field>
      <Field label="اعتبار السعر قديماً بعد (دقيقة)" hint="من 1 إلى 1440"><Input type="number" min={1} max={1440} value={st} onChange={(e) => setSt(e.target.value)} data-testid="input-stale-minutes" /></Field>
      <Button type="submit" disabled={bad || saving} data-testid="button-save-market">{saving ? 'جارٍ الحفظ...' : 'حفظ'}</Button>
    </form>
  );
}

export default function MarketPage() {
  const qc = useQueryClient();
  const fmt = useFmt();
  const q = useGetMarket({ query: { queryKey: getGetMarketQueryKey(), refetchInterval: 15000 } });
  const refresh = useRefreshMarket();
  const { query: sq } = useSettingsSave();

  const doRefresh = () => refresh.mutate(undefined, {
    onSuccess: (r) => { reportResult(r); qc.invalidateQueries({ queryKey: getGetMarketQueryKey() }); },
    onError: (e) => reportError(e),
  });

  return (
    <>
      <PageHeader
        title="أسعار السوق"
        desc="الأسعار من مزودها؛ الاتجاه مقارنة بآخر قراءة ناجحة. تُرفق الأسعار بالمنشورات الجديدة فقط، ولا تُعدّل المنشورات السابقة."
        actions={<Button onClick={doRefresh} disabled={refresh.isPending} data-testid="button-refresh-market"><RefreshCw className={refresh.isPending ? 'animate-spin' : ''} /> تحديث الآن</Button>}
      />
      <Panel flush className="mb-5">
        {q.isLoading ? <RowsSkeleton n={2} /> : q.isError ? (
          <div className="p-4"><ErrorBox error={q.error} onRetry={() => q.refetch()} /></div>
        ) : (q.data ?? []).length === 0 ? (
          <Empty icon={TrendingUp} title="لا توجد أسعار بعد" desc="لم يجلب النظام أي سعر. اضغط تحديث الآن للمحاولة." />
        ) : (
          <div className="grid gap-px bg-border sm:grid-cols-2">
            {q.data!.map((m) => {
              const Icon = m.direction === 'up' ? ArrowUpRight : m.direction === 'down' ? ArrowDownRight : Minus;
              const tone = m.direction === 'up' ? 'text-success' : m.direction === 'down' ? 'text-danger' : 'text-muted-foreground';
              const pct = m.previousPrice ? ((m.price - m.previousPrice) / m.previousPrice) * 100 : null;
              return (
                <div key={m.symbol} className="bg-card p-5" data-testid={`card-quote-${m.symbol}`}>
                  <div className="flex items-center justify-between">
                    <span className="num font-bold text-gold">{m.symbol}</span>
                    {m.stale && <span className="rounded-full border border-warn/40 bg-warn/10 px-2 py-0.5 text-xs font-semibold text-warn">قديم</span>}
                  </div>
                  <div className="mt-3 flex items-baseline gap-3">
                    <span className="num text-4xl font-extrabold" data-testid={`text-price-${m.symbol}`}>{m.price.toLocaleString('en-US', { maximumFractionDigits: 4 })}</span>
                    <span className={cn('flex items-center gap-1 text-sm font-bold', tone)}>
                      <Icon className="size-4" />
                      {pct !== null && <span className="num">{Math.abs(pct).toFixed(2)}%</span>}
                    </span>
                  </div>
                  <div className="mt-3 space-y-0.5 text-xs text-muted-foreground">
                    <div>السابق: <span className="num">{m.previousPrice === null ? 'غير متاح' : m.previousPrice.toLocaleString('en-US', { maximumFractionDigits: 4 })}</span></div>
                    <div>المزوّد: {m.provider} · {fmt(m.updatedAt)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
      <Panel title="إعدادات السوق">
        {sq.isLoading ? <RowsSkeleton n={1} /> : sq.isError ? <ErrorBox error={sq.error} onRetry={() => sq.refetch()} /> : sq.data && <SettingsForm key={JSON.stringify(sq.data)} s={sq.data} />}
      </Panel>
    </>
  );
}
