'use client';

import { useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/** Réactions rapides (spectateurs). */
export const SPECTATOR_QUICK_REACTIONS = ['🔥', '👏', '🤔', '😮'] as const;

export type FlyingReactionEntry = {
  id: string;
  emoji: string;
  /** Position horizontale de l’ancre (0–100 %). */
  x: number;
  /** Angle de départ de l’orbite (rad). */
  orbitStartAngle: number;
  /** Sens orbital (+1 ou -1). */
  orbitDir: number;
};

const MAX_CONCURRENT = 28;
const ANIM_SEC = 3.15;

export function createFlyingReactionEntry(emoji: string): FlyingReactionEntry {
  return {
    id: `f_${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`}`,
    emoji,
    x: 6 + Math.random() * 88,
    orbitStartAngle: Math.random() * Math.PI * 2,
    orbitDir: Math.random() > 0.5 ? 1 : -1,
  };
}

/** Ajoute une entrée en respectant un plafond (évite l’accumulation en cas de spam). */
export function pushFlyingReaction(
  prev: FlyingReactionEntry[],
  entry: FlyingReactionEntry,
): FlyingReactionEntry[] {
  const next = [...prev, entry];
  if (next.length <= MAX_CONCURRENT) return next;
  return next.slice(-MAX_CONCURRENT);
}

type FlyingReactionsLayerProps = {
  reactions: FlyingReactionEntry[];
  onRemove: (id: string) => void;
  /** `strip` = bandeau sociale (overflow contenu) ; `video` = ancien calque plein écran haut */
  variant?: 'video' | 'strip';
};

/**
 * Calque d’emojis en orbite quasi gravitationnelle puis disparition (pointer-events: none).
 */
export function FlyingReactionsLayer({
  reactions,
  onRemove,
  variant = 'video',
}: FlyingReactionsLayerProps) {
  return (
    <div
      className={`pointer-events-none z-50 overflow-hidden ${
        variant === 'strip'
          ? 'absolute inset-0 contain-strict'
          : 'absolute inset-x-0 bottom-0'
      }`}
      style={
        variant === 'strip'
          ? { contain: 'strict' }
          : {
              top: 'clamp(5rem, 18vh, 12rem)',
              contain: 'strict',
            }
      }
      aria-hidden
    >
      <AnimatePresence initial={false}>
        {reactions.map((r) => (
          <div
            key={r.id}
            className="absolute bottom-0"
            style={{ left: `${r.x}%`, transform: 'translateX(-50%)' }}
          >
            <FlyingEmoji entry={r} onDone={() => onRemove(r.id)} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function FlyingEmoji({
  entry,
  onDone,
}: {
  entry: FlyingReactionEntry;
  onDone: () => void;
}) {
  const doneRef = useRef(false);
  const { emoji, orbitStartAngle: θ0, orbitDir } = entry;

  const { x, y } = useMemo(() => {
    const steps = 5;
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const sweep = t * Math.PI * 0.85 * orbitDir;
      const R = 22 + t * 145;
      const θ = θ0 + sweep;
      xs.push(Math.cos(θ) * R);
      ys.push(-Math.sin(θ) * R - t * 110);
    }
    return { x: xs, y: ys };
  }, [θ0, orbitDir]);

  const handleComplete = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.4 }}
      animate={{
        opacity: [0, 1, 1, 1, 0.85, 0],
        scale: [0.4, 1.2, 1.05, 0.98, 0.88, 0.45],
        x,
        y,
      }}
      transition={{
        duration: ANIM_SEC,
        ease: [0.22, 0.61, 0.36, 1],
        opacity: { times: [0, 0.06, 0.2, 0.45, 0.78, 1], duration: ANIM_SEC },
        scale: { times: [0, 0.08, 0.22, 0.45, 0.72, 1], duration: ANIM_SEC },
        x: { times: [0, 0.2, 0.42, 0.62, 0.82, 1], duration: ANIM_SEC },
        y: { times: [0, 0.2, 0.42, 0.62, 0.82, 1], duration: ANIM_SEC },
      }}
      onAnimationComplete={handleComplete}
      className="text-3xl sm:text-4xl will-change-transform"
    >
      <span className="inline-block drop-shadow-[0_2px_10px_rgba(0,0,0,0.55)]">{emoji}</span>
    </motion.div>
  );
}
