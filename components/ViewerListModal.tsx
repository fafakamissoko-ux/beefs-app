'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

export interface ViewerListModalProps {
  viewers: Array<{ userName: string }>;
  viewerCount: number;
  onClose: () => void;
}

function avatarInitials(userName: string): string {
  const trimmed = userName.trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0][0] ?? '';
    const b = parts[1][0] ?? '';
    return (a + b).toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
}

export function ViewerListModal({ viewers, viewerCount, onClose }: ViewerListModalProps) {
  const [open, setOpen] = useState(true);

  const requestClose = () => setOpen(false);

  return (
    <AnimatePresence onExitComplete={onClose}>
      {open && (
        <motion.div
          key="viewer-list-backdrop"
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/95 backdrop-blur-md"
          onClick={requestClose}
        >
          <motion.div
            key="viewer-list-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="viewer-list-title"
            initial={{ scale: 0.92, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            onClick={(e) => e.stopPropagation()}
            className="flex flex-col w-full max-w-md max-h-[min(70vh,520px)] rounded-2xl border border-white/10 bg-black/95 backdrop-blur-xl shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/10 shrink-0">
              <h2
                id="viewer-list-title"
                className="text-lg font-black text-white tracking-tight"
              >
                Spectateurs ({viewerCount})
              </h2>
              <button
                type="button"
                onClick={requestClose}
                className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                aria-label="Fermer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-3">
              {viewers.length === 0 ? (
                <p className="text-center text-gray-500 text-sm py-8 px-2">
                  Aucun spectateur pour le moment.
                </p>
              ) : (
                <ul className="space-y-1">
                  {viewers.map((v, i) => (
                    <motion.li
                      key={`${v.userName}-${i}`}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: Math.min(i * 0.03, 0.3) }}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-white/5 transition-colors"
                    >
                      <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500/40 to-brand-600/30 border border-brand-500/30 text-sm font-bold text-white"
                        aria-hidden
                      >
                        {avatarInitials(v.userName)}
                      </div>
                      <span className="text-sm font-semibold text-white truncate">
                        {v.userName || 'Anonyme'}
                      </span>
                    </motion.li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
