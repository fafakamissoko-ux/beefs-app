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
  } catch {}
}

export function ScrollRestoration() {
  const pathname = usePathname();

  useEffect(() => {
    const saved = getPositions()[pathname];
    if (saved && saved > 0) {
      requestAnimationFrame(() => {
        window.scrollTo(0, saved);
      });
    }

    const handleScroll = () => savePosition(pathname, window.scrollY);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [pathname]);

  return null;
}
