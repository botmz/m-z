import { Link } from 'wouter';
import { Logo } from '@/components/mz-ui';

export default function NotFound() {
  return (
    <div className="grid min-h-[100dvh] place-items-center p-6 text-center">
      <div className="space-y-4">
        <div className="flex justify-center"><Logo size={52} /></div>
        <h1 className="text-3xl font-extrabold">الصفحة غير موجودة</h1>
        <p className="text-sm text-muted-foreground">الرابط الذي طلبته غير متاح في لوحة التحكم.</p>
        <Link href="/" className="inline-block rounded-md border border-gold/60 px-4 py-2 text-sm font-bold text-gold" data-testid="link-home">العودة إلى لوحة التحكم</Link>
      </div>
    </div>
  );
}
