'use client';

import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/** Confetti léger (vert / succès) — pas de lib externe. */
export function VerdictConfettiBurst({ active }: { active: boolean }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => ({
        id: i,
        x: (Math.random() - 0.5) * 280,
        y: -Math.random() * 180 - 40,
        rot: Math.random() * 360,
        hue: 100 + Math.random() * 80,
        delay: Math.random() * 0.12,
      })),
    [],
  );

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          className="pointer-events-none fixed inset-0 z-[200] flex items-end justify-center overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          aria-hidden
        >
          <div className="relative h-40 w-full max-w-lg">
            {pieces.map((p) => (
              <motion.span
                key={p.id}
                className="absolute bottom-0 left-1/2 h-2 w-2 rounded-sm"
                style={{
                  background: `hsl(${p.hue} 85% 52%)`,
                  marginLeft: -4,
                }}
                initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 1 }}
                animate={{
                  x: p.x,
                  y: p.y,
                  opacity: [1, 1, 0],
                  rotate: p.rot,
                  scale: [1, 1.2, 0.6],
                }}
                transition={{ duration: 1.6, delay: p.delay, ease: 'easeOut' }}
              />
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Overlay full-screen rematch + titre glitch. */
export function RematchVerdictOverlay({
  visible,
  onDismiss,
}: {
  visible: boolean;
  onDismiss?: () => void;
}) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="pointer-events-auto fixed inset-0 z-[190] flex flex-col items-center justify-center bg-black/88 px-4 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
          onClick={() => onDismiss?.()}
        >
          <motion.div
            className="max-w-lg text-center"
            initial={{ scale: 0.88, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 280, damping: 24 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              className="glitch-rematch-title mb-4 text-4xl font-black uppercase leading-none tracking-tighter text-brand-400 sm:text-5xl md:text-6xl"
              style={{
                textShadow:
                  '0 0 40px rgba(255,107,44,0.55), 2px 0 #00f0ff, -2px 0 #ff0050',
              }}
            >
              REMATCH DEMANDÉ
            </h2>
            <p className="text-base font-semibold leading-relaxed tracking-tight text-white/90 sm:text-lg">
              Préparez-vous pour le Round 2. Suivez les challengers pour la date !
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
