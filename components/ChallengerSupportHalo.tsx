'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

type Side = 'A' | 'B';

const cobaltGlow = 'rgba(56, 189, 248, 0.45)';
const emberGlow = 'rgba(255, 95, 0, 0.48)';

type ChallengerSupportHaloProps = {
  side: Side;
  burstKey: number;
  /** Leader au classement impact — halo plus large + lueur panneau (via parent). */
  leader?: boolean;
  className?: string;
};

const N_PARTICLES = 10;

/**
 * Particules en orbite + micro-courants (Cobalt A / Ember B).
 */
export function ChallengerSupportHalo({ side, burstKey, leader = false, className = '' }: ChallengerSupportHaloProps) {
  const color = side === 'A' ? 'rgba(56, 189, 248, 0.88)' : 'rgba(255, 130, 55, 0.88)';
  const glow = side === 'A' ? cobaltGlow : emberGlow;
  const stream = side === 'A' ? 'rgba(125, 211, 252, 0.55)' : 'rgba(255, 180, 120, 0.55)';
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

  const R = leader ? 27 : 22;

  return (
    <div
      className={`pointer-events-none absolute left-1/2 top-1/2 z-0 h-[4.25rem] w-[4.25rem] -translate-x-1/2 -translate-y-1/2 ${leader ? 'scale-[1.1]' : ''} ${className}`.trim()}
      aria-hidden
    >
      <motion.div
        className="absolute inset-0 rounded-full"
        animate={{
          boxShadow: [
            `0 0 ${22 + rim * 32}px ${glow}, inset 0 0 ${12 + rim * 22}px ${glow}`,
            `0 0 ${30 + rim * 38}px ${glow}, inset 0 0 ${16 + rim * 28}px ${glow}`,
            `0 0 ${22 + rim * 32}px ${glow}, inset 0 0 ${12 + rim * 22}px ${glow}`,
          ],
        }}
        transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
      />

      <AnimatePresence>
        {burstKey > 0 ? (
          <motion.div
            key={burstKey}
            initial={{ opacity: 0.75, scale: 0.82 }}
            animate={{ opacity: 0, scale: 1.48 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.52, ease: 'easeOut' }}
            className="absolute inset-[-8px] rounded-full"
            style={{
              boxShadow: `0 0 32px 12px ${glow}, inset 0 0 44px 14px ${glow}`,
            }}
          />
        ) : null}
      </AnimatePresence>

      <motion.div
        className="pointer-events-none absolute inset-[12%] rounded-full opacity-[0.28]"
        style={{
          background: `conic-gradient(from 0deg, transparent 0deg, ${stream} 28deg, transparent 56deg, transparent 160deg, ${stream} 188deg, transparent 216deg)`,
        }}
        animate={{ rotate: [0, -360] }}
        transition={{ duration: side === 'A' ? 4.8 : 5.2, repeat: Infinity, ease: 'linear' }}
      />

      {angles.map((θ, i) => (
        <motion.span
          key={i}
          className="absolute left-1/2 top-1/2 h-[2.5px] w-[2.5px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            background: color,
            boxShadow: `0 0 6px 1.5px ${glow}`,
          }}
          animate={{
            x: [
              Math.cos(θ) * R,
              Math.cos(θ + Math.PI * 0.7) * (R + 4),
              Math.cos(θ + Math.PI * 1.35) * R,
              Math.cos(θ + Math.PI * 2) * R,
            ],
            y: [
              Math.sin(θ) * R,
              Math.sin(θ + Math.PI * 0.7) * (R + 4),
              Math.sin(θ + Math.PI * 1.35) * R,
              Math.sin(θ + Math.PI * 2) * R,
            ],
            opacity: [0.3, 0.72, 0.42, 0.3],
            scale: [0.72, 1.05, 0.88, 0.72],
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
