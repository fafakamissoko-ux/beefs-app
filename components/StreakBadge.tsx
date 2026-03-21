'use client';

import { motion } from 'framer-motion';
import { Flame } from 'lucide-react';

interface StreakBadgeProps {
  streak: number;
  compact?: boolean;
}

export function StreakBadge({ streak, compact = false }: StreakBadgeProps) {
  if (streak < 1) return null;

  const getStreakColor = () => {
    if (streak >= 10) return 'from-orange-500 to-red-500';
    if (streak >= 5) return 'from-yellow-500 to-orange-500';
    return 'from-yellow-400 to-yellow-500';
  };

  const getIntensity = () => {
    if (streak >= 10) return 'animate-pulse';
    if (streak >= 5) return '';
    return '';
  };

  if (compact) {
    return (
      <motion.div
        animate={{ scale: [1, 1.1, 1] }}
        transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 2 }}
        className={`flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r ${getStreakColor()} ${getIntensity()}`}
      >
        <Flame className="w-3 h-3 text-white" />
        <span className="text-white font-bold text-xs">{streak}</span>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-r ${getStreakColor()} ${getIntensity()}`}
    >
      <Flame className="w-5 h-5 text-white" />
      <div>
        <div className="text-white font-bold">{streak} jours</div>
        <div className="text-xs text-white/80">Série en cours</div>
      </div>
    </motion.div>
  );
}
