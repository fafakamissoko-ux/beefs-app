'use client';

import { usePathname } from 'next/navigation';
import { Header } from '@/components/Header';

/**
 * Coquille app : colonne type « téléphone » centrée sur desktop (max-w-md),
 * sauf routes admin qui restent pleine largeur.
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
    <div className="relative mx-auto min-h-dvh w-full max-w-md overflow-x-hidden border-x border-white/5 shadow-2xl lg:max-w-none lg:flex lg:flex-row lg:border-x-0 lg:shadow-none">
      <Header shell="phone" />
      <main className="mx-auto w-full max-w-md flex-1 min-w-0 pt-14 transition-all lg:ml-64 lg:max-w-2xl lg:pt-10">
        {children}
      </main>
    </div>
  );
}
