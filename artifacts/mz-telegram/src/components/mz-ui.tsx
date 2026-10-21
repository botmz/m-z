import type { ComponentType, ReactNode, SelectHTMLAttributes } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { errMsg, statusInfo, toneBox, toneDot } from '@/lib/mz';

export function Logo({ size = 36 }: { size?: number }) {
  return (
    <div
      className="grid place-items-center rounded-md border border-gold/60 bg-gradient-to-br from-gold/25 to-transparent font-extrabold text-gold"
      style={{ width: size, height: size, fontSize: size * 0.42, fontFamily: 'Tajawal, sans-serif', letterSpacing: '-0.04em' }}
      aria-hidden
    >
      MZ
    </div>
  );
}

export function PageHeader({ title, desc, actions }: { title: string; desc?: string; actions?: ReactNode }) {
  return (
    <div className="rise mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl" data-testid="text-page-title">
          {title}
        </h1>
        {desc && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{desc}</p>}
        <div className="mt-3 h-px w-16 bg-gold" />
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({
  title,
  actions,
  children,
  className,
  flush,
}: {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  flush?: boolean;
}) {
  return (
    <section className={cn('rise rounded-lg border border-card-border bg-card', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-card-border px-4 py-3">
          <h2 className="text-sm font-bold text-foreground">{title}</h2>
          {actions}
        </header>
      )}
      <div className={flush ? '' : 'p-4'}>{children}</div>
    </section>
  );
}

export function Empty({
  icon: Icon,
  title,
  desc,
  action,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  desc?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center" data-testid="empty-state">
      <div className="grid size-14 place-items-center rounded-full border border-dashed border-gold/50 bg-gold/5 text-gold">
        <Icon className="size-6" />
      </div>
      <div className="text-base font-bold">{title}</div>
      {desc && <p className="max-w-sm text-sm text-muted-foreground">{desc}</p>}
      {action}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-lg border border-danger/30 bg-danger/5 px-6 py-10 text-center"
      data-testid="error-state"
    >
      <AlertTriangle className="size-7 text-danger" />
      <div className="font-bold">تعذر تحميل البيانات</div>
      <p className="max-w-md text-sm text-muted-foreground">{errMsg(error)}</p>
      {onRetry && (
        <Button variant="outline" onClick={onRetry} data-testid="button-retry">
          <RefreshCw /> إعادة المحاولة
        </Button>
      )}
    </div>
  );
}

export function RowsSkeleton({ n = 4 }: { n?: number }) {
  return (
    <div className="space-y-2 p-4" aria-busy="true" aria-label="جارٍ التحميل">
      {Array.from({ length: n }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const { label: l, tone } = statusInfo(status);
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', toneBox[tone])}
      data-testid={`status-${status}`}
    >
      <span className={cn('size-1.5 rounded-full', toneDot[tone])} />
      {label ?? l}
    </span>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block space-y-1.5', className)}>
      <span className="text-sm font-semibold">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function Sel({
  options,
  className,
  ...rest
}: { options: [string, string][] } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...rest}
      className={cn(
        'h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}
