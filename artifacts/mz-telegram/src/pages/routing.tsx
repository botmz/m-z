import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { GitFork, RotateCcw, Save } from 'lucide-react';
import {
  getGetChannelsQueryKey, getGetRoutingQueryKey, useGetChannels, useGetRouting, useSaveRouting,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Empty, ErrorBox, PageHeader, Panel, RowsSkeleton } from '@/components/mz-ui';
import { reportError, reportResult } from '@/lib/mz';
import { cn } from '@/lib/utils';

const key = (s: number, d: number) => `${s}:${d}`;

export default function RoutingPage() {
  const qc = useQueryClient();
  const ch = useGetChannels({ query: { queryKey: getGetChannelsQueryKey() } });
  const rt = useGetRouting({ query: { queryKey: getGetRoutingQueryKey() } });
  const save = useSaveRouting();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [base, setBase] = useState('');
  const init = useRef(false);

  useEffect(() => {
    if (rt.data && !init.current) {
      init.current = true;
      const s = new Set(rt.data.map((r) => key(r.sourceId, r.destinationId)));
      setSel(s);
      setBase([...s].sort().join('|'));
    }
  }, [rt.data]);

  const sources = (ch.data ?? []).filter((c) => c.kind === 'source');
  const dests = (ch.data ?? []).filter((c) => c.kind === 'destination');
  const dirty = [...sel].sort().join('|') !== base;

  const flip = (k: string) => setSel((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const reset = () => {
    const s = new Set((rt.data ?? []).map((r) => key(r.sourceId, r.destinationId)));
    setSel(s);
  };
  const submit = () => {
    const rules = [...sel].map((k) => { const [a, b] = k.split(':').map(Number); return { sourceId: a, destinationId: b }; });
    save.mutate({ data: { rules } }, {
      onSuccess: (r) => {
        if (reportResult(r)) { setBase([...sel].sort().join('|')); qc.invalidateQueries({ queryKey: getGetRoutingQueryKey() }); }
      },
      onError: (e) => reportError(e),
    });
  };

  const loading = ch.isLoading || rt.isLoading;
  const err = ch.error || rt.error;

  return (
    <>
      <PageHeader
        title="التوجيه"
        desc="اربط كل مصدر بوجهة أو أكثر. المصدر الواحد يمكنه التحويل إلى عدة وجهات، والوجهة تستقبل من عدة مصادر."
        actions={
          <>
            <Button variant="outline" onClick={reset} disabled={!dirty} data-testid="button-reset-routing"><RotateCcw /> تراجع</Button>
            <Button onClick={submit} disabled={!dirty || save.isPending} data-testid="button-save-routing"><Save /> {save.isPending ? 'جارٍ الحفظ...' : 'حفظ التوجيه'}</Button>
          </>
        }
      />
      {loading ? <Panel flush><RowsSkeleton /></Panel> : err ? (
        <ErrorBox error={err} onRetry={() => { ch.refetch(); rt.refetch(); }} />
      ) : sources.length === 0 || dests.length === 0 ? (
        <Panel><Empty icon={GitFork} title="التوجيه يحتاج مصدراً ووجهة" desc={`لديك ${sources.length} مصدر و${dests.length} وجهة. أضف ما ينقص من صفحتي المصادر والوجهات.`} /></Panel>
      ) : (
        <Panel flush>
          {dirty && <div className="border-b border-warn/30 bg-warn/10 px-4 py-2 text-xs font-semibold text-warn" data-testid="text-unsaved">لديك تغييرات غير محفوظة</div>}
          <ul className="divide-y divide-border">
            {sources.map((s) => (
              <li key={s.id} className="grid gap-3 px-4 py-4 md:grid-cols-[14rem_1fr]" data-testid={`row-route-${s.id}`}>
                <div>
                  <div className="font-bold">{s.name}</div>
                  <div className="num text-xs text-muted-foreground">{s.username}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {dests.map((d) => {
                    const on = sel.has(key(s.id, d.id));
                    return (
                      <button
                        key={d.id}
                        type="button"
                        role="switch"
                        aria-checked={on}
                        onClick={() => flip(key(s.id, d.id))}
                        data-testid={`toggle-route-${s.id}-${d.id}`}
                        className={cn(
                          'rounded-md border px-3 py-1.5 text-sm font-semibold transition-colors',
                          on ? 'border-gold bg-gold/15 text-gold' : 'border-border text-muted-foreground hover:border-gold/50',
                        )}
                      >
                        {d.name}
                      </button>
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
