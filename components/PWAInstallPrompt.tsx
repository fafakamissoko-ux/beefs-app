'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, Bell } from 'lucide-react';

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

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

      const onboardingDone =
        localStorage.getItem('hasSeenOnboarding') === 'true' ||
        localStorage.getItem('onboarding_reminder_dismissed_v1') === 'true';
      // Après onboarding / rappel : délai court ; sinon attendre pour limiter le chevauchement avec le rappel onboarding
      const delayMs = onboardingDone ? 12000 : 26000;

      setTimeout(() => {
        if (localStorage.getItem('pwa-install-prompt-seen')) return;
        setShowPrompt(true);
      }, delayMs);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Listen for successful install
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setShowPrompt(false);
      console.log('PWA installed successfully');
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

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
    localStorage.setItem('pwa-install-prompt-seen', 'true');
  };

  const handleDismiss = (permanent: boolean) => {
    setShowPrompt(false);
    if (permanent) {
      localStorage.setItem('pwa-install-prompt-seen', 'true');
    } else {
      // Show again in 7 days
      const reminderDate = new Date();
      reminderDate.setDate(reminderDate.getDate() + 7);
      localStorage.setItem('pwa-install-reminder', reminderDate.toISOString());
    }
  };

  if (isInstalled || !showPrompt) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 50 }}
        className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-[90] max-h-[min(85vh,480px)] overflow-y-auto"
      >
        <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-brand-500/30 rounded-xl p-4 shadow-2xl">
          {/* Close button */}
          <button
            onClick={() => handleDismiss(false)}
            className="absolute top-2 right-2 text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Content */}
          <div className="flex items-start gap-3 mb-3">
            <div className="p-2 brand-gradient rounded-lg">
              <Download className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-white font-bold text-sm mb-1">
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

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleInstall}
              className="flex-1 brand-gradient hover:opacity-90 text-black font-bold py-2 px-4 rounded-lg text-xs transition-all"
            >
              Installer
            </button>
            <button
              onClick={() => handleDismiss(true)}
              className="text-gray-400 hover:text-white text-xs font-semibold transition-colors px-3"
            >
              Plus tard
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
