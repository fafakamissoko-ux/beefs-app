'use client';

import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'beefs_seen_features';

function getSeenFeatures(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
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

  useEffect(() => {
    // Décalage par id pour éviter que plusieurs guides se chevauchent au même instant
    const stagger =
      featureId.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % 4500;
    const timer = setTimeout(() => {
      const seen = getSeenFeatures();
      if (!seen.has(featureId)) {
        setVisible(true);
      }
    }, 600 + stagger);
    return () => clearTimeout(timer);
  }, [featureId]);

  const dismiss = useCallback(() => {
    setVisible(false);
    const seen = getSeenFeatures();
    seen.add(featureId);
    persistSeen(seen);
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
