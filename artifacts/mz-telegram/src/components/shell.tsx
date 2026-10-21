import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  Activity, Download, Eye, GitFork, Languages, LayoutDashboard, LogOut, Menu, MessageSquare, Moon,
  ScrollText, Send, Settings as Cog, Sun, TrendingUp,
} from 'lucide-react';
import { getGetAuthQueryKey, useLogout } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Logo } from '@/components/mz-ui';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { reportError } from '@/lib/mz';

const NAV = [
  { href: '/', label: 'لوحة التحكم', icon: LayoutDashboard },
  { href: '/sources', label: 'المصادر', icon: Download },
  { href: '/destinations', label: 'الوجهات', icon: Send },
  { href: '/routing', label: 'التوجيه', icon: GitFork },
  { href: '/messages', label: 'الرسائل', icon: MessageSquare },
  { href: '/logs', label: 'السجلات', icon: ScrollText },
  { href: '/market', label: 'أسعار السوق', icon: TrendingUp },
  { href: '/translation', label: 'الترجمة', icon: Languages },
  { href: '/preview', label: 'معاينة الرسالة', icon: Eye },
  { href: '/services', label: 'الخدمات وتيليجرام', icon: Activity },
  { href: '/settings', label: 'الإعدادات والأمان', icon: Cog },
];

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const [loc] = useLocation();
  return (
    <nav className="flex flex-col gap-0.5 px-3" aria-label="التنقل الرئيسي">
      {NAV.map((n) => {
        const active = n.href === '/' ? loc === '/' : loc.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            onClick={onNavigate}
            data-testid={`link-nav-${n.href === '/' ? 'dashboard' : n.href.slice(1)}`}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-md border-s-2 px-3 py-2 text-sm font-semibold transition-colors',
              active
                ? 'border-sidebar-primary bg-sidebar-accent text-sidebar-accent-foreground'
                : 'border-transparent text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
            )}
          >
            <n.icon className="size-4 shrink-0" />
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-3 px-5 py-5">
      <Logo />
      <div className="leading-tight">
        <div className="text-sm font-extrabold text-sidebar-foreground">MZ Telegram Bots</div>
        <div className="text-[11px] text-sidebar-foreground/60">وحدة تشغيل التحويل</div>
      </div>
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { theme, toggle } = useTheme();
  const qc = useQueryClient();
  const [, nav] = useLocation();
  const logout = useLogout();

  const doLogout = () =>
    logout.mutate(undefined, {
      onSettled: () => {
        qc.removeQueries({ predicate: (q) => q.queryKey[0] !== getGetAuthQueryKey()[0] });
        qc.setQueryData(getGetAuthQueryKey(), { authenticated: false, configured: true });
        nav('/login');
      },
      onError: (e) => reportError(e, 'تعذر تسجيل الخروج'),
    });

  const actions = (
    <>
      <Button variant="ghost" size="icon" onClick={toggle} aria-label="تبديل المظهر" data-testid="button-theme">
        {theme === 'dark' ? <Sun /> : <Moon />}
      </Button>
      <Button variant="ghost" size="icon" onClick={doLogout} aria-label="تسجيل الخروج" data-testid="button-logout" disabled={logout.isPending}>
        <LogOut />
      </Button>
    </>
  );

  return (
    <div className="min-h-[100dvh] md:flex">
      <aside className="sticky top-0 hidden h-[100dvh] w-64 shrink-0 flex-col border-e border-sidebar-border bg-sidebar md:flex">
        <Brand />
        <div className="flex-1 overflow-y-auto pb-4">
          <Nav />
        </div>
        <div className="flex items-center justify-between border-t border-sidebar-border px-3 py-3 text-sidebar-foreground">
          <span className="text-xs text-sidebar-foreground/60">المالك</span>
          <div className="flex">{actions}</div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/90 px-3 py-2 backdrop-blur md:hidden">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="فتح القائمة" data-testid="button-menu">
              <Menu />
            </Button>
            <Logo size={28} />
          </div>
          <div className="flex">{actions}</div>
        </header>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="right" className="w-72 border-sidebar-border bg-sidebar p-0">
            <SheetTitle className="sr-only">القائمة</SheetTitle>
            <Brand />
            <Nav onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
        <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-9">{children}</main>
      </div>
    </div>
  );
}
