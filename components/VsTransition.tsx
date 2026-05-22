'use client';

import { useEffect } from 'react';
import { motion } from 'framer-motion';

interface VsTransitionProps {
  challengers: string[];
  debateTitle?: string;
  onComplete: () => void;
}

export function VsTransition({ challengers, debateTitle, onComplete }: VsTransitionProps) {
  useEffect(() => {
    const timer = setTimeout(() => onComplete(), 3500);
    return () => clearTimeout(timer);
  }, [onComplete]);

  const colors = [
    'text-white drop-shadow-[0_0_40px_rgba(0,240,255,0.85)]',
    'text-emerald-400 drop-shadow-[0_0_40px_rgba(16,185,129,1)]',
    'text-yellow-400 drop-shadow-[0_0_40px_rgba(234,179,8,1)]',
    'text-blue-400 drop-shadow-[0_0_40px_rgba(59,130,246,1)]',
  ];

  const validChallengers = challengers.filter(Boolean);

  return (
    <motion.div
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden bg-transparent bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-cyan-600/20 via-obsidian-950 to-black backdrop-blur-3xl"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1, filter: 'blur(20px)' }}
      transition={{ duration: 0.6, ease: 'easeInOut' }}
    >
      <div className="pointer-events-none absolute inset-0 z-0 bg-[url('/noise.png')] opacity-10 mix-blend-overlay" />

      <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 px-4 sm:gap-4">
        {validChallengers.map((name, i) => (
          <div key={`${name}-${i}`} className="flex flex-col items-center gap-2">
            {i > 0 && (
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', damping: 12, delay: 0.4 + i * 0.15 }}
                className="relative z-30 flex h-12 w-12 items-center justify-center rounded-full border-[3px] border-obsidian-950 bg-gradient-to-br from-cyan-500 to-obsidian-900 shadow-[0_0_50px_rgba(0,240,255,0.8)] sm:h-16 sm:w-16"
              >
                <span className="font-sans text-xl font-black italic text-white drop-shadow-md sm:text-2xl">VS</span>
              </motion.div>
            )}
            <motion.div
              initial={{ x: i % 2 === 0 ? -150 : 150, opacity: 0, skewX: -15 }}
              animate={{ x: 0, opacity: 1, skewX: 0 }}
              transition={{ type: 'spring', damping: 15, delay: 0.2 + i * 0.15 }}
            >
              <h2
                className={`max-w-[95vw] break-words text-center font-sans text-[10vw] font-black uppercase italic leading-none tracking-tight sm:text-7xl md:text-8xl ${colors[i % colors.length]}`}
              >
                {name}
              </h2>
            </motion.div>
          </div>
        ))}
      </div>

      {debateTitle && (
        <motion.div
          className="absolute inset-x-0 bottom-10 z-20 px-6 text-center sm:bottom-16"
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 1.5 }}
        >
          <div className="relative inline-block">
            <div className="absolute inset-0 rounded-full bg-white/20 blur-xl" />
            <p className="relative rounded-2xl border border-white/20 bg-black/30 px-8 py-4 font-sans text-xs font-bold uppercase tracking-[0.2em] text-white shadow-2xl backdrop-blur-md sm:text-sm md:text-base">
              {debateTitle}
            </p>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
