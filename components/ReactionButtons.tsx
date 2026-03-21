'use client';

import { motion } from 'framer-motion';

interface ReactionButtonsProps {
  onReaction: (emoji: string) => void;
  disabled?: boolean;
}

const REACTIONS = [
  { emoji: '🔥', label: 'Fire' },
  { emoji: '👏', label: 'Applause' },
  { emoji: '😂', label: 'LOL' },
  { emoji: '😱', label: 'Shocked' },
  { emoji: '💀', label: 'Dead' },
  { emoji: '💯', label: '100' },
  { emoji: '👀', label: 'Eyes' },
  { emoji: '🎯', label: 'Target' },
];

export function ReactionButtons({ onReaction, disabled = false }: ReactionButtonsProps) {
  return (
    <div className="flex gap-1 flex-wrap justify-center p-2 bg-arena-darker/80 backdrop-blur-sm rounded-lg">
      {REACTIONS.map((reaction) => (
        <motion.button
          key={reaction.emoji}
          onClick={() => onReaction(reaction.emoji)}
          disabled={disabled}
          whileHover={{ scale: 1.2 }}
          whileTap={{ scale: 0.9 }}
          className="text-2xl hover:bg-white/10 rounded-lg p-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title={reaction.label}
        >
          {reaction.emoji}
        </motion.button>
      ))}
    </div>
  );
}
