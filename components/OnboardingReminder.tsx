'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Flame } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { hydrateLocalPrefsFromUser, persistHasSeenOnboarding } from '@/lib/sync-user-client-prefs';

const DISMISS_KEY = 'onboarding_reminder_dismissed_v1';

export function OnboardingReminder() {
  const router = useRouter();
  const { user } = useAuth();
  const [showReminder, setShowReminder] = useState(false);
  const reminderTimerRef = useRef<number | null>(null);

  /** Préférence serveur (getUser) + localStorage — évite le rappel à chaque login si métadonnées OK */
  useEffect(() => {
    if (!user?.id) return;

    try {
      if (
        localStorage.getItem(DISMISS_KEY) === 'true' ||
        localStorage.getItem('hasSeenOnboarding') === 'true'
      ) {
        return;
      }
    } catch {
      /* ignore */
    }

    let cancelled = false;

    void (async () => {
      const { data: { user: fresh } } = await supabase.auth.getUser();
      if (cancelled || !fresh) return;

      hydrateLocalPrefsFromUser(fresh);
      const meta = fresh.user_metadata as { has_seen_onboarding?: boolean } | undefined;
      if (meta?.has_seen_onboarding === true) return;

      try {
        if (localStorage.getItem('hasSeenOnboarding') === 'true') {
          localStorage.setItem(DISMISS_KEY, 'true');
        }
      } catch {}

      const dismissed = localStorage.getItem(DISMISS_KEY) === 'true';
      const hasSeenOnboarding = localStorage.getItem('hasSeenOnboarding') === 'true';
      if (dismissed || hasSeenOnboarding) return;

      const reminderRaw = localStorage.getItem('onboardingReminder');
      if (reminderRaw && new Date() < new Date(reminderRaw)) {
        return;
      }

      if (cancelled) return;
      reminderTimerRef.current = window.setTimeout(() => {
        if (!cancelled) setShowReminder(true);
      }, 8000);
    })();

    return () => {
      cancelled = true;
      if (reminderTimerRef.current !== null) {
        window.clearTimeout(reminderTimerRef.current);
        reminderTimerRef.current = null;
      }
    };
  }, [user?.id]);

  const handleDismiss = async (permanent: boolean = false) => {
    if (permanent) {
      await persistHasSeenOnboarding();
    } else {
      try {
        const reminderDate = new Date();
        reminderDate.setDate(reminderDate.getDate() + 7);
        localStorage.setItem('onboardingReminder', reminderDate.toISOString());
        localStorage.setItem('hasSeenOnboarding', 'true');
      } catch {}
    }
    setShowReminder(false);
  };

  const handleViewOnboarding = () => {
    setShowReminder(false);
    router.push('/welcome');
  };

  if (!showReminder) return null;

  return (
    <AnimatePresence>
      <motion.div
        data-onboarding-reminder
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 50 }}
        className="fixed bottom-4 right-4 z-[100] max-w-sm max-h-[min(80vh,420px)] overflow-y-auto"
      >
        <div className="card border border-orange-500/30 rounded-xl p-4 shadow-2xl relative">
          {/* Close = ne plus afficher (comme le lien) */}
          <button
            type="button"
            onClick={() => handleDismiss(true)}
            className="absolute top-1 right-1 sm:top-2 sm:right-2 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center p-2 text-gray-400 hover:text-white transition-colors touch-manipulation"
            aria-label="Ne plus afficher"
          >
            <X className="w-6 h-6 sm:w-4 sm:h-4" />
          </button>

          {/* Content */}
          <div className="flex items-start gap-3 mb-3">
            <div className="p-2 bg-gradient-to-br from-red-500 to-orange-500 rounded-lg">
              <Flame className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-white font-bold text-sm mb-1">
                Nouveau sur Beefs?
              </h3>
              <p className="text-gray-400 text-xs">
                Découvre comment fonctionne la plateforme en 30 secondes!
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleViewOnboarding}
              className="flex-1 bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 text-black font-bold py-2 px-4 rounded-lg text-xs transition-all"
            >
              Voir le guide
            </button>
            <button
              onClick={() => handleDismiss(true)}
              className="text-gray-400 hover:text-white text-xs font-semibold transition-colors"
            >
              Ne plus afficher
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
