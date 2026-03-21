'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Flame } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export function OnboardingReminder() {
  const router = useRouter();
  const { user } = useAuth();
  const [showReminder, setShowReminder] = useState(false);

  useEffect(() => {
    // Only check for logged-in users
    if (!user) return;

    const hasSeenOnboarding = localStorage.getItem('hasSeenOnboarding');
    const onboardingReminder = localStorage.getItem('onboardingReminder');

    // Don't show if user has permanently dismissed
    if (hasSeenOnboarding === 'true' && !onboardingReminder) {
      return;
    }

    // Show if user has never seen onboarding
    if (!hasSeenOnboarding) {
      // Wait 10 seconds before showing reminder
      const timer = setTimeout(() => {
        setShowReminder(true);
      }, 10000);
      return () => clearTimeout(timer);
    }

    // Show if reminder date has passed
    if (onboardingReminder) {
      const reminderDate = new Date(onboardingReminder);
      const now = new Date();
      if (now > reminderDate) {
        const timer = setTimeout(() => {
          setShowReminder(true);
        }, 10000);
        return () => clearTimeout(timer);
      }
    }
  }, [user]);

  const handleDismiss = (permanent: boolean = false) => {
    if (permanent) {
      localStorage.setItem('hasSeenOnboarding', 'true');
      localStorage.removeItem('onboardingReminder');
    } else {
      // Remind in 7 days
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
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 50 }}
        className="fixed bottom-4 right-4 z-50 max-w-sm"
      >
        <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-orange-500/30 rounded-xl p-4 shadow-2xl">
          {/* Close button */}
          <button
            onClick={() => handleDismiss(false)}
            className="absolute top-2 right-2 text-gray-400 hover:text-white transition-colors"
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
