'use client';

import { useEffect } from 'react';

/**
 * Erreurs côté navigateur → Sentry si `NEXT_PUBLIC_SENTRY_DSN` est défini.
 * Les erreurs serveur restent visibles dans les logs Vercel ; pour les capturer aussi, configure @sentry/nextjs (wizard).
 */
export function ClientMonitoring() {
  useEffect(() => {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
    if (!dsn) return;

    let cancelled = false;
    void import('@sentry/browser').then((Sentry) => {
      if (cancelled) return;
      Sentry.init({
        dsn,
        environment: process.env.NODE_ENV,
        tracesSampleRate: 0.05,
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 0,
      });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
