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
    <div className="relative min-h-dvh w-full overflow-x-hidden bg-obsidian flex flex-col lg:flex-row">
      <Header shell="phone" />

      {/* MOBILE/TABLET : max-w-md mx-auto pt-14 (Protège le design original)
          DESKTOP (lg) : max-w-none mx-0 pl-64 pt-0 (Libère la grille et décale la sidebar) */}
      <main className="flex-1 w-full max-w-md mx-auto pt-14 lg:max-w-none lg:mx-0 lg:pl-64 lg:pt-0 transition-all flex flex-col min-w-0">
        {/* MOBILE : p-4 | DESKTOP : p-10 */}
        <div className="w-full flex-1 p-4 lg:p-10 transition-all">{children}</div>
      </main>
    </div>
  );
}
