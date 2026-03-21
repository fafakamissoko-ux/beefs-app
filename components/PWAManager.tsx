'use client';

import { useEffect } from 'react';

export function PWAManager() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((registration) => {
          console.log('✅ Service Worker registered:', registration.scope);

          // Check for updates every hour
          setInterval(() => {
            registration.update();
          }, 60 * 60 * 1000);
        })
        .catch((error) => {
          console.error('❌ Service Worker registration failed:', error);
        });
    } else {
      console.warn('⚠️ Service Worker not supported in this browser');
    }
  }, []);

  return null;
}
