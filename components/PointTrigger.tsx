'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const MAX_FLOAT_LABELS = 8;
const DECAY_PER_TICK = 0.038;
const TICK_MS = 85;
const CLICK_BUMP = 0.22;

function ringColor(intensity: number): string {
  return `color-mix(in srgb, rgb(0, 82, 255) ${(1 - intensity) * 100}%, rgb(255, 77, 0) ${intensity * 100}%)`;
}

type PointTriggerProps = {
  count: number;
  onPulse: () => void;
  interactive: boolean;
  /** Masque le nombre cumulé au centre (tap / anneaux inchangés). */
  hideImpactCount?: boolean;
  'aria-label'?: string;
  className?: string;
};

type ImpactRing = { key: string; intensity: number };

/**
 * Impact Rings : anneaux de pression Cobalt → Ember selon l’intensité cumulée des clics (décroissance).
 */
export function PointTrigger({
  count,
  onPulse,
  interactive,
  hideImpactCount = false,
  'aria-label': ariaLabel = 'Envoyer une voix pour ce challenger',
  className = '',
}: PointTriggerProps) {
  const [floatKeys, setFloatKeys] = useState<string[]>([]);
  const [animTick, setAnimTick] = useState(0);
  const [intensity, setIntensity] = useState(0);
  const [rings, setRings] = useState<ImpactRing[]>([]);

  useEffect(() => {
    const id = setInterval(() => {
      setIntensity((i) => (i <= DECAY_PER_TICK ? 0 : i - DECAY_PER_TICK));
    }, TICK_MS);
    return () => clearInterval(id);
  }, []);

  const pushFloat = useCallback(() => {
    const k = `pf_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    setFloatKeys((prev) => [...prev.slice(-(MAX_FLOAT_LABELS - 1)), k]);
  }, []);

  const removeFloat = useCallback((k: string) => {
    setFloatKeys((prev) => prev.filter((x) => x !== k));
  }, []);

  const removeRing = useCallback((key: string) => {
    setRings((prev) => prev.filter((r) => r.key !== key));
  }, []);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!interactive) return;
    setAnimTick((t) => t + 1);
    setIntensity((prev) => {
      const next = Math.min(1, prev + CLICK_BUMP);
      const rk = `ir_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      setRings((r) => [...r.slice(-5), { key: rk, intensity: next }]);
      return next;
    });
    onPulse();
    pushFloat();
  };

  const stroke = ringColor(intensity);

  return (
    <div className={`relative flex flex-col items-center justify-center ${className}`}>
      <div className="relative h-11 w-11 shrink-0">
        <AnimatePresence>
          {floatKeys.map((k) => (
            <motion.span
              key={k}
              initial={{ opacity: 1, y: 0, scale: 1 }}
              animate={{ opacity: 0, y: -36, scale: 1.08 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.58, ease: [0.22, 0.61, 0.36, 1] }}
              onAnimationComplete={() => removeFloat(k)}
              className="pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 font-mono text-[11px] font-black tabular-nums text-white drop-shadow-[0_1px_8px_rgba(0,0,0,0.85)]"
              aria-hidden
            >
              +1
            </motion.span>
          ))}
        </AnimatePresence>

        <motion.button
          type="button"
          disabled={!interactive}
          onClick={handleClick}
          aria-label={ariaLabel}
          style={{
            boxShadow: `0 0 0 2px ${stroke}55, 0 10px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.05)`,
          }}
          className={[
            'relative flex h-11 w-11 items-center justify-center overflow-visible rounded-full',
            'border-0 bg-black/40 backdrop-blur-md',
            interactive ? 'cursor-pointer touch-manipulation hover:bg-black/50' : 'cursor-default',
          ].join(' ')}
        >
          <AnimatePresence>
            {rings.map((r) => (
              <motion.span
                key={r.key}
                initial={{ scale: 1, opacity: 0.55 }}
                animate={{ scale: 2.75, opacity: 0 }}
                transition={{ duration: 0.68, ease: 'easeOut' }}
                onAnimationComplete={() => removeRing(r.key)}
                className="pointer-events-none absolute inset-0 rounded-full border-0"
                style={{
                  boxShadow: `0 0 0 2px ${ringColor(r.intensity)}aa, 0 0 20px ${ringColor(r.intensity)}44`,
                }}
                aria-hidden
              />
            ))}
          </AnimatePresence>

          <motion.span
            key={animTick}
            initial={{ scale: 1 }}
            animate={{ scale: interactive && animTick > 0 ? [1, 1.18, 1] : 1 }}
            transition={{ duration: 0.38, ease: [0.34, 1.56, 0.64, 1] }}
            className="relative z-[1] flex h-full w-full items-center justify-center rounded-full"
          >
            {!hideImpactCount && (
              <span className="font-mono text-[11px] font-black tabular-nums leading-none tracking-tight text-white/95">
                {count > 0 ? count : ''}
              </span>
            )}
          </motion.span>
        </motion.button>
      </div>
    </div>
  );
}
