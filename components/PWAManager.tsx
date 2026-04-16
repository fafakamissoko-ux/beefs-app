'use client';

import { useEffect } from 'react';

export function PWAManager() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((registration) => {
          // Check for updates every hour
          setInterval(() => {
            registration.update();
          }, 60 * 60 * 1000);
        })
        .catch(() => {
          console.error('Service Worker registration failed');
        });
    } else {
      console.warn('⚠️ Service Worker not supported in this browser');
    }
  }, []);

  return null;
}
