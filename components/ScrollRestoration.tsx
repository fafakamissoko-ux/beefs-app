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

/**
 * - Première visite d’une route (aucune position enregistrée ou 0) : haut de page
 *   (évite de garder le scroll de la page précédente).
 * - Retour sur une route déjà visitée avec scroll sauvegardé : restauration de la position.
 */
export function ScrollRestoration() {
  const pathname = usePathname();

  useEffect(() => {
    const saved = getPositions()[pathname];

    const applyScroll = () => {
      if (typeof saved === 'number' && saved > 0) {
        window.scrollTo({ top: saved, left: 0, behavior: 'auto' });
        document.documentElement.scrollTop = saved;
        document.body.scrollTop = saved;
      } else {
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      }
    };

    applyScroll();
    requestAnimationFrame(applyScroll);

    const handleScroll = () => savePosition(pathname, window.scrollY);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [pathname]);

  return null;
}
