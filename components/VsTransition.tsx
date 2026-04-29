'use client';

import { useEffect } from 'react';
import { motion } from 'framer-motion';

interface VsTransitionProps {
  challengerA: string;
  challengerB: string;
  debateTitle?: string;
  onComplete: () => void;
}

export function VsTransition({ challengerA, challengerB, debateTitle, onComplete }: VsTransitionProps) {
  useEffect(() => {
    const timer = setTimeout(() => onComplete(), 2400);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <motion.div
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden bg-black/90 backdrop-blur-xl"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1, filter: 'blur(20px)' }}
      transition={{ duration: 0.5 }}
    >
      {/* Plasma Gauche */}
      <motion.div
        className="absolute inset-y-0 left-0 w-1/2 bg-plasma-600/20 border-r border-plasma-400/30 shadow-[40px_0_100px_rgba(162,0,255,0.15)]"
        initial={{ x: '-100%', skewX: -15 }}
        animate={{ x: 0, skewX: 0 }}
        transition={{ duration: 0.5, type: 'spring', damping: 15 }}
      />

      {/* Émeraude/Cyan Droite */}
      <motion.div
        className="absolute inset-y-0 right-0 w-1/2 bg-emerald-600/20 border-l border-emerald-400/30 shadow-[-40px_0_100px_rgba(16,185,129,0.15)]"
        initial={{ x: '100%', skewX: -15 }}
        animate={{ x: 0, skewX: 0 }}
        transition={{ duration: 0.5, type: 'spring', damping: 15 }}
      />

      {/* Noms */}
      <div className="absolute inset-0 flex flex-col justify-center gap-16 sm:flex-row sm:items-center sm:gap-0 z-20">
        <motion.div
          className="flex flex-1 items-center justify-end px-6 sm:pr-24"
          initial={{ x: -100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <h2 className="text-right font-sans text-4xl sm:text-6xl md:text-7xl font-black uppercase italic text-white drop-shadow-[0_0_25px_rgba(168,85,247,0.9)] line-clamp-2 px-4 pb-2">
            {challengerA}
          </h2>
        </motion.div>
        <motion.div
          className="flex flex-1 items-center justify-start px-6 sm:pl-24"
          initial={{ x: 100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <h2 className="text-left font-sans text-4xl sm:text-6xl md:text-7xl font-black uppercase italic text-white drop-shadow-[0_0_25px_rgba(16,185,129,0.9)] line-clamp-2 px-4 pb-2">
            {challengerB}
          </h2>
        </motion.div>
      </div>

      {/* VS Central Brutal */}
      <motion.div
        className="absolute z-30 flex h-28 w-28 sm:h-40 sm:w-40 items-center justify-center rounded-full border-[6px] border-obsidian-950 bg-gradient-to-br from-plasma-500 to-obsidian-900 shadow-[0_0_80px_rgba(162,0,255,0.6)]"
        initial={{ scale: 8, opacity: 0, rotate: -90 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ duration: 0.5, delay: 0.6, type: 'spring', damping: 12 }}
      >
        <span className="font-sans text-5xl sm:text-7xl font-black italic text-white drop-shadow-md">VS</span>
      </motion.div>

      {/* Titre */}
      {debateTitle && (
        <motion.div className="absolute bottom-16 inset-x-0 px-4 text-center z-20" initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.5, delay: 0.9 }}>
          <p className="font-sans text-sm sm:text-lg font-bold uppercase tracking-widest text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.5)] bg-black/60 inline-block px-6 py-3 rounded-2xl border border-white/10 backdrop-blur-xl">
            {debateTitle}
          </p>
        </motion.div>
      )}
    </motion.div>
  );
}
