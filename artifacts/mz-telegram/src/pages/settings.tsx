import { useState } from 'react';
import { useChangePassword, type Settings } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ErrorBox, Field, PageHeader, Panel, RowsSkeleton } from '@/components/mz-ui';
import { reportError, reportResult } from '@/lib/mz';
import { useSettingsSave } from '@/lib/use-settings-save';

function tzValid(tz: string) {
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; }
}

function GeneralForm({ s }: { s: Settings }) {
  const { save, saving } = useSettingsSave();
  const [tz, setTz] = useState(s.timezone);
  const [att, setAtt] = useState(String(s.maxAttempts));
  const zones = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
  const n = Number(att);
  const bad = !tzValid(tz) || !(n >= 1 && n <= 10);
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save({ timezone: tz.trim(), maxAttempts: Math.round(n) }); }}>
      <Field label="المنطقة الزمنية" hint={tzValid(tz) ? 'تُستخدم لعرض كل التواريخ' : 'منطقة زمنية غير صالحة'}>
        <Input dir="ltr" list="mz-zones" value={tz} onChange={(e) => setTz(e.target.value)} data-testid="input-timezone" />
        <datalist id="mz-zones">{zones.map((z) => <option key={z} value={z} />)}</datalist>
      </Field>
      <Field label="أقصى عدد لمحاولات الإرسال" hint="من 1 إلى 10"><Input type="number" min={1} max={10} value={att} onChange={(e) => setAtt(e.target.value)} data-testid="input-max-attempts" /></Field>
      <Button type="submit" disabled={bad || saving} data-testid="button-save-settings">{saving ? 'جارٍ الحفظ...' : 'حفظ'}</Button>
    </form>
  );
}

function PasswordForm() {
  const m = useChangePassword();
  const [cur, setCur] = useState('');
  const [nw, setNw] = useState('');
  const [rep, setRep] = useState('');
  const mismatch = rep.length > 0 && rep !== nw;
  const ok = cur.length > 0 && nw.length >= 12 && nw === rep;
  return (
    <form className="space-y-4" onSubmit={(e) => {
      e.preventDefault();
      m.mutate({ data: { currentPassword: cur, newPassword: nw } }, {
        onSuccess: (r) => { if (reportResult(r)) { setCur(''); setNw(''); setRep(''); } },
        onError: (er) => reportError(er),
      });
    }}>
      <Field label="كلمة المرور الحالية"><Input type="password" autoComplete="current-password" maxLength={200} value={cur} onChange={(e) => setCur(e.target.value)} data-testid="input-current-password" /></Field>
      <Field label="كلمة المرور الجديدة" hint="12 حرفاً على الأقل"><Input type="password" autoComplete="new-password" maxLength={200} value={nw} onChange={(e) => setNw(e.target.value)} data-testid="input-new-password" /></Field>
      <Field label="تأكيد كلمة المرور الجديدة" hint={mismatch ? 'غير متطابقة' : undefined}><Input type="password" autoComplete="new-password" maxLength={200} value={rep} onChange={(e) => setRep(e.target.value)} data-testid="input-repeat-password" /></Field>
      <Button type="submit" disabled={!ok || m.isPending} data-testid="button-change-password">{m.isPending ? 'جارٍ التغيير...' : 'تغيير كلمة المرور'}</Button>
    </form>
  );
}

export default function SettingsPage() {
  const { query: q } = useSettingsSave();
  return (
    <>
      <PageHeader title="الإعدادات والأمان" desc="المنطقة الزمنية وإعادة المحاولة وكلمة مرور المالك." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="عام">
          {q.isLoading ? <RowsSkeleton n={2} /> : q.isError ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : q.data && <GeneralForm key={JSON.stringify(q.data)} s={q.data} />}
        </Panel>
        <Panel title="كلمة المرور"><PasswordForm /></Panel>
      </div>
    </>
  );
}
