import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { GitFork, RotateCcw, Save } from 'lucide-react';
import {
  getGetChannelsQueryKey, getGetDashboardQueryKey, getGetRoutingQueryKey, useGetChannels, useGetRouting, useSaveChannelRouting,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Empty, ErrorBox, PageHeader, Panel, RowsSkeleton } from '@/components/mz-ui';
import { reportError, reportResult } from '@/lib/mz';
import { cn } from '@/lib/utils';

const key = (s: number, d: number) => `${s}:${d}`;
type RouteContentSettings = {
  showText: boolean;
  showImages: boolean;
  showVideos: boolean;
  showFiles: boolean;
  showLinks: boolean;
  showMarketPrices: boolean;
  showSignature: boolean;
};
const defaults = (showLinks = true): RouteContentSettings => ({
  showText: true, showImages: true, showVideos: true, showFiles: true,
  showLinks, showMarketPrices: true, showSignature: true,
});
const signature = (routes: Set<string>, hidden: Set<string>, content: Record<string, RouteContentSettings>) =>
  `${[...routes].sort().join('|')}#${[...hidden].sort().join('|')}#${[...routes].sort().map((route) => `${route}:${JSON.stringify(content[route] ?? defaults())}`).join('|')}`;
const contentOptions: Array<[keyof RouteContentSettings, string]> = [
  ['showText', 'إظهار نص رسالة المصدر'],
  ['showImages', 'إظهار الصور'],
  ['showVideos', 'إظهار الفيديوهات'],
  ['showFiles', 'إظهار الملفات'],
  ['showLinks', 'حذف الروابط من الرسائل'],
  ['showMarketPrices', 'إظهار شريط الأسعار'],
  ['showSignature', 'إظهار التوقيع الثابت'],
];
const optionEnabled = (settings: RouteContentSettings, field: keyof RouteContentSettings) =>
  field === 'showLinks' ? !settings.showLinks : settings[field];
const optionSettingValue = (field: keyof RouteContentSettings, enabled: boolean) =>
  field === 'showLinks' ? !enabled : enabled;

export default function RoutingPage() {
  const qc = useQueryClient();
  const ch = useGetChannels({ query: { queryKey: getGetChannelsQueryKey() } });
  const rt = useGetRouting({ query: { queryKey: getGetRoutingQueryKey() } });
  const save = useSaveChannelRouting();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [hide, setHide] = useState<Set<string>>(new Set());
  const [content, setContent] = useState<Record<string, RouteContentSettings>>({});
  const [expandedRoute, setExpandedRoute] = useState<string | null>(null);
  const [baseSel, setBaseSel] = useState<Set<string>>(new Set());
  const [baseHide, setBaseHide] = useState<Set<string>>(new Set());
  const [baseContent, setBaseContent] = useState<Record<string, RouteContentSettings>>({});
  const init = useRef(false);

  useEffect(() => {
    if (rt.data && !init.current) {
      init.current = true;
      const s = new Set(rt.data.map((r) => key(r.sourceId, r.destinationId)));
      const h = new Set(rt.data.filter((r) => r.hideSourceLink).map((r) => key(r.sourceId, r.destinationId)));
      const c = Object.fromEntries(rt.data.map((r) => [
        key(r.sourceId, r.destinationId),
        r.contentSettings ?? defaults(),
      ]));
      setSel(s);
      setHide(h);
      setContent(c);
      setBaseSel(new Set(s));
      setBaseHide(new Set(h));
      setBaseContent(c);
    }
  }, [rt.data]);

  const sources = (ch.data ?? []).filter((c) => c.kind === 'source');
  const dests = (ch.data ?? []).filter((c) => c.kind === 'destination');
  const dirty = signature(sel, hide, content) !== signature(baseSel, baseHide, baseContent);

  const flip = (route: string, sourceSkipsLinks: boolean) => {
    const removing = sel.has(route);
    setSel((p) => {
      const n = new Set(p);
      removing ? n.delete(route) : n.add(route);
      return n;
    });
    if (!removing) setContent((current) => current[route] ? current : {
      ...current,
      [route]: defaults(!sourceSkipsLinks),
    });
    if (removing) setHide((current) => {
      const next = new Set(current);
      next.delete(route);
      return next;
    });
  };
  const updateContent = (route: string, field: keyof RouteContentSettings, value: boolean) => setContent((current) => ({
    ...current,
    [route]: { ...(current[route] ?? defaults()), [field]: value },
  }));
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
    setContent(baseContent);
    setExpandedRoute(null);
  };
  const submit = async () => {
    const changedSources = sources.filter((source) => {
      const prefix = `${source.id}:`;
      const routesFor = (set: Set<string>) => [...set].filter((route) => route.startsWith(prefix)).sort().join('|');
      const settingsFor = (set: Set<string>, values: Record<string, RouteContentSettings>) =>
        [...set].filter((route) => route.startsWith(prefix)).sort().map((route) => `${route}:${JSON.stringify(values[route] ?? defaults(!source.skipMessagesWithLinks))}`).join('|');
      return routesFor(baseSel) !== routesFor(sel) ||
        routesFor(baseHide) !== routesFor(hide) ||
        settingsFor(baseSel, baseContent) !== settingsFor(sel, content);
    });

    try {
      for (const source of changedSources) {
        const destinationIds = [...sel]
          .filter((route) => route.startsWith(`${source.id}:`))
          .map((route) => Number(route.split(':')[1]));
        const hideSourceLinkDestinationIds = [...hide]
          .filter((route) => route.startsWith(`${source.id}:`))
          .map((route) => Number(route.split(':')[1]));
        const routeSettings = destinationIds.map((destinationId) => {
          const route = key(source.id, destinationId);
          return { destinationId, contentSettings: content[route] ?? defaults(!source.skipMessagesWithLinks) };
        });
        const result = await save.mutateAsync({ id: source.id, data: { destinationIds, hideSourceLinkDestinationIds, routeSettings } });
        if (!result.ok) {
          reportResult(result);
          return;
        }
      }
      setBaseSel(new Set(sel));
      setBaseHide(new Set(hide));
      setBaseContent(content);
      await qc.invalidateQueries({ queryKey: getGetRoutingQueryKey() });
      await qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
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
            حدد الوجهات المطلوبة فقط لكل مصدر. لكل وجهة محددة يمكنك تفعيل «إخفاء رابط المصدر» بشكل مستقل. «بدون توجيه» يمسح كل وجهاته؛ ولن تتغير القواعد المحفوظة حتى تضغط «حفظ التوجيه».
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
                          onClick={() => flip(route, s.skipMessagesWithLinks)}
                          data-testid={`toggle-route-${s.id}-${d.id}`}
                          className={cn(
                            'rounded-md border px-3 py-1.5 text-sm font-semibold transition-colors',
                            on ? 'border-gold bg-gold/15 text-gold' : 'border-border text-muted-foreground hover:border-gold/50',
                          )}
                        >
                          {d.name}
                        </button>
                        {on && (
                          <>
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
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              aria-expanded={expandedRoute === route}
                              onClick={() => setExpandedRoute((current) => current === route ? null : route)}
                              data-testid={`toggle-route-content-${s.id}-${d.id}`}
                            >
                              محتوى المصدر
                            </Button>
                            {expandedRoute === route && (
                              <div className="basis-full rounded-md border border-border bg-muted/10 p-3">
                                <div className="mb-2 text-sm font-semibold">محتوى رسالة المصدر</div>
                                <div className="grid gap-2 sm:grid-cols-2">
                                  {contentOptions.map(([field, label]) => (
                                    <label key={field} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
                                      <span>{label}</span>
                                      <Switch
                                        checked={optionEnabled(content[route] ?? defaults(!s.skipMessagesWithLinks), field)}
                                        onCheckedChange={(value) => updateContent(route, field, optionSettingValue(field, value))}
                                        data-testid={`switch-route-content-${field}-${s.id}-${d.id}`}
                                      />
                                    </label>
                                  ))}
                                </div>
                                {(() => {
                                  const value = content[route] ?? defaults(!s.skipMessagesWithLinks);
                                  const mediaAvailable = s.mediaMode === 'include' &&
                                    (value.showImages || value.showVideos || value.showFiles);
                                  const pricesAvailable = value.showMarketPrices && d.marketEnabled;
                                  const signatureAvailable = value.showSignature && d.signatureEnabled && Boolean(d.suffix.trim());
                                  const empty = !value.showText && !mediaAvailable && !pricesAvailable && !signatureAvailable;
                                  return empty ? (
                                    <p className="mt-2 rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn" role="alert" data-testid={`warning-empty-route-${s.id}-${d.id}`}>
                                      لا يوجد محتوى مفعّل؛ ستُتخطى الرسائل بدلاً من إرسال رسالة فارغة.
                                    </p>
                                  ) : null;
                                })()}
                              </div>
                            )}
                          </>
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
