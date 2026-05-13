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

/** Pages plein écran sans chrome app (sas pseudo, carrousel d’accueil). */
function isStandalonePublicPage(pathname: string | null): boolean {
  if (!pathname) return false;
  return pathname === '/onboarding' || pathname === '/welcome';
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const fullWidthShell = pathname?.startsWith('/admin') ?? false;
  const roomImmersive = isRoomImmersiveRoute(pathname ?? null);
  const standalone = isStandalonePublicPage(pathname ?? null);

  if (standalone || roomImmersive) {
    return <>{children}</>;
  }

  if (fullWidthShell) {
    return (
      <>
        <Header shell="full" />
        <main className="min-h-dvh pt-14">{children}</main>
      </>
    );
  }

  return (
    <div className="flex h-[100dvh] w-full min-w-0 flex-col overflow-hidden bg-[#050505] lg:flex-row">
      <Header shell="phone" />

      <main className="mx-auto flex h-full min-h-0 w-full max-w-md flex-1 flex-col transition-all overflow-hidden lg:mx-0 lg:max-w-none lg:pt-0">
        <div
          className={`flex min-h-0 min-w-0 flex-1 flex-col transition-all ${
            roomImmersive
              ? 'overflow-hidden p-0'
              : pathname === '/feed' || pathname === '/'
                ? 'h-full min-h-0 max-md:overflow-hidden max-md:p-0 overflow-x-hidden p-4 lg:p-10'
                : 'overflow-x-hidden p-4 lg:p-10'
          }`}
        >
          {children}
        </div>
      </main>
    </div>
  );
}
