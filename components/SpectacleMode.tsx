'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface SpectacleModeProps {
  isChaosMode: boolean;
  tension: number;
}

export function SpectacleMode({ isChaosMode, tension }: SpectacleModeProps) {
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number }>>([]);

  useEffect(() => {
    if (!isChaosMode) {
      setParticles([]);
      return;
    }

    // Generate particles when in chaos mode
    const interval = setInterval(() => {
      const newParticles = Array.from({ length: 5 }, (_, i) => ({
        id: Date.now() + i,
        x: Math.random() * 100,
        y: Math.random() * 100,
      }));
      setParticles((prev) => [...prev, ...newParticles].slice(-20));
    }, 500);

    return () => clearInterval(interval);
  }, [isChaosMode]);

  return (
    <>
      {/* Background Effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {/* Chaos Mode Screen Shake Effect */}
        <AnimatePresence>
          {isChaosMode && (
            <>
              {/* Red Vignette */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.3 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-gradient-radial from-transparent via-transparent to-red-900"
                style={{
                  background:
                    'radial-gradient(circle at center, transparent 0%, transparent 50%, rgba(127, 29, 29, 0.5) 100%)',
                }}
              />

              {/* Particles */}
              <AnimatePresence>
                {particles.map((particle) => (
                  <motion.div
                    key={particle.id}
                    initial={{ opacity: 1, scale: 0, x: `${particle.x}vw`, y: `${particle.y}vh` }}
                    animate={{
                      opacity: 0,
                      scale: 2,
                      y: `${particle.y - 50}vh`,
                    }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 2 }}
                    className="absolute w-4 h-4 bg-red-500 rounded-full blur-sm"
                  />
                ))}
              </AnimatePresence>

              {/* Lightning Effects */}
              <motion.div
                animate={{
                  opacity: [0, 0.5, 0],
                }}
                transition={{
                  duration: 0.2,
                  repeat: Infinity,
                  repeatDelay: Math.random() * 5 + 2,
                }}
                className="absolute inset-0 bg-white mix-blend-overlay"
              />
            </>
          )}
        </AnimatePresence>

        {/* Tension Gradient Overlay */}
        <div
          className="absolute inset-0 transition-opacity duration-1000"
          style={{
            background: `linear-gradient(to top, 
              rgba(59, 130, 246, ${tension * 0.002}), 
              transparent 30%, 
              rgba(239, 68, 68, ${tension * 0.002}))`,
          }}
        />
      </div>

      {/* Chaos Mode Alert */}
      <AnimatePresence>
        {isChaosMode && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
          >
            <div className="bg-red-500 text-white px-6 py-3 rounded-full font-black text-lg shadow-2xl border-4 border-white/20 animate-pulse">
              🔥 MODE CHAOS ACTIVÉ ! 🔥
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
