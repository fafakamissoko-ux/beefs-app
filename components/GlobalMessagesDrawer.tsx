'use client';

import { Suspense, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useMessagesDrawer } from '@/contexts/MessagesDrawerContext';
import { MessagesUI } from '@/components/MessagesUI';

export function GlobalMessagesDrawer() {
  const { isDrawerOpen, closeDrawer } = useMessagesDrawer();

  useEffect(() => {
    if (isDrawerOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isDrawerOpen]);

  return (
    <AnimatePresence>
      {isDrawerOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeDrawer}
            className="fixed inset-0 z-[999998] bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 bottom-0 z-[999999] w-full md:w-[450px] lg:w-[600px] bg-[#050505] border-l border-white/10 flex flex-col shadow-2xl overflow-hidden"
          >
            <div className="md:hidden absolute top-3 right-4 z-[50]">
              <button onClick={closeDrawer} className="w-10 h-10 flex items-center justify-center rounded-full bg-black/50 border border-white/10 text-white backdrop-blur-md">
                <X className="w-5 h-5" />
              </button>
            </div>
            <Suspense
              fallback={
                <div className="flex flex-1 min-h-[200px] items-center justify-center bg-[#050505]">
                  <div className="h-10 w-10 animate-spin rounded-full border-4 border-plasma-500 border-t-transparent" />
                </div>
              }
            >
              <MessagesUI isDrawerMode={true} />
            </Suspense>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
