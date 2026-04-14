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
    <div className="relative flex min-h-dvh w-full flex-col overflow-x-hidden bg-obsidian lg:flex-row">
      <Header shell="phone" />
      {/* Sur Desktop (lg), pl-64 compense la sidebar fixe 256px ; le contenu occupe l’espace restant. */}
      <main className="w-full min-w-0 flex-1 pt-14 transition-all lg:pl-64 lg:pt-8">
        <div className="h-full w-full px-4 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
