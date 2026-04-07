'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';
import { persistFeatureGuideSeen, hydrateLocalPrefsFromUser } from '@/lib/sync-user-client-prefs';
import { useAuth } from '@/contexts/AuthContext';

const STORAGE_KEY = 'beefs_seen_features';

function getSeenFeatures(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function persistSeen(seen: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...seen]));
  } catch {}
}

export function useFeatureGuide(featureId: string) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { loading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading) return;

    let cancelled = false;

    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;

      if (user) {
        hydrateLocalPrefsFromUser(user);
      }

      const fromMeta = (user?.user_metadata as { feature_guides_seen?: string[] } | undefined)?.feature_guides_seen;
      if (Array.isArray(fromMeta) && fromMeta.includes(featureId)) {
        return;
      }

      const seen = getSeenFeatures();
      if (seen.has(featureId)) return;

      const stagger =
        featureId.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % 4500;
      timerRef.current = setTimeout(() => {
        if (!cancelled) setVisible(true);
      }, 600 + stagger);
    })();

    return () => {
      cancelled = true;
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [featureId, authLoading]);

  const dismiss = useCallback(() => {
    setVisible(false);
    const seen = getSeenFeatures();
    seen.add(featureId);
    persistSeen(seen);
    void persistFeatureGuideSeen(featureId);
  }, [featureId]);

  return { visible, dismiss };
}

/**
 * Reset all guides (useful for testing or settings).
 */
export function resetAllGuides() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}
