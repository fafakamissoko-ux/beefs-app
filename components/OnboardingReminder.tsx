'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Flame } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const DISMISS_KEY = 'onboarding_reminder_dismissed_v1';

export function OnboardingReminder() {
  const router = useRouter();
  const { user } = useAuth();
  const [showReminder, setShowReminder] = useState(false);

  useEffect(() => {
    if (!user) return;
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

    const timer = setTimeout(() => setShowReminder(true), 8000);
    return () => clearTimeout(timer);
  }, [user]);

  const handleDismiss = (permanent: boolean = false) => {
    if (permanent) {
      localStorage.setItem(DISMISS_KEY, 'true');
      localStorage.setItem('hasSeenOnboarding', 'true');
      localStorage.removeItem('onboardingReminder');
    } else {
      const reminderDate = new Date();
      reminderDate.setDate(reminderDate.getDate() + 7);
      localStorage.setItem('onboardingReminder', reminderDate.toISOString());
    }
    setShowReminder(false);
  };

  const handleViewOnboarding = () => {
    setShowReminder(false);
    router.push('/onboarding');
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
            className="absolute top-2 right-2 text-gray-400 hover:text-white transition-colors"
            aria-label="Ne plus afficher"
          >
            <X className="w-4 h-4" />
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
