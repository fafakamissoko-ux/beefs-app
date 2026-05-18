'use client';

import React from 'react';
import { X } from 'lucide-react';

interface AuraGiversModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetId: string;
}

export const AuraGiversModal: React.FC<AuraGiversModalProps> = ({ isOpen, onClose, targetId }) => {
  void targetId;

  if (!isOpen) return null;

  const mockGivers = [
    { id: '1', name: 'Arès', username: 'ares_ring', avatar: null, rank: 'Tribun' },
    { id: '2', name: 'Valkyrie', username: 'valk_debates', avatar: null, rank: 'Légat' },
    { id: '3', name: 'Spectre', username: 'shadow_ref', avatar: null, rank: 'Arbitre' },
  ];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-950/80 shadow-2xl backdrop-blur-3xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="aura-givers-title"
      >
        <div className="flex items-center justify-between border-b border-white/5 p-5">
          <div className="flex items-center gap-2">
            <span className="animate-pulse text-xl text-prestige-gold" aria-hidden>
              ✦
            </span>
            <h3 id="aura-givers-title" className="text-base font-black uppercase tracking-wider text-white">
              Donateurs d&apos;Aura
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

        <div className="hide-scrollbar flex-1 space-y-4 overflow-y-auto p-5">
          {mockGivers.map((giver) => (
            <div
              key={giver.id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-white/5 bg-white/[0.02] p-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-white/10 bg-gradient-to-br from-cyan-500/20 to-slate-800 text-xs font-bold uppercase text-cyan-400">
                  {giver.name[0]}
                </div>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-bold text-white">{giver.name}</span>
                  <span className="truncate text-xs text-cyan-400">@{giver.username}</span>
                </div>
              </div>

              <button
                type="button"
                className="flex-shrink-0 rounded-full bg-white/10 px-4 py-1.5 text-xs font-bold text-white transition-all hover:bg-white hover:text-black active:scale-95"
              >
                Suivre
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
