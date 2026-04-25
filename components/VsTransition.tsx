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
    // L'animation totale dure environ 2.2 secondes avant de révéler l'arène
    const timer = setTimeout(() => {
      onComplete();
    }, 2200);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <motion.div
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden bg-black"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1, filter: 'blur(10px)' }}
      transition={{ duration: 0.5, ease: 'easeInOut' }}
    >
      {/* Moitié Gauche (Bleu Cobalt) */}
      <motion.div
        className="absolute inset-y-0 left-0 w-1/2 bg-cobalt-600/20 border-r border-cobalt-400/50"
        initial={{ x: '-100%', skewX: -10 }}
        animate={{ x: 0, skewX: 0 }}
        transition={{ duration: 0.4, type: 'spring', damping: 15 }}
      />

      {/* Moitié Droite (Rouge Braise) */}
      <motion.div
        className="absolute inset-y-0 right-0 w-1/2 bg-ember-600/20 border-l border-ember-400/50"
        initial={{ x: '100%', skewX: -10 }}
        animate={{ x: 0, skewX: 0 }}
        transition={{ duration: 0.4, type: 'spring', damping: 15 }}
      />

      {/* Noms des Challengers */}
      <div className="absolute inset-0 flex flex-col justify-center gap-16 sm:flex-row sm:items-center sm:gap-0">
        <motion.div
          className="flex flex-1 items-center justify-end px-8 sm:pr-24"
          initial={{ x: -100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2, type: 'spring' }}
        >
          <h2 className="text-right font-sans text-4xl sm:text-6xl md:text-7xl font-black uppercase text-white drop-shadow-[0_0_25px_rgba(0,82,255,0.9)] truncate max-w-full">
            {challengerA}
          </h2>
        </motion.div>

        <motion.div
          className="flex flex-1 items-center justify-start px-8 sm:pl-24"
          initial={{ x: 100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2, type: 'spring' }}
        >
          <h2 className="text-left font-sans text-4xl sm:text-6xl md:text-7xl font-black uppercase text-white drop-shadow-[0_0_25px_rgba(255,77,0,0.9)] truncate max-w-full">
            {challengerB}
          </h2>
        </motion.div>
      </div>

      {/* Logo VS Central (Impact) */}
      <motion.div
        className="absolute z-10 flex h-24 w-24 sm:h-36 sm:w-36 items-center justify-center rounded-full border-4 border-black bg-gradient-to-br from-prestige-gold to-yellow-600 shadow-[0_0_80px_rgba(212,175,55,0.8)]"
        initial={{ scale: 6, opacity: 0, rotate: -45 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ duration: 0.4, delay: 0.5, type: 'spring', damping: 12 }}
      >
        <span className="font-sans text-4xl sm:text-6xl font-black italic text-black">VS</span>
      </motion.div>

      {/* Titre du débat */}
      {debateTitle && (
        <motion.div
          className="absolute bottom-16 inset-x-0 px-4 text-center z-20"
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.8 }}
        >
          <p className="font-mono text-sm sm:text-base font-bold uppercase tracking-widest text-white/90 drop-shadow-md bg-black/40 inline-block px-4 py-2 rounded-full backdrop-blur-md border border-white/10">
            {debateTitle}
          </p>
        </motion.div>
      )}
    </motion.div>
  );
}
