'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Zap } from 'lucide-react';

interface ComboCounterProps {
  combo: number;
  show: boolean;
}

export function ComboCounter({ combo, show }: ComboCounterProps) {
  if (!show || combo < 2) return null;

  const getComboSize = () => {
    if (combo >= 10) return 'text-6xl';
    if (combo >= 5) return 'text-5xl';
    return 'text-4xl';
  };

  const getComboColor = () => {
    if (combo >= 10) return 'text-orange-400';
    if (combo >= 5) return 'text-yellow-400';
    return 'text-blue-400';
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        exit={{ scale: 0, rotate: 180 }}
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none"
      >
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
          }}
          transition={{
            duration: 0.5,
            repeat: Infinity,
          }}
          className="relative"
        >
          {/* Glow Effect */}
          <div className={`absolute inset-0 blur-3xl opacity-50 ${getComboColor()}`}></div>
          
          {/* Main Content */}
          <div className="relative bg-black/80 backdrop-blur-sm rounded-2xl p-8 border-4 border-current">
            <div className="flex flex-col items-center gap-2">
              <Zap className={`w-12 h-12 ${getComboColor()}`} />
              <div className={`font-black ${getComboSize()} ${getComboColor()} leading-none`}>
                {combo}x
              </div>
              <div className="text-white font-bold text-xl">COMBO!</div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
