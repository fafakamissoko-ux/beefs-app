'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

type Side = 'A' | 'B';

const cobaltGlow = 'rgba(56, 189, 248, 0.5)';
const emberGlow = 'rgba(255, 95, 0, 0.52)';

type ChallengerSupportHaloProps = {
  side: Side;
  burstKey: number;
  className?: string;
};

const N_PARTICLES = 10;

/**
 * Particules en orbite dans l’anneau de soutien (cœur / pouce) — Cobalt A, Ember B.
 */
export function ChallengerSupportHalo({ side, burstKey, className = '' }: ChallengerSupportHaloProps) {
  const color = side === 'A' ? 'rgba(56, 189, 248, 0.95)' : 'rgba(255, 130, 55, 0.95)';
  const glow = side === 'A' ? cobaltGlow : emberGlow;
  const prevBurst = useRef(0);
  const [rim, setRim] = useState(0);

  useEffect(() => {
    if (burstKey > prevBurst.current) {
      setRim((r) => Math.min(1, r + 0.22));
      prevBurst.current = burstKey;
    }
  }, [burstKey]);

  useEffect(() => {
    const id = setInterval(() => setRim((r) => (r <= 0.02 ? 0 : r - 0.035)), 110);
    return () => clearInterval(id);
  }, []);

  const angles = useMemo(() => {
    return Array.from({ length: N_PARTICLES }, (_, i) => (i / N_PARTICLES) * Math.PI * 2);
  }, []);

  return (
    <div
      className={`pointer-events-none absolute left-1/2 top-1/2 z-0 h-[4.5rem] w-[4.5rem] -translate-x-1/2 -translate-y-1/2 ${className}`.trim()}
      aria-hidden
    >
      <motion.div
        className="absolute inset-0 rounded-full"
        animate={{
          boxShadow: [
            `0 0 ${26 + rim * 34}px ${glow}, inset 0 0 ${16 + rim * 24}px ${glow}`,
            `0 0 ${34 + rim * 40}px ${glow}, inset 0 0 ${22 + rim * 30}px ${glow}`,
            `0 0 ${26 + rim * 34}px ${glow}, inset 0 0 ${16 + rim * 24}px ${glow}`,
          ],
        }}
        transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
      />

      <AnimatePresence>
        {burstKey > 0 ? (
          <motion.div
            key={burstKey}
            initial={{ opacity: 0.9, scale: 0.82 }}
            animate={{ opacity: 0, scale: 1.55 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.52, ease: 'easeOut' }}
            className="absolute inset-[-8px] rounded-full"
            style={{
              boxShadow: `0 0 36px 14px ${glow}, inset 0 0 48px 16px ${glow}`,
            }}
          />
        ) : null}
      </AnimatePresence>

      {angles.map((θ, i) => (
        <motion.span
          key={i}
          className="absolute left-1/2 top-1/2 h-[3px] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            background: color,
            boxShadow: `0 0 8px 2px ${glow}`,
          }}
          animate={{
            x: [
              Math.cos(θ) * 24,
              Math.cos(θ + Math.PI * 0.7) * 29,
              Math.cos(θ + Math.PI * 1.35) * 24,
              Math.cos(θ + Math.PI * 2) * 24,
            ],
            y: [
              Math.sin(θ) * 24,
              Math.sin(θ + Math.PI * 0.7) * 29,
              Math.sin(θ + Math.PI * 1.35) * 24,
              Math.sin(θ + Math.PI * 2) * 24,
            ],
            opacity: [0.4, 1, 0.55, 0.4],
            scale: [0.8, 1.2, 0.95, 0.8],
          }}
          transition={{
            duration: 2.6 + i * 0.06,
            repeat: Infinity,
            ease: 'linear',
            delay: i * 0.07,
          }}
        />
      ))}
    </div>
  );
}
