'use client';

import { Suspense, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMessagesDrawer } from '@/contexts/MessagesDrawerContext';
import { MessagesUI } from '@/components/MessagesUI';

export function GlobalMessagesDrawer() {
  const { isDrawerOpen, closeDrawer } = useMessagesDrawer();

  // Suppression du verrouillage body.style.overflow pour éviter le Ghost Overlay dans l'Arène.
  // Le fixed inset-0 gère déjà la capture des clics.

  return (
    <AnimatePresence>
      {isDrawerOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeDrawer}
            className="fixed inset-0 z-[999998] bg-black/20 backdrop-blur-sm"
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 bottom-0 z-[999999] flex w-full flex-col overflow-hidden border-l border-white/10 bg-slate-950/50 shadow-2xl backdrop-blur-md md:w-[450px] lg:w-[600px]"
          >
            <Suspense
              fallback={
                <div className="flex min-h-[200px] flex-1 items-center justify-center bg-transparent">
                  <div className="h-10 w-10 animate-spin rounded-full border-4 border-plasma-500 border-t-transparent" />
                </div>
              }
            >
              <MessagesUI isDrawerMode={true} onClose={closeDrawer} />
            </Suspense>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
