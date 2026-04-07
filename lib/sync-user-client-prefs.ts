import { supabase } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';

const ONBOARDING_DISMISS_KEY = 'onboarding_reminder_dismissed_v1';

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
  await supabase.auth.updateUser({
    data: {
      ...meta,
      has_seen_onboarding: true,
    },
  });
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
  await supabase.auth.updateUser({
    data: {
      ...meta,
      pwa_install_dismissed: true,
    },
  });
}
