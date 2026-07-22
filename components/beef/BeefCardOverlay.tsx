'use client';

import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles, Eye, MessageCircle } from 'lucide-react';
import { InlineAuraGivers } from '@/components/InlineAuraGivers';

type FloatingAuraChip = { id: number; x: number };

interface BeefCardOverlayProps {
  id: string;
  title: string;
  intent?: string | null;
  challengerAName?: string | null;
  challengerBName?: string | null;
  challengerCName?: string | null;
  challengerDName?: string | null;
  mediatorName?: string | null;
  mediatorId?: string | null;
  createdBy?: string | null;
  viewerCount: number;
  commentCount: number;
  engagementScore: number;
  hasLikedByUser: boolean;
  onAuraClick?: () => void;
  onCommentClick?: () => void;
  onViewsModalOpen: () => void;
  onBeefAuraModalOpen: () => void;
}

export function BeefCardOverlay({
  id,
  title,
  intent,
  challengerAName,
  challengerBName,
  challengerCName,
  challengerDName,
  mediatorName,
  mediatorId,
  createdBy,
  viewerCount,
  commentCount,
  engagementScore,
  hasLikedByUser,
  onAuraClick,
  onCommentClick,
  onViewsModalOpen,
  onBeefAuraModalOpen,
}: BeefCardOverlayProps) {
  const [floatingAuras, setFloatingAuras] = useState<Array<FloatingAuraChip>>([]);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col justify-end p-2.5 pb-[110px] sm:p-4 sm:pb-[120px] md:pb-4 pt-20">
      <h3 className="mb-1 sm:mb-2 line-clamp-2 font-sans text-[13px] sm:text-[15px] leading-tight font-bold text-white md:text-[17px] drop-shadow-md">
        {title}
      </h3>
      <div className="mb-3 flex flex-wrap items-center gap-x-2 font-sans text-[10px] font-black uppercase tracking-widest text-white/90 sm:text-xs drop-shadow-md">
        <span className="italic">{challengerAName || (intent === 'manifesto' ? 'À Saisir' : 'Challenger 1')}</span>
        <span className="text-brand-400">VS</span>
        <span className="italic">{challengerBName || 'Challenger 2'}</span>
        {challengerCName && (
          <>
            <span className="text-brand-400">VS</span>
            <span className="italic">{challengerCName}</span>
          </>
        )}
        {challengerDName && (
          <>
            <span className="text-brand-400">VS</span>
            <span className="italic">{challengerDName}</span>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pointer-events-auto">
        {mediatorName ? (
          <span className="w-fit rounded-full border border-white/20 bg-black/40 px-1.5 py-0.5 text-[8px] font-bold tracking-wide text-gray-200 sm:px-2.5 sm:py-1 sm:text-[10px]">
            REF: <span className="text-white">@{mediatorName}</span>
          </span>
        ) : (
          <span className="w-fit rounded-full border border-prestige-gold/40 bg-prestige-gold/20 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-prestige-gold sm:px-2.5 sm:py-1 sm:text-[10px]">
            En attente de Ref
          </span>
        )}

        <div className="flex items-center gap-1.5">
          <div
            className="flex h-6 sm:h-7 cursor-pointer items-center gap-1.5 rounded-full bg-slate-900/40 backdrop-blur-sm border border-white/10 shadow-lg px-2.5 font-mono text-[10px] font-bold text-white transition-all hover:bg-white/10 active:scale-95"
            onClick={(e) => {
              e.stopPropagation();
              onViewsModalOpen();
            }}
          >
            <Eye className="h-3.5 w-3.5" aria-hidden strokeWidth={2.25} />
            <span>{viewerCount.toLocaleString()}</span>
          </div>
          <div
            className="flex h-6 sm:h-7 cursor-pointer items-center gap-1.5 rounded-full bg-slate-900/40 backdrop-blur-sm border border-white/10 shadow-lg px-2.5 font-mono text-[10px] font-bold text-white transition-all hover:bg-white/10 active:scale-95"
            onClick={(e) => {
              e.stopPropagation();
              onCommentClick?.();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                onCommentClick?.();
              }
            }}
            role="button"
            tabIndex={0}
            aria-label="Voir les commentaires"
          >
            <MessageCircle className="h-3.5 w-3.5" aria-hidden strokeWidth={2.25} />
            <span>{commentCount.toLocaleString()}</span>
          </div>
          {onAuraClick ? (
            <div
              className={`relative flex h-6 sm:h-7 items-center overflow-hidden rounded-full bg-slate-900/40 backdrop-blur-sm border shadow-lg font-mono text-[9px] sm:text-[10px] font-bold ${
                hasLikedByUser ? 'border-amber-400/50 text-amber-400' : 'border-white/10 text-white'
              }`}
            >
              <AnimatePresence>
                {floatingAuras.map((aura) => (
                  <motion.span
                    key={aura.id}
                    initial={{ opacity: 1, y: 0, x: aura.x, scale: 0.5 }}
                    animate={{ opacity: 0, y: -28, scale: 1.1 }}
                    exit={{ opacity: 0 }}
                    className="pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-black text-amber-400"
                  >
                    +1
                  </motion.span>
                ))}
              </AnimatePresence>
              <button
                type="button"
                className={`flex h-full items-center justify-center pl-2.5 pr-1.5 transition-all hover:bg-white/10 active:bg-white/20 ${
                  !hasLikedByUser ? 'hover:text-amber-400' : ''
                }`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!hasLikedByUser) {
                    const newId = Date.now() + Math.random();
                    setFloatingAuras((p) => [...p, { id: newId, x: Math.random() * 30 - 15 }]);
                    setTimeout(() => {
                      setFloatingAuras((p) => p.filter((a) => a.id !== newId));
                    }, 800);
                  }
                  onAuraClick?.();
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('aura-refresh', { detail: { targetId: id } }));
                  }
                }}
                aria-label={hasLikedByUser ? "Retirer l'Aura" : "Envoyer de l'Aura"}
              >
                <Sparkles
                  className={
                    'h-3.5 w-3.5 ' +
                    (hasLikedByUser
                      ? 'fill-amber-400 text-amber-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.7)]'
                      : '')
                  }
                  aria-hidden
                />
              </button>
              <button
                type="button"
                className="flex h-full items-center justify-center gap-1.5 pl-1.5 pr-2.5 transition-all hover:bg-white/10 active:bg-white/20"
                onClick={(e) => {
                  e.stopPropagation();
                  onBeefAuraModalOpen();
                }}
                aria-label="Voir les donateurs d'Aura"
              >
                <InlineAuraGivers
                  targetId={id}
                  type="beef"
                  ownerId={mediatorId || createdBy || ''}
                />
                <span>{engagementScore.toLocaleString()}</span>
              </button>
            </div>
          ) : (
            <div className="relative flex h-6 sm:h-7 items-center overflow-hidden rounded-full bg-slate-900/40 backdrop-blur-sm border border-white/10 shadow-lg font-mono text-[9px] sm:text-[10px] font-bold text-white">
              <div className="flex h-full items-center justify-center pl-2.5 pr-1.5">
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
              </div>
              <button
                type="button"
                className="flex h-full items-center justify-center gap-1.5 pl-1.5 pr-2.5 transition-all hover:bg-white/10 active:bg-white/20"
                onClick={(e) => {
                  e.stopPropagation();
                  onBeefAuraModalOpen();
                }}
                aria-label="Voir les donateurs d'Aura"
              >
                <InlineAuraGivers
                  targetId={id}
                  type="beef"
                  ownerId={mediatorId || createdBy || ''}
                />
                <span>{engagementScore.toLocaleString()}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
