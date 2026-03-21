'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useBeefNotifications } from '@/hooks/useBeefNotifications';
import Link from 'next/link';

interface Toast {
  id: string;
  beefId: string;
  title: string;
  type: 'starting_soon' | 'live_now' | 'ended';
}

interface BeefNotificationToastsProps {
  userId: string;
}

export function BeefNotificationToasts({ userId }: BeefNotificationToastsProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const handleNotification = useCallback((n: { beefId: string; title: string; type: Toast['type'] }) => {
    const id = `${n.beefId}_${n.type}_${Date.now()}`;
    setToasts(prev => [...prev.slice(-2), { id, ...n }]); // Max 3 toasts
    // Auto-dismiss
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 8000);
  }, []);

  useBeefNotifications({ userId, onNotification: handleNotification });

  const dismiss = (id: string) => setToasts(prev => prev.filter(t => t.id !== id));

  const config = {
    live_now: {
      emoji: '🔴',
      label: 'EN DIRECT maintenant!',
      bg: 'from-red-600 to-orange-600',
      border: 'border-red-500',
      cta: 'Rejoindre',
    },
    starting_soon: {
      emoji: '⏰',
      label: 'Commence bientôt',
      bg: 'from-orange-500 to-yellow-500',
      border: 'border-orange-400',
      cta: 'Voir',
    },
    ended: {
      emoji: '🏁',
      label: 'Beef terminé',
      bg: 'from-gray-600 to-gray-700',
      border: 'border-gray-500',
      cta: 'Voir le résumé',
    },
  };

  return (
    <div className="fixed top-20 right-4 z-[999] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map(toast => {
          const c = config[toast.type];
          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 80, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 80, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className={`pointer-events-auto w-72 bg-gradient-to-r ${c.bg} rounded-2xl border ${c.border} shadow-2xl overflow-hidden`}
            >
              {/* Progress bar */}
              <motion.div
                className="h-1 bg-white/30"
                initial={{ scaleX: 1 }}
                animate={{ scaleX: 0 }}
                transition={{ duration: 8, ease: 'linear' }}
                style={{ transformOrigin: 'left' }}
              />

              <div className="p-3 flex items-start gap-3">
                {/* Icon */}
                <div className="text-2xl flex-shrink-0 mt-0.5">{c.emoji}</div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-white text-[11px] font-black uppercase tracking-wider">{c.label}</span>
                  </div>
                  <p className="text-white font-bold text-sm truncate">{toast.title}</p>
                  <Link
                    href={`/arena/${toast.beefId}`}
                    className="inline-block mt-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-bold px-3 py-1 rounded-full transition-colors"
                    onClick={() => dismiss(toast.id)}
                  >
                    {c.cta} →
                  </Link>
                </div>

                {/* Close */}
                <button
                  onClick={() => dismiss(toast.id)}
                  className="text-white/70 hover:text-white text-lg leading-none flex-shrink-0"
                >
                  ×
                </button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
