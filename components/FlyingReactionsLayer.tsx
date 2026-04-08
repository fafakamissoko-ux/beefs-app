'use client';

import { useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/** Réactions rapides style TikTok / Instagram Live (spectateurs). */
export const SPECTATOR_QUICK_REACTIONS = ['🔥', '👏', '🤔', '😮'] as const;

export type FlyingReactionEntry = {
  id: string;
  emoji: string;
  /** Position horizontale de l’ancre (0–100 %). */
  x: number;
  /** Dérives horizontales (px) pour la trajectoire pseudo-aléatoire. */
  driftPx: [number, number, number, number];
};

const MAX_CONCURRENT = 28;
const ANIM_SEC = 3.15;

function randomDrift(): [number, number, number, number] {
  const r = () => (Math.random() - 0.5) * 110;
  return [r(), r(), r(), r()];
}

export function createFlyingReactionEntry(emoji: string): FlyingReactionEntry {
  return {
    id: `f_${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`}`,
    emoji,
    x: 6 + Math.random() * 88,
    driftPx: randomDrift(),
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
};

/**
 * Calque d’emojis qui s’élèvent depuis le bas (pointer-events: none).
 * Démonter chaque particule via `onRemove` à la fin de l’animation — pas de setTimeout.
 */
export function FlyingReactionsLayer({ reactions, onRemove }: FlyingReactionsLayerProps) {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-50 overflow-hidden"
      style={{
        top: 'clamp(5rem, 18vh, 12rem)',
        contain: 'strict',
      }}
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
  const { emoji, driftPx } = entry;

  const handleComplete = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  };

  return (
    <motion.div
      initial={{ y: '0vh', opacity: 0, scale: 0.35, x: 0 }}
      animate={{
        y: '-42vh',
        opacity: [0, 1, 1, 0.92, 0],
        scale: [0.35, 1.28, 1.05, 0.95, 0.42],
        x: [0, driftPx[0], driftPx[1], driftPx[2], driftPx[3]],
      }}
      transition={{
        duration: ANIM_SEC,
        ease: [0.22, 0.61, 0.36, 1],
        opacity: { times: [0, 0.07, 0.32, 0.78, 1], duration: ANIM_SEC },
        x: { times: [0, 0.22, 0.45, 0.72, 1], duration: ANIM_SEC },
      }}
      onAnimationComplete={handleComplete}
      className="text-3xl sm:text-4xl will-change-transform"
    >
      <span className="inline-block drop-shadow-[0_2px_10px_rgba(0,0,0,0.55)]">{emoji}</span>
    </motion.div>
  );
}
