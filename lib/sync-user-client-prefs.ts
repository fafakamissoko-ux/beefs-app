import { supabase } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';

const ONBOARDING_DISMISS_KEY = 'onboarding_reminder_dismissed_v1';

/** Même clé que `hooks/useFeatureGuide.ts` — liste d’ids de guides vus */
const FEATURE_GUIDES_STORAGE_KEY = 'beefs_seen_features';

function readFeatureGuideIdsFromStorage(): string[] {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(FEATURE_GUIDES_STORAGE_KEY) : null;
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Fusionne des ids de guides dans localStorage (hydratation compte + dismiss). */
export function mergeFeatureGuidesIntoLocalStorage(ids: string[]) {
  if (typeof window === 'undefined' || ids.length === 0) return;
  try {
    const merged = [...new Set([...readFeatureGuideIdsFromStorage(), ...ids])];
    localStorage.setItem(FEATURE_GUIDES_STORAGE_KEY, JSON.stringify(merged));
  } catch {
    /* ignore */
  }
}

/** Enregistre un guide comme vu côté local + métadonnées Auth (persiste entre appareils / sessions). */
export async function persistFeatureGuideSeen(featureId: string): Promise<void> {
  mergeFeatureGuidesIntoLocalStorage([featureId]);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const meta = (user.user_metadata && typeof user.user_metadata === 'object'
    ? user.user_metadata
    : {}) as Record<string, unknown>;
  const prev = Array.isArray(meta.feature_guides_seen)
    ? (meta.feature_guides_seen as unknown[]).filter((x): x is string => typeof x === 'string')
    : [];
  if (prev.includes(featureId)) {
    await supabase.auth.refreshSession();
    return;
  }
  const next = [...prev, featureId];
  const { error } = await supabase.auth.updateUser({
    data: {
      ...meta,
      feature_guides_seen: next,
    },
  });
  if (!error) {
    await supabase.auth.refreshSession();
  }
}

/**
 * Recolle localStorage à partir des métadonnées Auth (Brave / multi-appareils / stockage effacé).
 */
export function hydrateLocalPrefsFromUser(user: User | null) {
  if (!user || typeof window === 'undefined') return;
  try {
    const meta = user.user_metadata as Record<string, unknown> | undefined;
    if (meta?.has_seen_onboarding === true) {
      localStorage.setItem('hasSeenOnboarding', 'true');
      localStorage.setItem(ONBOARDING_DISMISS_KEY, 'true');
    }
    if (meta?.pwa_install_dismissed === true) {
      localStorage.setItem('pwa-install-prompt-seen', 'true');
    }
    const guides = meta?.feature_guides_seen;
    if (Array.isArray(guides) && guides.every((x) => typeof x === 'string')) {
      mergeFeatureGuidesIntoLocalStorage(guides as string[]);
    }
  } catch {
    /* ignore */
  }
}

export async function persistHasSeenOnboarding(): Promise<void> {
  try {
    localStorage.setItem('hasSeenOnboarding', 'true');
    localStorage.setItem(ONBOARDING_DISMISS_KEY, 'true');
    localStorage.removeItem('onboardingReminder');
  } catch {
    /* ignore */
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const meta = (user.user_metadata && typeof user.user_metadata === 'object'
    ? user.user_metadata
    : {}) as Record<string, unknown>;
  const { error } = await supabase.auth.updateUser({
    data: {
      ...meta,
      has_seen_onboarding: true,
    },
  });
  if (!error) {
    await supabase.auth.refreshSession();
  }
}

export async function persistPwaInstallDismissed(): Promise<void> {
  try {
    localStorage.setItem('pwa-install-prompt-seen', 'true');
  } catch {
    /* ignore */
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const meta = (user.user_metadata && typeof user.user_metadata === 'object'
    ? user.user_metadata
    : {}) as Record<string, unknown>;
  const { error } = await supabase.auth.updateUser({
    data: {
      ...meta,
      pwa_install_dismissed: true,
    },
  });
  if (!error) {
    await supabase.auth.refreshSession();
  }
}
