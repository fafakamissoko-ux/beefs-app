'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Flame, ChevronRight } from 'lucide-react';
import { PRESTIGE_RANKS, type PrestigeRank } from '@/lib/prestige';

interface RankDescriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentRank: PrestigeRank;
  currentAura: number;
}

export const RankDescriptionModal: React.FC<RankDescriptionModalProps> = ({
  isOpen,
  onClose,
  currentRank,
  currentAura,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-950/80 shadow-2xl backdrop-blur-3xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="rank-modal-title"
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="flex items-center justify-between border-b border-white/5 p-5">
              <div className="flex items-center gap-2">
                <Flame className={`h-5 w-5 ${currentRank.colorClass}`} aria-hidden />
                <h3 id="rank-modal-title" className="text-base font-black uppercase tracking-wider text-white">
                  {currentRank.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full p-1.5 text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
                <p className="text-sm text-white/70 leading-relaxed">{currentRank.description}</p>
              </div>

              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-3">Tous les rangs</p>
                <div className="space-y-2">
                  {PRESTIGE_RANKS.map((r) => {
                    const isCurrent = r.tier === currentRank.tier;
                    const isReached = currentAura >= r.threshold;
                    const nextRank = PRESTIGE_RANKS.find((nr) => nr.tier === r.tier + 1);
                    const progress = nextRank
                      ? Math.min(1, Math.max(0, (currentAura - r.threshold) / (nextRank.threshold - r.threshold)))
                      : 1;

                    return (
                      <div
                        key={r.tier}
                        className={`rounded-2xl border p-3 transition-colors ${
                          isCurrent
                            ? 'border-white/15 bg-white/[0.04]'
                            : 'border-white/5 bg-white/[0.01]'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <Flame className={`h-3.5 w-3.5 ${r.colorClass}`} aria-hidden />
                            <span className={`text-xs font-bold uppercase tracking-wide ${r.colorClass}`}>
                              {r.title}
                            </span>
                            {isCurrent && (
                              <span className="text-[9px] font-bold uppercase tracking-wider text-white/40 bg-white/10 px-1.5 py-0.5 rounded-full">
                                Actuel
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-white/30 font-semibold">
                            {r.threshold === 0 ? '0' : r.threshold.toLocaleString('fr-FR')}+ Aura
                          </span>
                        </div>
                        <p className="text-[11px] text-white/40 leading-relaxed">{r.description}</p>
                        {isCurrent && nextRank && (
                          <div className="mt-2">
                            <div className="flex items-center justify-between text-[10px] text-white/30 mb-1">
                              <span>Progression</span>
                              <span className="flex items-center gap-1">
                                {nextRank.title} <ChevronRight className="h-2.5 w-2.5" />
                              </span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${isReached ? 'bg-gradient-to-r from-brand-500 to-cyan-400' : 'bg-white/10'}`}
                                style={{ width: `${Math.round(progress * 100)}%` }}
                              />
                            </div>
                            <p className="text-[10px] text-white/25 mt-1">
                              {currentAura.toLocaleString('fr-FR')} / {nextRank.threshold.toLocaleString('fr-FR')} Aura
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
