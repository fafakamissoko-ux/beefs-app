'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useFeatureGuide } from '@/hooks/useFeatureGuide';

interface FeatureGuideProps {
  id: string;
  title: string;
  description: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  /** Extra offset from the target element */
  offset?: number;
  /** Dark or light style */
  variant?: 'dark' | 'light';
}

const arrowStyles: Record<string, string> = {
  top: 'bottom-[-6px] left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-b-transparent',
  bottom: 'top-[-6px] left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-t-transparent',
  left: 'right-[-6px] top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-r-transparent',
  right: 'left-[-6px] top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-l-transparent',
};

const arrowBorderDir: Record<string, string> = {
  top: 'border-t-[#1a1a2e]',
  bottom: 'border-b-[#1a1a2e]',
  left: 'border-l-[#1a1a2e]',
  right: 'border-r-[#1a1a2e]',
};

export function FeatureGuide({
  id,
  title,
  description,
  position = 'bottom',
  variant = 'dark',
}: FeatureGuideProps) {
  const { visible, dismiss } = useFeatureGuide(id);

  const bgClass = variant === 'dark'
    ? 'bg-[#1a1a2e] border-brand-500/30'
    : 'bg-white border-gray-200';
  const textClass = variant === 'dark' ? 'text-white' : 'text-gray-900';
  const subtextClass = variant === 'dark' ? 'text-white/70' : 'text-gray-600';

  return (
    <AnimatePresence>
      {visible && (
        <>
          {/* Subtle backdrop pulse to draw attention */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 rounded-xl ring-2 ring-brand-500/50 pointer-events-none z-[98]"
          />
          <motion.div
            initial={{ opacity: 0, y: position === 'top' ? 8 : position === 'bottom' ? -8 : 0, x: position === 'left' ? 8 : position === 'right' ? -8 : 0, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className={`absolute z-[99] ${
              position === 'bottom' ? 'top-full mt-2' :
              position === 'top' ? 'bottom-full mb-2' :
              position === 'left' ? 'right-full mr-2' :
              'left-full ml-2'
            }`}
            style={{ minWidth: 200, maxWidth: 260 }}
          >
            <div className={`relative rounded-xl border px-3.5 py-2.5 shadow-xl ${bgClass}`}>
              {/* Arrow */}
              <div className={`absolute w-0 h-0 border-[6px] ${arrowStyles[position]} ${arrowBorderDir[position]}`} />

              {/* Dismiss X */}
              <button
                onClick={dismiss}
                className={`absolute top-1.5 right-2 ${subtextClass} hover:${textClass} text-sm leading-none`}
              >
                ✕
              </button>

              <p className={`text-[12px] font-bold ${textClass} pr-4`}>{title}</p>
              <p className={`text-[11px] mt-0.5 leading-snug ${subtextClass}`}>{description}</p>

              <button
                onClick={dismiss}
                className="mt-2 w-full bg-brand-500 hover:bg-brand-600 text-white text-[11px] font-bold py-1.5 rounded-lg transition-colors"
              >
                Compris
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
