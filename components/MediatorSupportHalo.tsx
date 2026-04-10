'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const goldGlow = 'rgba(251, 191, 36, 0.48)';
const goldCore = 'rgba(253, 224, 138, 0.92)';

type MediatorSupportHaloProps = {
  burstKey: number;
  leader?: boolean;
  className?: string;
};

const N_PARTICLES = 10;

/** Halo or / ambre autour du médiateur — particules + impulsions sur burst. */
export function MediatorSupportHalo({ burstKey, leader = false, className = '' }: MediatorSupportHaloProps) {
  const prevBurst = useRef(0);
  const [rim, setRim] = useState(0);

  useEffect(() => {
    if (burstKey > prevBurst.current) {
      setRim((r) => Math.min(1, r + 0.24));
      prevBurst.current = burstKey;
    }
  }, [burstKey]);

  useEffect(() => {
    const id = setInterval(() => setRim((r) => (r <= 0.02 ? 0 : r - 0.032)), 110);
    return () => clearInterval(id);
  }, []);

  const angles = useMemo(
    () => Array.from({ length: N_PARTICLES }, (_, i) => (i / N_PARTICLES) * Math.PI * 2),
    [],
  );

  const R = leader ? 30 : 24;

  return (
    <div
      className={`pointer-events-none absolute left-1/2 top-1/2 z-0 h-[5.5rem] w-[5.5rem] -translate-x-1/2 -translate-y-1/2 ${leader ? 'scale-[1.08]' : ''} ${className}`.trim()}
      aria-hidden
    >
      <motion.div
        className="absolute inset-0 rounded-full"
        animate={{
          boxShadow: [
            `0 0 ${22 + rim * 28}px ${goldGlow}, inset 0 0 ${14 + rim * 20}px ${goldGlow}`,
            `0 0 ${30 + rim * 36}px ${goldGlow}, inset 0 0 ${18 + rim * 26}px ${goldGlow}`,
            `0 0 ${22 + rim * 28}px ${goldGlow}, inset 0 0 ${14 + rim * 20}px ${goldGlow}`,
          ],
        }}
        transition={{ duration: 1.35, repeat: Infinity, ease: 'easeInOut' }}
      />

      <AnimatePresence>
        {burstKey > 0 ? (
          <motion.div
            key={burstKey}
            initial={{ opacity: 0.85, scale: 0.8 }}
            animate={{ opacity: 0, scale: 1.5 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="absolute inset-[-6px] rounded-full"
            style={{
              boxShadow: `0 0 32px 12px ${goldGlow}, inset 0 0 40px 14px ${goldGlow}`,
            }}
          />
        ) : null}
      </AnimatePresence>

      {/* Micro-courants lumineux */}
      <motion.div
        className="pointer-events-none absolute inset-[10%] rounded-full opacity-[0.35]"
        style={{
          background: `conic-gradient(from 0deg, transparent 0deg, ${goldCore} 32deg, transparent 64deg, transparent 180deg, ${goldCore} 212deg, transparent 244deg)`,
        }}
        animate={{ rotate: [0, 360] }}
        transition={{ duration: 5.5, repeat: Infinity, ease: 'linear' }}
      />

      {angles.map((θ, i) => (
        <motion.span
          key={i}
          className="absolute left-1/2 top-1/2 h-[2.5px] w-[2.5px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            background: goldCore,
            boxShadow: `0 0 6px 1.5px ${goldGlow}`,
          }}
          animate={{
            x: [
              Math.cos(θ) * R,
              Math.cos(θ + Math.PI * 0.65) * (R + 5),
              Math.cos(θ + Math.PI * 1.3) * R,
              Math.cos(θ + Math.PI * 2) * R,
            ],
            y: [
              Math.sin(θ) * R,
              Math.sin(θ + Math.PI * 0.65) * (R + 5),
              Math.sin(θ + Math.PI * 1.3) * R,
              Math.sin(θ + Math.PI * 2) * R,
            ],
            opacity: [0.35, 0.85, 0.45, 0.35],
            scale: [0.75, 1.05, 0.9, 0.75],
          }}
          transition={{
            duration: 2.4 + i * 0.055,
            repeat: Infinity,
            ease: 'linear',
            delay: i * 0.06,
          }}
        />
      ))}
    </div>
  );
}
