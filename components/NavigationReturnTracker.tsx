'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { RETURN_STORAGE_KEY, sanitizeReturnPath } from '@/lib/navigation-return';

/**
 * À chaque changement de route client, enregistre la page précédente pour AppBackButton.
 */
export function NavigationReturnTracker() {
  const pathname = usePathname();
  const prevRef = useRef<string | null>(null);

  useEffect(() => {
    const prev = prevRef.current;
    if (prev !== null && prev !== pathname) {
      const safe = sanitizeReturnPath(prev);
      if (safe) {
        try {
          sessionStorage.setItem(RETURN_STORAGE_KEY, safe);
        } catch {
          /* ignore */
        }
      }
    }
    prevRef.current = pathname;
  }, [pathname]);

  return null;
}
