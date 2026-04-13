'use client';

import { useEffect, useLayoutEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, Bell } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { hydrateLocalPrefsFromUser, persistPwaInstallDismissed } from '@/lib/sync-user-client-prefs';

function isPwaSnoozed(): boolean {
  try {
    const raw = localStorage.getItem('pwa-install-reminder');
    if (!raw) return false;
    return new Date() < new Date(raw);
  } catch {
    return false;
  }
}

export function PWAInstallPrompt() {
  const { user } = useAuth();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const showTimerRef = useRef<number | null>(null);

  const clearShowTimer = useCallback(() => {
    if (showTimerRef.current != null) {
      window.clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
  }, []);

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (
        localStorage.getItem('pwa-install-prompt-seen') === 'true' ||
        isPwaSnoozed()
      ) {
        setShowPrompt(false);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const m = user?.user_metadata as { pwa_install_dismissed?: boolean } | undefined;
    if (m?.pwa_install_dismissed === true) {
      setShowPrompt(false);
    }
  }, [user]);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    // Listen for install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);

      const hasSeenPrompt = localStorage.getItem('pwa-install-prompt-seen');
      if (hasSeenPrompt) return;
      if (isPwaSnoozed()) return;

      clearShowTimer();

      const onboardingDone =
        localStorage.getItem('hasSeenOnboarding') === 'true' ||
        localStorage.getItem('onboarding_reminder_dismissed_v1') === 'true';
      // Après onboarding / rappel : délai court ; sinon attendre pour limiter le chevauchement avec le rappel onboarding
      const delayMs = onboardingDone ? 12000 : 26000;

      showTimerRef.current = window.setTimeout(async () => {
        showTimerRef.current = null;
        if (localStorage.getItem('pwa-install-prompt-seen')) return;
        if (isPwaSnoozed()) return;
        const { data: { user: fresh } } = await supabase.auth.getUser();
        if (fresh) {
          hydrateLocalPrefsFromUser(fresh);
          const meta = fresh.user_metadata as { pwa_install_dismissed?: boolean } | undefined;
          if (meta?.pwa_install_dismissed === true) return;
        }
        if (localStorage.getItem('pwa-install-prompt-seen')) return;
        if (isPwaSnoozed()) return;
        setShowPrompt(true);
      }, delayMs);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    const onAppInstalled = () => {
      setIsInstalled(true);
      setShowPrompt(false);
      clearShowTimer();
      console.log('PWA installed successfully');
    };
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
      clearShowTimer();
    };
  }, [clearShowTimer]);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      console.log('User accepted install');
    } else {
      console.log('User dismissed install');
    }

    setDeferredPrompt(null);
    setShowPrompt(false);
    await persistPwaInstallDismissed();
  };

  const handleDismiss = async (permanent: boolean) => {
    clearShowTimer();
    setShowPrompt(false);
    if (permanent) {
      await persistPwaInstallDismissed();
    } else {
      try {
        const reminderDate = new Date();
        reminderDate.setDate(reminderDate.getDate() + 7);
        localStorage.setItem('pwa-install-reminder', reminderDate.toISOString());
      } catch {}
    }
  };

  if (isInstalled || !showPrompt) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 50 }}
        className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-modal max-h-[min(85vh,480px)] overflow-y-auto"
        role="region"
        aria-labelledby="pwa-install-title"
      >
        <div className="relative card border border-brand-500/30 rounded-[2rem] p-4 shadow-modal">
          {/* Close button */}
          <button
            type="button"
            onClick={() => handleDismiss(false)}
            className="absolute top-1 right-1 sm:top-2 sm:right-2 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center p-2 text-gray-400 hover:text-white transition-colors touch-manipulation"
            aria-label="Fermer la suggestion d’installation"
          >
            <X className="w-6 h-6 sm:w-4 sm:h-4" aria-hidden />
          </button>

          {/* Content */}
          <div className="flex items-start gap-3 mb-3">
            <div className="p-2 brand-gradient rounded-lg" aria-hidden>
              <Download className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 id="pwa-install-title" className="text-white font-bold text-sm mb-1">
                Installe Beefs sur ton téléphone
              </h3>
              <p className="text-gray-400 text-xs">
                Accès rapide, notifications instantanées, et fonctionne même hors ligne!
              </p>
            </div>
          </div>

          {/* Features */}
          <div className="space-y-1 mb-4 ml-11">
            <div className="flex items-center gap-2 text-xs text-gray-300">
              <Bell className="w-3 h-3 text-brand-400" />
              <span>Notifications en temps réel</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-300">
              <Download className="w-3 h-3 text-brand-400" />
              <span>Fonctionne hors ligne</span>
            </div>
          </div>

          {/* Actions — « Plus tard » = rappel dans 7 j ; « Ne plus proposer » = persistance compte + local */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleInstall}
                className="flex-1 brand-gradient hover:opacity-90 text-black font-bold py-2 px-4 rounded-lg text-xs transition-all"
              >
                Installer
              </button>
              <button
                type="button"
                onClick={() => handleDismiss(false)}
                className="text-gray-400 hover:text-white text-xs font-semibold transition-colors px-3 py-2 min-h-[44px] sm:min-h-0 touch-manipulation"
              >
                Plus tard
              </button>
            </div>
            <button
              type="button"
              onClick={() => handleDismiss(true)}
              className="text-[11px] text-gray-500 hover:text-gray-400 text-center"
            >
              Ne plus proposer
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
