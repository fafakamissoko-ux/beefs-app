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
    <div className="relative flex min-h-dvh min-w-0 w-full flex-col overflow-x-hidden bg-obsidian lg:flex-row">
      <Header shell="phone" />

      {/* MOBILE/TABLET : max-w-md mx-auto pt-14 (Protège le design original)
          DESKTOP (lg) : pl-64 compense le header fixed — pas de w-full (évite overflow horizontal). */}
      <main className="mx-auto flex w-full min-w-0 max-w-md flex-1 flex-col pt-14 transition-all lg:mx-0 lg:max-w-none lg:w-auto lg:min-w-0 lg:flex-1 lg:pl-64 lg:pt-0">
        <div
          className={`flex min-h-0 min-w-0 flex-1 flex-col transition-all ${
            roomImmersive ? 'overflow-hidden p-0' : 'overflow-x-hidden p-4 lg:p-10'
          }`}
        >
          {children}
        </div>
      </main>
    </div>
  );
}
