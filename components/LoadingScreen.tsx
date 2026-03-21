'use client';

import { motion } from 'framer-motion';

interface LoadingScreenProps {
  message?: string;
}

export function LoadingScreen({ message = 'Chargement...' }: LoadingScreenProps) {
  return (
    <div className="min-h-screen bg-arena-darker flex items-center justify-center">
      <div className="text-center">
        {/* Animated Logo */}
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            rotate: [0, 180, 360],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="mb-8"
        >
          <div className="w-24 h-24 mx-auto relative">
            <div className="absolute inset-0 bg-arena-blue rounded-full blur-xl opacity-50" />
            <div className="absolute inset-4 bg-arena-red rounded-full blur-xl opacity-50" />
            <div className="absolute inset-8 bg-white rounded-full" />
          </div>
        </motion.div>

        {/* Text */}
        <motion.h2
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="text-2xl font-bold neon-blue mb-4"
        >
          {message}
        </motion.h2>

        {/* Progress Bar */}
        <div className="w-64 h-2 bg-arena-dark rounded-full overflow-hidden mx-auto">
          <motion.div
            animate={{ x: ['-100%', '100%'] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
            className="h-full w-1/2 bg-gradient-to-r from-arena-blue to-arena-red"
          />
        </div>
      </div>
    </div>
  );
}
