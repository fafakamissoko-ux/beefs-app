'use client';

import { Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMessagesDrawer } from '@/contexts/MessagesDrawerContext';
import { MessagesUI } from '@/components/MessagesUI';

export function GlobalMessagesDrawer() {
  const { isDrawerOpen, closeDrawer, clearTarget } = useMessagesDrawer();

  const handleClose = () => {
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    closeDrawer();
  };

  return (
    <Suspense
      fallback={
        <div className="flex min-h-[200px] flex-1 items-center justify-center bg-transparent">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-cyan-500 border-t-transparent" />
        </div>
      }
    >
      <AnimatePresence>
        {isDrawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, pointerEvents: 'auto' }}
              exit={{ opacity: 0, pointerEvents: 'none', transition: { duration: 0.15 } }}
              onClick={handleClose}
              className="fixed inset-0 z-[999998] bg-black/20 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              onAnimationComplete={(def) => {
                if (typeof def === 'object' && def !== null && 'x' in def && def.x === '100%') {
                  clearTarget();
                }
              }}
              className="fixed right-0 top-0 bottom-0 z-[999999] flex w-full flex-col overflow-hidden bg-slate-950/75 backdrop-blur-md border-l border-white/10 shadow-2xl md:w-[450px] lg:w-[600px]"
            >
              <MessagesUI isDrawerMode={true} onClose={handleClose} />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </Suspense>
  );
}
