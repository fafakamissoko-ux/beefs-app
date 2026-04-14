'use client';

import { usePathname } from 'next/navigation';
import { Header } from '@/components/Header';

/**
 * Coquille app : mobile-first, desktop fluide avec sidebar (Header shell phone).
 * Routes /admin : pleine largeur sans sidebar téléphone.
 */
/** Arène / salle live : pas de padding sur le main pour que le contenu fixed (100dvh) remplisse l’écran sans double décalage. */
function isRoomImmersiveRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return /^\/arena\/[^/]+/.test(pathname) || /^\/live\/[^/]+/.test(pathname);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const fullWidthShell = pathname?.startsWith('/admin') ?? false;
  const roomImmersive = isRoomImmersiveRoute(pathname ?? null);

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
      <main className="flex min-h-0 min-w-0 flex-1 flex-col pt-14 transition-all max-w-md mx-auto w-full lg:mx-0 lg:max-w-none lg:pl-64 lg:pt-0">
        <div
          className={`flex min-h-0 w-full flex-1 flex-col transition-all ${
            roomImmersive ? 'overflow-hidden p-0' : 'overflow-x-hidden p-4 lg:p-10'
          }`}
        >
          {children}
        </div>
      </main>
    </div>
  );
}
