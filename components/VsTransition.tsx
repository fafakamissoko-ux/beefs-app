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
    const timer = setTimeout(() => onComplete(), 2800);
    return () => clearTimeout(timer);
  }, [onComplete]);

  const colors = [
    'text-purple-400 drop-shadow-[0_0_25px_rgba(168,85,247,0.9)]',
    'text-emerald-400 drop-shadow-[0_0_25px_rgba(16,185,129,0.9)]',
    'text-yellow-400 drop-shadow-[0_0_25px_rgba(234,179,8,0.9)]',
    'text-blue-400 drop-shadow-[0_0_25px_rgba(59,130,246,0.9)]',
  ];

  return (
    <motion.div
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden bg-black/95 backdrop-blur-3xl"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1, filter: 'blur(20px)' }}
      transition={{ duration: 0.5 }}
    >
      <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 px-4 sm:gap-6">
        {challengers.map((name, i) => (
          <div key={`${name}-${i}`} className="flex flex-col items-center gap-4">
            {i > 0 && (
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.3 + i * 0.1 }}
                className="flex h-12 w-12 items-center justify-center rounded-full border-[4px] border-obsidian-950 bg-gradient-to-br from-plasma-500 to-obsidian-900 shadow-[0_0_30px_rgba(162,0,255,0.6)] sm:h-16 sm:w-16"
              >
                <span className="font-sans text-xl font-black italic text-white drop-shadow-md sm:text-2xl">VS</span>
              </motion.div>
            )}
            <motion.div
              initial={{ x: i % 2 === 0 ? -100 : 100, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.2 + i * 0.1 }}
            >
              <h2
                className={`text-center font-sans text-4xl font-black uppercase italic sm:text-5xl md:text-6xl ${colors[i % colors.length]} line-clamp-1`}
              >
                {name}
              </h2>
            </motion.div>
          </div>
        ))}
      </div>
      {debateTitle && (
        <motion.div
          className="absolute inset-x-0 bottom-12 z-20 px-4 text-center sm:bottom-16"
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 1.2 }}
        >
          <p className="inline-block rounded-2xl border border-white/10 bg-black/60 px-6 py-3 font-sans text-sm font-bold uppercase tracking-widest text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.5)] backdrop-blur-xl sm:text-lg">
            {debateTitle}
          </p>
        </motion.div>
      )}
    </motion.div>
  );
}
