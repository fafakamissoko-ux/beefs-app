'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronUp, MessageCircle, Sparkles, X } from 'lucide-react';
import { useFeatureGuide } from '@/hooks/useFeatureGuide';

const TUTORIAL_ID = 'feed_swipe_tutorial';

export function FeedTutorial() {
  const { visible, dismiss } = useFeatureGuide(TUTORIAL_ID);
  const [isMobile, setIsMobile] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const sync = () => setIsMobile(!mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const show = visible && isMobile;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ type: 'spring', stiffness: 380, damping: 28 }}
          className="pointer-events-auto fixed inset-x-4 bottom-[calc(7rem+env(safe-area-inset-bottom))] z-[200] mx-auto max-w-sm"
          role="dialog"
          aria-labelledby="feed-tutorial-title"
        >
          <div className="relative rounded-2xl border border-white/10 bg-slate-950/75 p-5 shadow-2xl backdrop-blur-md">
            <button
              type="button"
              onClick={dismiss}
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-white/40 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Fermer le tutoriel"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>

            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-slate-900/40 backdrop-blur-sm">
                <ChevronUp className="h-5 w-5 animate-bounce text-brand-400" aria-hidden />
              </div>
              <p id="feed-tutorial-title" className="font-sans text-sm font-black uppercase tracking-wide text-white">
                Swipe l&apos;Agora
              </p>
            </div>

            <p className="mb-4 text-xs leading-relaxed text-white/70">
              Glisse verticalement pour explorer les affaires. Touche une carte pour ouvrir le teaser, envoie de l&apos;Aura{' '}
              <Sparkles className="mb-0.5 inline h-3.5 w-3.5 text-amber-400" aria-hidden /> ou ouvre les commentaires{' '}
              <MessageCircle className="mb-0.5 inline h-3.5 w-3.5 text-white/80" aria-hidden /> depuis la barre d&apos;actions.
            </p>

            <button
              type="button"
              onClick={dismiss}
              className="w-full rounded-xl border border-white/20 bg-white/10 py-2.5 text-xs font-bold uppercase tracking-widest text-white transition-colors hover:bg-white/20"
            >
              Compris
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
