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
    const timer = setTimeout(() => onComplete(), 3000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  const colors = [
    'text-purple-400 drop-shadow-[0_0_30px_rgba(168,85,247,0.8)]',
    'text-emerald-400 drop-shadow-[0_0_30px_rgba(16,185,129,0.8)]',
    'text-yellow-400 drop-shadow-[0_0_30px_rgba(234,179,8,0.8)]',
    'text-blue-400 drop-shadow-[0_0_30px_rgba(59,130,246,0.8)]',
  ];

  return (
    <motion.div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/95 backdrop-blur-3xl"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
    >
      <div className="flex flex-col items-center justify-center gap-4 px-6">
        {challengers.map((name, i) => (
          <div key={`${name}-${i}`} className="flex flex-col items-center gap-3">
            {i > 0 && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.4 + i * 0.1 }}
                className="flex h-10 w-10 items-center justify-center rounded-full border-4 border-black bg-plasma-500 shadow-glow-plasma"
              >
                <span className="text-sm font-black italic text-white">VS</span>
              </motion.div>
            )}
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + i * 0.1 }}
              className={`text-center font-sans text-[9vw] font-black uppercase italic leading-none sm:text-6xl ${colors[i % colors.length]} max-w-[min(100vw,36rem)] break-words`}
            >
              {name}
            </motion.h2>
          </div>
        ))}
      </div>
      {debateTitle ? (
        <motion.p
          className="absolute inset-x-0 bottom-16 z-10 px-4 text-center text-sm font-black uppercase tracking-widest text-white/90 drop-shadow-[0_0_12px_rgba(0,0,0,0.8)] sm:bottom-20 sm:text-base"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9 }}
        >
          {debateTitle}
        </motion.p>
      ) : null}
    </motion.div>
  );
}
