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
    <div className="relative mx-auto min-h-dvh w-full overflow-x-hidden border-x border-white/5 bg-obsidian shadow-2xl lg:flex lg:max-w-7xl">
      <Header shell="phone" />
      {/* Le lg:pt-0 annule la marge du header mobile. */}
      <main className="flex w-full min-w-0 flex-1 flex-col pt-14 transition-all lg:pt-0 lg:pl-64">
        <div className="w-full flex-1 px-4 py-4 lg:px-8 lg:pt-6 lg:pb-10">{children}</div>
      </main>
    </div>
  );
}
