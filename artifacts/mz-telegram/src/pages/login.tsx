import { useState, type FormEvent } from 'react';
import { Redirect } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, KeyRound, Moon, ShieldCheck, Sun } from 'lucide-react';
import { getGetAuthQueryKey, useGetAuth, useLogin } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Logo, ErrorBox } from '@/components/mz-ui';
import { useTheme } from '@/lib/theme';
import { errMsg } from '@/lib/mz';

export default function LoginPage() {
  const qc = useQueryClient();
  const { theme, toggle } = useTheme();
  const auth = useGetAuth({ query: { queryKey: getGetAuthQueryKey(), retry: false } });
  const login = useLogin();
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');

  if (auth.data?.authenticated) return <Redirect to="/" />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    login.mutate(
      { data: { password: pw } },
      {
        onSuccess: (s) => {
          if (!s.authenticated) return setErr('كلمة المرور غير صحيحة');
          qc.setQueryData(getGetAuthQueryKey(), s);
        },
        onError: (e) => setErr(errMsg(e)),
      },
    );
  };

  return (
    <div className="grid min-h-[100dvh] lg:grid-cols-[1.1fr_1fr]">
      <div className="relative flex items-center justify-center p-6">
        <button
          onClick={toggle}
          aria-label="تبديل المظهر"
          data-testid="button-theme"
          className="absolute end-4 top-4 grid size-9 place-items-center rounded-md border border-border text-muted-foreground hover:text-foreground"
        >
          {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>
        <div className="rise w-full max-w-sm">
          <Logo size={52} />
          <h1 className="mt-6 text-3xl font-extrabold">تسجيل الدخول</h1>
          <p className="mt-2 text-sm text-muted-foreground">وحدة التشغيل الخاصة بمالك MZ Telegram Bots. أدخل كلمة المرور للمتابعة.</p>

          {auth.isError ? (
            <div className="mt-6"><ErrorBox error={auth.error} onRetry={() => auth.refetch()} /></div>
          ) : (
            <form onSubmit={submit} className="mt-8 space-y-4">
              {auth.data && !auth.data.configured && (
                <div role="alert" className="rounded-md border border-warn/40 bg-warn/10 p-3 text-sm text-warn" data-testid="text-unconfigured">
                  لم يتم إعداد كلمة مرور المالك على الخادم بعد، لذلك لا يمكن تسجيل الدخول حالياً.
                </div>
              )}
              <label className="block space-y-1.5">
                <span className="text-sm font-semibold">كلمة المرور</span>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type={show ? 'text' : 'password'}
                    value={pw}
                    onChange={(e) => setPw(e.target.value)}
                    autoComplete="current-password"
                    maxLength={200}
                    required
                    autoFocus
                    className="h-11 ps-10 pe-10"
                    data-testid="input-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    aria-label={show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                    className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    data-testid="button-toggle-password"
                  >
                    {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </label>
              {err && (
                <p role="alert" className="text-sm font-semibold text-danger" data-testid="text-login-error">{err}</p>
              )}
              <Button type="submit" size="lg" className="h-11 w-full text-base font-bold" disabled={!pw || login.isPending || auth.isLoading} data-testid="button-login">
                {login.isPending ? 'جارٍ التحقق...' : 'دخول'}
              </Button>
            </form>
          )}
        </div>
      </div>

      <div className="gold-grid relative hidden flex-col justify-between overflow-hidden border-s border-border bg-sidebar p-12 text-sidebar-foreground lg:flex">
        <div className="absolute -start-24 -top-24 size-96 rounded-full bg-gold/10 blur-3xl" />
        <div className="relative text-[clamp(7rem,16vw,14rem)] font-extrabold leading-none tracking-tighter text-gold/90" style={{ fontFamily: 'Tajawal' }} dir="ltr">MZ</div>
        <div className="relative space-y-6">
          <div className="flex items-center gap-2 text-gold"><ShieldCheck className="size-5" /><span className="font-bold">مركز تحكم المالك</span></div>
          <p className="max-w-md text-2xl font-bold leading-relaxed">من المصدر إلى القناة، كل رسالة مسجلة وكل حالة حقيقية.</p>
          <ul className="space-y-2 text-sm text-sidebar-foreground/70">
            <li>مصادر ووجهات يحددها المالك لكل مصدر</li>
            <li>تصفية الروابط وأسعار الذهب والبتكوين</li>
            <li>سجل كامل لمحاولات الإرسال وإعادة المحاولة</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
