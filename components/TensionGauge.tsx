'use client';

import { motion } from 'framer-motion';
import { Flame, Zap } from 'lucide-react';

interface TensionGaugeProps {
  tension: number;
  isChaosMode: boolean;
  onTap: () => void;
}

export function TensionGauge({ tension, isChaosMode, onTap }: TensionGaugeProps) {
  const tensionColor = 
    tension >= 80 ? 'from-red-500 to-orange-500' :
    tension >= 50 ? 'from-yellow-500 to-orange-500' :
    'from-blue-500 to-cyan-500';

  return (
    <div className="bg-arena-dark/95 backdrop-blur-sm border-t border-arena-gray p-1.5 sm:p-2 md:p-3">
      <div className="max-w-7xl mx-auto">
        {/* Compact Layout */}
        <div className="flex items-center gap-2 sm:gap-3 md:gap-4">
          {/* Icon & Label */}
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-fit flex-shrink-0">
            <Flame className={`w-4 h-4 sm:w-5 sm:h-5 ${tension >= 80 ? 'text-red-500' : tension >= 50 ? 'text-yellow-500' : 'text-blue-500'} ${tension >= 80 ? 'animate-pulse' : ''}`} />
            <span className="text-xs sm:text-sm font-bold hidden md:inline">TENSION</span>
          </div>

          {/* Gauge Bar */}
          <div className="flex-1 relative h-5 sm:h-6 bg-arena-darker rounded-full overflow-hidden border border-arena-gray min-w-0">
            <motion.div
              className={`absolute left-0 top-0 bottom-0 bg-gradient-to-r ${tensionColor}`}
              initial={{ width: 0 }}
              animate={{ width: `${tension}%` }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            />
            
            {/* Percentage inside bar */}
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xs sm:text-sm font-black text-white drop-shadow-lg">
                {tension}%
              </span>
            </div>

            {/* Chaos indicator */}
            {tension >= 90 && (
              <motion.div
                className="absolute right-1 sm:right-2 top-1/2 -translate-y-1/2"
                animate={{ opacity: [0.5, 1, 0.5], scale: [1, 1.2, 1] }}
                transition={{ duration: 0.5, repeat: Infinity }}
              >
                <Zap className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
              </motion.div>
            )}
          </div>

          {/* Tap Button */}
          <button
            onClick={onTap}
            className={`px-3 sm:px-4 md:px-6 py-1.5 sm:py-2 rounded-lg font-bold text-xs sm:text-sm transition-all transform active:scale-90 whitespace-nowrap touch-manipulation flex-shrink-0 ${
              isChaosMode 
                ? 'bg-gradient-to-r from-red-600 to-orange-600 text-white animate-pulse' 
                : tension >= 80
                  ? 'bg-red-500 hover:bg-red-600 text-white'
                  : 'bg-blue-500 hover:bg-blue-600 text-white'
            }`}
          >
            <span className="hidden sm:inline">{isChaosMode ? '🔥 CHAOS' : '👆 TAP'}</span>
            <span className="sm:hidden">{isChaosMode ? '🔥' : '👆'}</span>
          </button>
        </div>

        {/* Status Message - Only when critical */}
        {tension >= 90 && !isChaosMode && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center text-red-400 font-bold text-xs mt-1 sm:mt-2 animate-pulse"
          >
            ⚠️ Zone de chaos imminente
          </motion.div>
        )}
      </div>
    </div>
  );
}
