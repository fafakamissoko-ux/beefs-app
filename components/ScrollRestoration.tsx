'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const STORAGE_KEY = 'beefs_scroll_positions';

function getPositions(): Record<string, number> {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function savePosition(path: string, y: number) {
  try {
    const positions = getPositions();
    positions[path] = y;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
  } catch {
    /* ignore */
  }
}

function restoreScroll(path: string) {
  const saved = getPositions()[path];
  if (typeof saved !== 'number' || saved <= 0) return;
  const apply = () => {
    window.scrollTo({ top: saved, left: 0, behavior: 'auto' });
    document.documentElement.scrollTop = saved;
    document.body.scrollTop = saved;
  };
  apply();
  requestAnimationFrame(apply);
}

/**
 * - Navigation : restaure la position enregistrée pour la route, sinon haut de page.
 * - Changement d’onglet / retour app : sauvegarde au `hidden` et restaure au `visible`
 *   pour éviter le retour en haut imposé par certains navigateurs.
 */
export function ScrollRestoration() {
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => savePosition(pathname, window.scrollY);

    const onHidden = () => savePosition(pathname, window.scrollY);

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        onHidden();
      } else {
        restoreScroll(pathname);
      }
    };

    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) restoreScroll(pathname);
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onHidden);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('scroll', onScroll, { passive: true });

    const saved = getPositions()[pathname];
    if (typeof saved === 'number' && saved > 0) {
      restoreScroll(pathname);
    } else {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }
    requestAnimationFrame(() => restoreScroll(pathname));

    return () => {
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onHidden);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [pathname]);

  return null;
}
