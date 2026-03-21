'use client';

import { motion } from 'framer-motion';

interface TensionButtonProps {
  tension: number; // 0-100
  onTap: () => void;
}

export function TensionButton({ tension, onTap }: TensionButtonProps) {
  // Color based on tension level
  const getColor = () => {
    if (tension < 30) return { from: '#3b82f6', to: '#6366f1' }; // blue → indigo
    if (tension < 60) return { from: '#f97316', to: '#eab308' }; // orange → yellow
    if (tension < 85) return { from: '#ef4444', to: '#f97316' }; // red → orange
    return { from: '#dc2626', to: '#7f1d1d' }; // deep red
  };

  const { from, to } = getColor();
  const label = tension < 30 ? '😐' : tension < 60 ? '🔥' : tension < 85 ? '💥' : '☠️';

  return (
    <motion.button
      onClick={onTap}
      whileTap={{ scale: 0.92 }}
      className="relative w-16 h-16 rounded-full overflow-hidden flex-shrink-0 shadow-lg"
      style={{ boxShadow: `0 0 20px ${from}66` }}
    >
      {/* Background fill (bottom to top) */}
      <div className="absolute inset-0 bg-gray-800" />
      <motion.div
        className="absolute bottom-0 left-0 right-0"
        animate={{ height: `${tension}%` }}
        transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        style={{
          background: `linear-gradient(to top, ${from}, ${to})`,
        }}
      />

      {/* Border ring */}
      <div
        className="absolute inset-0 rounded-full border-2"
        style={{ borderColor: from }}
      />

      {/* Content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
        <span className="text-lg leading-none">{label}</span>
        <span className="text-white font-black text-[10px] leading-tight">
          {Math.round(tension)}%
        </span>
      </div>
    </motion.button>
  );
}
