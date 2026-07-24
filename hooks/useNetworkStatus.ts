'use client';

import { useState, useEffect } from 'react';

interface UseNetworkStatusOptions {
  onOffline?: () => void;
  onOnline?: () => void;
}

interface UseNetworkStatusReturn {
  isOffline: boolean;
}

export function useNetworkStatus(options?: UseNetworkStatusOptions): UseNetworkStatusReturn {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const goOffline = () => {
      setIsOffline(true);
      options?.onOffline?.();
    };
    const goOnline = () => {
      setIsOffline(false);
      options?.onOnline?.();
    };
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, [options]);

  return { isOffline };
}
