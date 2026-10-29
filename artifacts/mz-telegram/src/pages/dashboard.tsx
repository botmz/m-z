import { Link } from 'wouter';
import { RefreshCw, Inbox, ScrollText, AlertTriangle, GitFork } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getGetDashboardQueryKey, useGetDashboard } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Empty, ErrorBox, PageHeader, Panel, RowsSkeleton, StatusBadge } from '@/components/mz-ui';
import { Skeleton } from '@/components/ui/skeleton';
import { useFmt } from '@/lib/use-fmt';
import { cn } from '@/lib/utils';

function Stat({ label, value, tone, id }: { label: string; value: number; tone?: string; id: string }) {
  return (
    <div className="rise rounded-lg border border-card-border bg-card p-4">
      <div className="text-xs font-semibold text-muted-foreground">{label}</div>
      <div className={cn('num mt-2 text-3xl font-extrabold', tone)} data-testid={`stat-${id}`}>{value.toLocaleString('en-US')}</div>
    </div>
  );
}

export default function Dashboard() {
  const q = useGetDashboard({ query: { queryKey: getGetDashboardQueryKey(), refetchInterval: 15000 } });
  const fmt = useFmt();
  const d = q.data;

  return (
    <>
      <PageHeader
        title="لوحة التحكم"
        desc="الحالة الفعلية للعامل واتصال تيليجرام ونشاط اليوم، وتتحدث تلقائياً كل 15 ثانية."
        actions={<Button variant="outline" onClick={() => q.refetch()} disabled={q.isFetching} data-testid="button-refresh"><RefreshCw className={q.isFetching ? 'animate-spin' : ''} /> تحديث</Button>}
      />
      {q.isLoading && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      )}
      {q.isError && <ErrorBox error={q.error} onRetry={() => q.refetch()} />}
      {d && (
        <div className="space-y-5">
          {d.workerStatus === 'stale' && (
            <div role="alert" className="flex items-start gap-3 rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger" data-testid="alert-worker-stale">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-semibold">توقفت نبضات عامل المعالجة</p>
                <p className="mt-1">لم تصل نبضة حديثة خلال المهلة المحددة. تحقّق من خدمة العامل قبل الاعتماد على تحويل الرسائل.</p>
              </div>
            </div>
          )}
          {d.sources > 0 && d.destinations > 0 && d.routingRules === 0 && (
            <div role="alert" className="flex items-start gap-3 rounded-lg border border-warn/40 bg-warn/10 p-4 text-sm text-warn" data-testid="alert-no-routing">
              <GitFork className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-semibold">القنوات جاهزة، لكن لا توجد قواعد توجيه محفوظة</p>
                <p className="mt-1">لن تُرسل الرسائل تلقائياً حتى تختار وجهة لكل مصدر.</p>
                <Link href="/routing" className="mt-2 inline-flex font-semibold underline underline-offset-2 hover:text-foreground" data-testid="link-configure-routing">إعداد التوجيه</Link>
              </div>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rise flex items-center justify-between rounded-lg border border-gold/40 bg-gradient-to-l from-gold/10 to-card p-4">
              <div><div className="text-xs font-semibold text-muted-foreground">العامل</div><div className="mt-1 text-lg font-bold">خدمة التحويل</div></div>
              <StatusBadge status={d.workerStatus} />
            </div>
            <div className="rise flex items-center justify-between rounded-lg border border-card-border bg-card p-4">
              <div><div className="text-xs font-semibold text-muted-foreground">تيليجرام</div><div className="mt-1 text-lg font-bold">جلسة الاتصال</div></div>
              <StatusBadge status={d.telegramStatus} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat id="sources" label="المصادر" value={d.sources} />
            <Stat id="destinations" label="الوجهات" value={d.destinations} />
            <Stat id="processed" label="معالجة اليوم" value={d.processedToday} />
            <Stat id="sent" label="أُرسلت اليوم" value={d.sentToday} tone="text-success" />
            <Stat id="failed" label="فاشلة" value={d.failed} tone={d.failed > 0 ? 'text-danger' : undefined} />
            <Stat id="pending" label="قيد الانتظار" value={d.pending} tone={d.pending > 0 ? 'text-warn' : undefined} />
          </div>

          <Panel title="النشاط بالساعة">
            {d.activity.length === 0 ? (
              <Empty icon={Inbox} title="لا يوجد نشاط مسجل بعد" desc="سيظهر الرسم عند معالجة أول رسالة." />
            ) : (
              <div className="h-56 w-full" dir="ltr">
                <ResponsiveContainer>
                  <BarChart data={d.activity} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="hour" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                    <Bar dataKey="sent" name="أُرسلت" fill="hsl(var(--success))" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="failed" name="فاشلة" fill="hsl(var(--danger))" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="آخر الرسائل" flush actions={<Link href="/messages" className="text-xs font-semibold text-gold hover:underline">عرض الكل</Link>}>
              {d.recentMessages.length === 0 ? (
                <Empty icon={Inbox} title="لا توجد رسائل" desc="لم تتم معالجة أي رسالة حتى الآن." />
              ) : (
                <ul className="divide-y divide-border">
                  {d.recentMessages.map((m) => (
                    <li key={m.id} className="space-y-1 px-4 py-3" data-testid={`row-message-${m.id}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs text-muted-foreground">{m.sourceName} ← {m.destinationName}</span>
                        <StatusBadge status={m.status} />
                      </div>
                      <p className="line-clamp-2 text-sm">{m.text}</p>
                      <div className="text-[11px] text-muted-foreground">{fmt(m.createdAt)}</div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel title="آخر السجلات" flush actions={<Link href="/logs" className="text-xs font-semibold text-gold hover:underline">عرض الكل</Link>}>
              {d.recentLogs.length === 0 ? (
                <Empty icon={ScrollText} title="لا توجد سجلات" desc="ستظهر الأحداث هنا فور حدوثها." />
              ) : (
                <ul className="divide-y divide-border">
                  {d.recentLogs.map((l) => (
                    <li key={l.id} className="flex items-start gap-3 px-4 py-3" data-testid={`row-log-${l.id}`}>
                      <StatusBadge status={l.level} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm">{l.message}</p>
                        <div className="text-[11px] text-muted-foreground">{l.category} · {fmt(l.createdAt)}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>
      )}
      {q.isLoading && <RowsSkeleton n={3} />}
    </>
  );
}
