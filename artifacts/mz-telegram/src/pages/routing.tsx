import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { GitFork, RotateCcw, Save } from 'lucide-react';
import {
  getGetChannelsQueryKey, getGetRoutingQueryKey, useGetChannels, useGetRouting, useSaveChannelRouting,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Empty, ErrorBox, PageHeader, Panel, RowsSkeleton } from '@/components/mz-ui';
import { reportError, reportResult } from '@/lib/mz';
import { cn } from '@/lib/utils';

const key = (s: number, d: number) => `${s}:${d}`;
const signature = (routes: Set<string>, hidden: Set<string>) =>
  `${[...routes].sort().join('|')}#${[...hidden].sort().join('|')}`;

export default function RoutingPage() {
  const qc = useQueryClient();
  const ch = useGetChannels({ query: { queryKey: getGetChannelsQueryKey() } });
  const rt = useGetRouting({ query: { queryKey: getGetRoutingQueryKey() } });
  const save = useSaveChannelRouting();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [hide, setHide] = useState<Set<string>>(new Set());
  const [baseSel, setBaseSel] = useState<Set<string>>(new Set());
  const [baseHide, setBaseHide] = useState<Set<string>>(new Set());
  const init = useRef(false);

  useEffect(() => {
    if (rt.data && !init.current) {
      init.current = true;
      const s = new Set(rt.data.map((r) => key(r.sourceId, r.destinationId)));
      const h = new Set(rt.data.filter((r) => r.hideSourceLink).map((r) => key(r.sourceId, r.destinationId)));
      setSel(s);
      setHide(h);
      setBaseSel(new Set(s));
      setBaseHide(new Set(h));
    }
  }, [rt.data]);

  const sources = (ch.data ?? []).filter((c) => c.kind === 'source');
  const dests = (ch.data ?? []).filter((c) => c.kind === 'destination');
  const dirty = signature(sel, hide) !== signature(baseSel, baseHide);

  const flip = (route: string) => {
    const removing = sel.has(route);
    setSel((p) => {
      const n = new Set(p);
      removing ? n.delete(route) : n.add(route);
      return n;
    });
    if (removing) setHide((current) => {
      const next = new Set(current);
      next.delete(route);
      return next;
    });
  };
  const toggleHide = (route: string) => setHide((p) => {
    const n = new Set(p);
    n.has(route) ? n.delete(route) : n.add(route);
    return n;
  });
  const clearSource = (sourceId: number) => {
    setSel((p) => new Set([...p].filter((route) => !route.startsWith(`${sourceId}:`))));
    setHide((p) => new Set([...p].filter((route) => !route.startsWith(`${sourceId}:`))));
  };
  const reset = () => {
    setSel(new Set(baseSel));
    setHide(new Set(baseHide));
  };
  const submit = async () => {
    const changedSources = sources.filter((source) => {
      const prefix = `${source.id}:`;
      const routesFor = (set: Set<string>) => [...set].filter((route) => route.startsWith(prefix)).sort().join('|');
      return routesFor(baseSel) !== routesFor(sel) || routesFor(baseHide) !== routesFor(hide);
    });

    try {
      for (const source of changedSources) {
        const destinationIds = [...sel]
          .filter((route) => route.startsWith(`${source.id}:`))
          .map((route) => Number(route.split(':')[1]));
        const hideSourceLinkDestinationIds = [...hide]
          .filter((route) => route.startsWith(`${source.id}:`))
          .map((route) => Number(route.split(':')[1]));
        const result = await save.mutateAsync({ id: source.id, data: { destinationIds, hideSourceLinkDestinationIds } });
        if (!result.ok) {
          reportResult(result);
          return;
        }
      }
      setBaseSel(new Set(sel));
      setBaseHide(new Set(hide));
      await qc.invalidateQueries({ queryKey: getGetRoutingQueryKey() });
      reportResult({ ok: true, message: 'تم حفظ تغييرات المصادر المحددة فقط' });
    } catch (e) {
      reportError(e);
    }
  };

  const loading = ch.isLoading || rt.isLoading;
  const err = ch.error || rt.error;

  return (
    <>
      <PageHeader
        title="التوجيه"
        desc="اختر يدوياً وجهة واحدة أو أكثر لكل مصدر. لن تُرسل الرسائل إلا إلى الوجهات المحددة؛ ويمكن للوجهة نفسها استقبال عدة مصادر."
        actions={
          <>
            <Button variant="outline" onClick={reset} disabled={!dirty} data-testid="button-reset-routing"><RotateCcw /> تراجع</Button>
            <Button onClick={() => void submit()} disabled={!dirty || save.isPending} data-testid="button-save-routing"><Save /> {save.isPending ? 'جارٍ الحفظ...' : 'حفظ التوجيه'}</Button>
          </>
        }
      />
      {loading ? <Panel flush><RowsSkeleton /></Panel> : err ? (
        <ErrorBox error={err} onRetry={() => { ch.refetch(); rt.refetch(); }} />
      ) : sources.length === 0 || dests.length === 0 ? (
        <Panel><Empty icon={GitFork} title="التوجيه يحتاج مصدراً ووجهة" desc={`لديك ${sources.length} مصدر و${dests.length} وجهة. أضف ما ينقص من صفحتي المصادر والوجهات.`} /></Panel>
      ) : (
        <Panel flush>
          <div className="border-b border-border bg-muted/20 px-4 py-2 text-sm text-muted-foreground" data-testid="text-routing-help">
              حدد الوجهات المطلوبة فقط لكل مصدر. «بدون توجيه» يمسح كل وجهاته؛ ولن تتغير القواعد المحفوظة حتى تضغط «حفظ التوجيه».
            </div>
          {dirty && <div className="border-b border-warn/30 bg-warn/10 px-4 py-2 text-xs font-semibold text-warn" data-testid="text-unsaved">لديك تغييرات غير محفوظة</div>}
          <ul className="divide-y divide-border">
            {sources.map((s) => (
              <li key={s.id} className="grid gap-3 px-4 py-4 md:grid-cols-[14rem_1fr]" data-testid={`row-route-${s.id}`}>
                <div>
                  <div className="font-bold">{s.name}</div>
                  <div className="num text-xs text-muted-foreground">{s.username}</div>
                </div>
                <div className="flex flex-wrap gap-2" role="group" aria-label={`وجهات المصدر ${s.name}`}>
                  <button
                    type="button"
                    aria-pressed={![...sel].some((route) => route.startsWith(`${s.id}:`))}
                    onClick={() => clearSource(s.id)}
                    data-testid={`toggle-route-${s.id}-none`}
                    className={cn(
                      'rounded-md border px-3 py-1.5 text-sm font-semibold transition-colors',
                      ![...sel].some((route) => route.startsWith(`${s.id}:`)) ? 'border-gold bg-gold/15 text-gold' : 'border-border text-muted-foreground hover:border-gold/50',
                    )}
                  >
                    بدون توجيه
                  </button>
                  {dests.map((d) => {
                    const route = key(s.id, d.id);
                    const on = sel.has(route);
                    return (
                      <div key={d.id} className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          aria-pressed={on}
                          onClick={() => flip(route)}
                          data-testid={`toggle-route-${s.id}-${d.id}`}
                          className={cn(
                            'rounded-md border px-3 py-1.5 text-sm font-semibold transition-colors',
                            on ? 'border-gold bg-gold/15 text-gold' : 'border-border text-muted-foreground hover:border-gold/50',
                          )}
                        >
                          {d.name}
                        </button>
                        {on && (
                          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground">
                            <input
                              type="checkbox"
                              checked={hide.has(route)}
                              onChange={() => toggleHide(route)}
                              aria-label={`إخفاء رابط المصدر من ${d.name}`}
                              data-testid={`toggle-hide-source-${s.id}-${d.id}`}
                              className="accent-gold"
                            />
                            <span>إخفاء رابط المصدر</span>
                          </label>
                        )}
                      </div>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
          <div className="border-t border-border px-4 py-2 text-xs text-muted-foreground">عدد القواعد النشطة: <span className="num font-bold text-foreground">{sel.size}</span></div>
        </Panel>
      )}
    </>
  );
}
