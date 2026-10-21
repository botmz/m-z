import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { Activity, Pause, Play, RotateCw, ScanLine, Send } from 'lucide-react';
import {
  getGetDashboardQueryKey, getGetServicesQueryKey, getGetTelegramQrQueryKey, useBeginTelegramQr, useControlWorker,
  useGetServices, useGetTelegramQr, type ControlInput,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Empty, ErrorBox, PageHeader, Panel, RowsSkeleton, StatusBadge } from '@/components/mz-ui';
import { reportError, reportResult, statusInfo } from '@/lib/mz';
import { useFmt } from '@/lib/use-fmt';

const TERMINAL = ['authorized', 'connected', 'expired', 'failed', 'error', 'needs_2fa', 'unconfigured', 'not_configured'];

function QrPanel() {
  const qc = useQueryClient();
  const fmt = useFmt();
  const begin = useBeginTelegramQr();
  const poll = useGetTelegramQr({
    query: {
      queryKey: getGetTelegramQrQueryKey(),
      retry: false,
      refetchInterval: (q) => (!q.state.data || ['connecting', 'waiting'].includes(q.state.data.status) ? 2000 : false),
    },
  });
  const st = poll.data ?? begin.data;
  const busy = begin.isPending || st?.status === 'connecting';
  const usableQr = st?.status === 'waiting' && st.url &&
    (!st.expiresAt || new Date(st.expiresAt).getTime() > Date.now());

  useEffect(() => {
    if (st?.status === 'connected') {
      qc.invalidateQueries({ queryKey: getGetServicesQueryKey() });
      qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
    }
  }, [qc, st?.status]);

  const start = () => begin.mutate(undefined, {
    onSuccess: (r) => {
      qc.setQueryData(getGetTelegramQrQueryKey(), r);
      if (TERMINAL.includes(r.status)) qc.invalidateQueries({ queryKey: getGetServicesQueryKey() });
    },
    onError: (e) => reportError(e),
  });

  return (
    <Panel title="ربط حساب تيليجرام بالـ QR">
      <div className="grid gap-5 md:grid-cols-[auto_1fr] md:items-start">
        <div className="grid size-56 place-items-center rounded-lg border border-border bg-[#fbf7ea] p-3" data-testid="qr-box">
          {usableQr ? <QRCodeSVG value={st!.url!} size={200} marginSize={4} bgColor="#fbf7ea" fgColor="#14110a" level="M" /> : <ScanLine className={`size-12 text-[#14110a]/30 ${busy ? 'animate-pulse' : ''}`} />}
        </div>
        <div className="space-y-3">
          {begin.isError && <ErrorBox error={begin.error} onRetry={start} />}
          {poll.isError && <ErrorBox error={poll.error} onRetry={() => poll.refetch()} />}
          {st ? (
            <>
              <StatusBadge status={st.status} />
              <p className="text-sm" data-testid="text-qr-message">{st.message}</p>
              {st.status === 'needs_2fa' && (
                <p className="rounded-md border border-warn/30 bg-warn/10 p-3 text-sm text-warn" data-testid="text-2fa">
                  الحساب محمي بالتحقق بخطوتين. أكمل التفويض من إعدادات الخادم؛ هذه اللوحة لا تطلب كلمة مرور تيليجرام أبداً.
                </p>
              )}
              {st.expiresAt && !TERMINAL.includes(st.status) && <p className="text-xs text-muted-foreground">ينتهي الرمز: {fmt(st.expiresAt)}</p>}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">اضغط بدء الربط ثم امسح الرمز من تيليجرام: الإعدادات، الأجهزة، ربط جهاز سطح المكتب.</p>
          )}
          <p className="text-xs text-muted-foreground">لا تُدخل كلمة مرور حساب تيليجرام هنا. الربط يتم بالمسح فقط.</p>
          <Button onClick={start} disabled={busy || st?.status === 'connected'} data-testid="button-begin-qr"><ScanLine /> {busy ? 'جارٍ إنشاء الرمز...' : st?.status === 'connected' ? 'تم الربط' : st && st.status !== 'idle' ? 'رمز جديد' : 'بدء الربط'}</Button>
        </div>
      </div>
    </Panel>
  );
}

export default function ServicesPage() {
  const qc = useQueryClient();
  const q = useGetServices({ query: { queryKey: getGetServicesQueryKey(), refetchInterval: 15000 } });
  const ctl = useControlWorker();
  const fmt = useFmt();
  const [busy, setBusy] = useState<string | null>(null);

  const run = (action: ControlInput['action']) => {
    setBusy(action);
    ctl.mutate({ data: { action } }, {
      onSuccess: (r) => { reportResult(r); qc.invalidateQueries({ queryKey: getGetServicesQueryKey() }); qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); },
      onError: (e) => reportError(e),
      onSettled: () => setBusy(null),
    });
  };
  const btns: { a: ControlInput['action']; l: string; i: typeof Play }[] = [
    { a: 'start', l: 'تشغيل', i: Play }, { a: 'pause', l: 'إيقاف مؤقت', i: Pause },
    { a: 'restart', l: 'إعادة تشغيل', i: RotateCw }, { a: 'testBot', l: 'اختبار البوت', i: Send },
  ];

  return (
    <>
      <PageHeader title="الخدمات وتيليجرام" desc="الحالة الفعلية لكل خدمة كما يفحصها الخادم." actions={
        btns.map((b) => (
          <Button key={b.a} variant={b.a === 'start' ? 'default' : 'outline'} onClick={() => run(b.a)} disabled={ctl.isPending} data-testid={`button-${b.a}`}>
            <b.i className={busy === b.a ? 'animate-pulse' : ''} /> {b.l}
          </Button>
        ))
      } />
      <Panel flush className="mb-5">
        {q.isLoading ? <RowsSkeleton n={3} /> : q.isError ? (
          <div className="p-4"><ErrorBox error={q.error} onRetry={() => q.refetch()} /></div>
        ) : (q.data ?? []).length === 0 ? (
          <Empty icon={Activity} title="لا توجد خدمات مبلّغ عنها" desc="لم يرجع الخادم أي حالة خدمة." />
        ) : (
          <ul className="divide-y divide-border">
            {q.data!.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5" data-testid={`row-service-${s.id}`}>
                <div className="min-w-0 flex-1 basis-56">
                  <div className="font-bold">{s.name}</div>
                  <p className="text-sm text-muted-foreground">{s.detail}</p>
                </div>
                <div className="text-end">
                  <StatusBadge status={s.status} label={statusInfo(s.status).label} />
                  <div className="mt-1 text-[11px] text-muted-foreground">{s.checkedAt ? `آخر فحص: ${fmt(s.checkedAt)}` : 'لم يُفحص'}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <QrPanel />
    </>
  );
}
