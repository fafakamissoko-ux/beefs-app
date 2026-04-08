'use client';

import { useCallback, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const MAX_FLOAT_LABELS = 8;

type PointTriggerProps = {
  count: number;
  onPulse: () => void;
  interactive: boolean;
  'aria-label'?: string;
  className?: string;
};

/**
 * Cercle glass discret (~44px) : pulse scale 1.2, onde quasi invisible, « +1 » qui monte.
 */
export function PointTrigger({
  count,
  onPulse,
  interactive,
  'aria-label': ariaLabel = 'Envoyer une voix pour ce challenger',
  className = '',
}: PointTriggerProps) {
  const [floatKeys, setFloatKeys] = useState<string[]>([]);
  const [animTick, setAnimTick] = useState(0);

  const pushFloat = useCallback(() => {
    const k = `pf_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    setFloatKeys((prev) => [...prev.slice(-(MAX_FLOAT_LABELS - 1)), k]);
  }, []);

  const removeFloat = useCallback((k: string) => {
    setFloatKeys((prev) => prev.filter((x) => x !== k));
  }, []);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!interactive) return;
    setAnimTick((t) => t + 1);
    onPulse();
    pushFloat();
  };

  return (
    <div className={`relative flex flex-col items-end ${className}`}>
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
              className="pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 text-[11px] font-black tabular-nums text-white drop-shadow-[0_1px_8px_rgba(0,0,0,0.85)]"
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
          className={[
            'relative flex h-11 w-11 items-center justify-center overflow-visible rounded-full',
            'border border-white/20 bg-black/25 backdrop-blur-sm shadow-sm',
            interactive
              ? 'cursor-pointer touch-manipulation hover:bg-black/35'
              : 'cursor-default',
          ].join(' ')}
        >
          {/* Onde de choc (très discrète) */}
          <AnimatePresence>
            {animTick > 0 && (
              <motion.span
                key={animTick}
                initial={{ scale: 1, opacity: 0.18 }}
                animate={{ scale: 2.35, opacity: 0 }}
                transition={{ duration: 0.55, ease: 'easeOut' }}
                className="pointer-events-none absolute inset-0 rounded-full border border-white/35"
                aria-hidden
              />
            )}
          </AnimatePresence>

          {/* Contenu : pulse scale 1 → 1.2 → 1 */}
          <motion.span
            key={animTick}
            initial={{ scale: 1 }}
            animate={{ scale: interactive && animTick > 0 ? [1, 1.2, 1] : 1 }}
            transition={{ duration: 0.38, ease: [0.34, 1.56, 0.64, 1] }}
            className="relative z-[1] flex h-full w-full items-center justify-center rounded-full"
          >
            <span className="text-[11px] font-black tabular-nums leading-none tracking-tight text-white/95">
              {count}
            </span>
          </motion.span>
        </motion.button>
      </div>
    </div>
  );
}
