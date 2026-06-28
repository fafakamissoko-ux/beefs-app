'use client';

import { useEffect, useRef, useCallback } from 'react';

type WakeLockNavigator = Navigator & {
  wakeLock: {
    request(type: 'screen'): Promise<WakeLockSentinel>;
  };
};

export function useWakeLock(enabled: boolean = true) {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const requestWakeLock = useCallback(async () => {
    if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
      try {
        const nav = navigator as WakeLockNavigator;
        wakeLockRef.current = await nav.wakeLock.request('screen');

        wakeLockRef.current.addEventListener('release', () => {
          console.log('[Wake Lock] Verrouillage relâché par le système.');
        });
      } catch (err: unknown) {
        const e = err as { name?: string; message?: string };
        console.warn(`[Wake Lock] Refusé par le système : ${e.name}, ${e.message}`);
      }
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current !== null) {
      try {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      } catch (err) {
        console.warn('[Wake Lock] Erreur lors de la libération :', err);
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      void releaseWakeLock();
      return;
    }

    void requestWakeLock();

    const handleVisibilityChange = () => {
      if (wakeLockRef.current !== null && document.visibilityState === 'visible') {
        void requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      void releaseWakeLock();
    };
  }, [enabled, requestWakeLock, releaseWakeLock]);

  return { requestWakeLock, releaseWakeLock };
}
