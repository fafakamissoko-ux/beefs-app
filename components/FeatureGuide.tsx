'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useFeatureGuide } from '@/hooks/useFeatureGuide';

interface FeatureGuideProps {
  id: string;
  title: string;
  description: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  /** Horizontal align for top/bottom, vertical align for left/right */
  align?: 'start' | 'center' | 'end';
  variant?: 'dark' | 'light';
  /** Masque la bulle (ex. participant déjà dans la salle avec d’autres pairs) */
  suppress?: boolean;
}

function getArrowPosition(position: string, align: string): string {
  const base: Record<string, string> = {
    top: 'bottom-[-6px] border-l-transparent border-r-transparent border-b-transparent',
    bottom: 'top-[-6px] border-l-transparent border-r-transparent border-t-transparent',
    left: 'right-[-6px] border-t-transparent border-b-transparent border-r-transparent',
    right: 'left-[-6px] border-t-transparent border-b-transparent border-l-transparent',
  };

  const horizontal = position === 'top' || position === 'bottom';
  let alignClass: string;
  if (horizontal) {
    alignClass = align === 'end' ? 'right-4' : align === 'start' ? 'left-4' : 'left-1/2 -translate-x-1/2';
  } else {
    alignClass = align === 'end' ? 'bottom-4' : align === 'start' ? 'top-4' : 'top-1/2 -translate-y-1/2';
  }

  return `${base[position]} ${alignClass}`;
}

const arrowBorderDir: Record<string, string> = {
  top: 'border-t-[#1a1a2e]',
  bottom: 'border-b-[#1a1a2e]',
  left: 'border-l-[#1a1a2e]',
  right: 'border-r-[#1a1a2e]',
};

function getTooltipPosition(position: string, align: string): string {
  const horizontal = position === 'top' || position === 'bottom';

  const verticalPlacement = position === 'bottom' ? 'top-full mt-2' : position === 'top' ? 'bottom-full mb-2' : '';
  const horizontalPlacement = position === 'right' ? 'left-full ml-2' : position === 'left' ? 'right-full mr-2' : '';

  let alignClass: string;
  if (horizontal) {
    alignClass = align === 'end' ? 'right-0' : align === 'start' ? 'left-0' : 'left-1/2 -translate-x-1/2';
  } else {
    alignClass = align === 'end' ? 'bottom-0' : align === 'start' ? 'top-0' : 'top-1/2 -translate-y-1/2';
  }

  return `${verticalPlacement} ${horizontalPlacement} ${alignClass}`.trim();
}

export function FeatureGuide({
  id,
  title,
  description,
  position = 'bottom',
  align = 'center',
  variant = 'dark',
  suppress = false,
}: FeatureGuideProps) {
  const { visible, dismiss } = useFeatureGuide(id);
  const show = visible && !suppress;

  /** Desktop : bulle ancrée ; mobile : carte fixe au-dessus du dock pour éviter les chevauchements */
  const [isLg, setIsLg] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const sync = () => setIsLg(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const bgClass = variant === 'dark'
    ? 'bg-[#1a1a2e] border-brand-500/30'
    : 'bg-white border-gray-200';
  const textClass = variant === 'dark' ? 'text-white' : 'text-gray-900';
  const subtextClass = variant === 'dark' ? 'text-white/70' : 'text-gray-600';

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{
            opacity: 0,
            y: position === 'top' ? 8 : position === 'bottom' ? -8 : 0,
            x: position === 'left' ? 8 : position === 'right' ? -8 : 0,
            scale: 0.9,
          }}
          animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          className={
            isLg
              ? `pointer-events-auto absolute z-[120] w-[220px] max-w-[min(220px,calc(100vw-1.5rem))] ${getTooltipPosition(position, align)}`
              : 'pointer-events-auto fixed left-1/2 top-auto z-[90] w-[min(320px,calc(100vw-1.5rem))] max-w-[calc(100vw-1.5rem)] -translate-x-1/2 bottom-[max(12rem,calc(38dvh+env(safe-area-inset-bottom)+3.25rem))]'
          }
        >
          <div className={`relative rounded-xl border px-3.5 py-2.5 shadow-xl backdrop-blur-sm ${bgClass}`}>
            {isLg ? (
              <div className={`absolute w-0 h-0 border-[6px] ${getArrowPosition(position, align)} ${arrowBorderDir[position]}`} />
            ) : null}

            <button
              type="button"
              onClick={dismiss}
              className={`absolute top-0.5 right-0.5 sm:top-1.5 sm:right-2 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center rounded-lg ${subtextClass} hover:text-white transition-colors touch-manipulation`}
              aria-label="Fermer"
            >
              <X className="w-6 h-6 sm:w-4 sm:h-4" strokeWidth={1.2} aria-hidden />
            </button>

            <p className={`text-[12px] font-bold ${textClass} pr-4`}>{title}</p>
            <p className={`text-[11px] mt-0.5 leading-snug ${subtextClass}`}>{description}</p>

            <button
              type="button"
              onClick={dismiss}
              className="mt-2 w-full touch-manipulation rounded-lg bg-brand-500 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-brand-600"
            >
              Compris
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
