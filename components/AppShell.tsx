'use client';

import { usePathname } from 'next/navigation';
import { Header } from '@/components/Header';

/**
 * Coquille app : mobile-first, desktop fluide avec sidebar (Header shell phone).
 * Routes /admin : pleine largeur sans sidebar téléphone.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const fullWidthShell = pathname?.startsWith('/admin') ?? false;

  if (fullWidthShell) {
    return (
      <>
        <Header shell="full" />
        <main className="min-h-dvh pt-14">{children}</main>
      </>
    );
  }

  return (
    <div className="relative min-h-dvh w-full bg-obsidian lg:flex lg:flex-row">
      <Header shell="phone" />
      <main className="w-full min-w-0 flex-1 pt-14 transition-all lg:pl-64 lg:pt-0">
        <div className="h-full w-full p-4 lg:p-10">{children}</div>
      </main>
    </div>
  );
}
