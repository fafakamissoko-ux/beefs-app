'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

/**
 * Filet côté client (middleware Edge + colonne DB) : évite un flash du feed / live
 * si la session est déjà connue avant la navigation complète.
 */
export function useClientArenaOnboardingGuard(userId: string | undefined | null) {
  const router = useRouter();

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from('users')
        .select('needs_arena_username')
        .eq('id', userId)
        .maybeSingle();
      if (cancelled || error) return;
      if (data?.needs_arena_username === true) {
        router.replace('/onboarding');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, router]);
}
