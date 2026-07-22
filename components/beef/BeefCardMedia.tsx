'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { AnimatePresence, motion } from 'framer-motion';
import { Play, Calendar, Sparkles, Volume2, VolumeX, Bell, MoreVertical, Trash2, Edit2, Flag } from 'lucide-react';
import { Countdown } from '@/components/Countdown';
import { useToast } from '@/components/Toast';

type BeefStatus = 'live' | 'ended' | 'replay' | 'scheduled' | 'cancelled' | 'pending' | 'ready' | 'completed';

interface BeefCardMediaProps {
  thumbnail?: string;
  videoUrl?: string | null;
  isActiveVideo: boolean;
  isMuted: boolean;
  title: string;
  status: BeefStatus;
  scheduledAt?: string;
  auraTier: number;
  onNotifyClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onForfeit?: () => void;
  onToggleMute: (e: React.MouseEvent) => void;
  videoRef: React.Ref<HTMLVideoElement>;
  mediaBlockRef: React.Ref<HTMLDivElement>;
}

function StatusBadge({ status }: { status: BeefStatus }) {
  switch (status) {
    case 'pending':
      return (
        <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-[10px] font-bold tracking-wider text-white/90 md:text-xs">
          EN ATTENTE
        </div>
      );
    case 'ended':
    case 'completed':
      return (
        <div className="flex items-center gap-1.5 rounded-full border border-gray-500/30 bg-gray-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-300 md:text-xs">
          TERMINÉ
        </div>
      );
    case 'replay':
      return (
        <div className="flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-cyan-300 md:text-xs">
          <Play className="h-3 w-3 shrink-0" /> REPLAY
        </div>
      );
    case 'scheduled':
    case 'ready':
      return (
        <div className="flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-cyan-300 md:text-xs">
          <Calendar className="h-3 w-3 shrink-0" /> À VENIR
        </div>
      );
    case 'cancelled':
      return (
        <div className="flex items-center gap-1.5 rounded-full border border-gray-500/30 bg-gray-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-300 md:text-xs">
          ANNULÉ
        </div>
      );
    default:
      return null;
  }
}

export function BeefCardMedia({
  thumbnail,
  videoUrl,
  isActiveVideo,
  isMuted,
  title,
  status,
  scheduledAt,
  auraTier,
  onNotifyClick,
  onEdit,
  onDelete,
  onForfeit,
  onToggleMute,
  videoRef,
  mediaBlockRef,
}: BeefCardMediaProps) {
  const { toast } = useToast();
  const [isReminded, setIsReminded] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div
      ref={mediaBlockRef}
      className="absolute inset-0 z-0 h-full w-full overflow-hidden bg-black md:rounded-[1.5rem]"
    >
      {thumbnail && (
        <Image
          src={thumbnail}
          alt=""
          fill
          className="object-cover opacity-80 blur-[40px] scale-150 saturate-200 pointer-events-none"
          sizes="(max-width: 768px) 100vw, 384px"
        />
      )}

      {isActiveVideo && videoUrl ? (
        <video
          ref={videoRef}
          src={videoUrl}
          autoPlay
          loop
          muted={isMuted}
          playsInline
          className="absolute inset-0 z-10 h-full w-full object-contain drop-shadow-2xl transition-transform duration-500 group-hover:scale-105"
        />
      ) : thumbnail ? (
        <Image
          src={thumbnail}
          alt={title}
          fill
          className="z-10 object-contain drop-shadow-2xl transition-transform duration-500 group-hover:scale-105"
          sizes="(max-width: 768px) 100vw, 384px"
        />
      ) : (
        <div className="absolute inset-0 z-10 bg-gradient-to-b from-obsidian-900 to-black" />
      )}

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/80 to-transparent z-[5]" aria-hidden />

      <div className="absolute left-2 top-2 z-20 flex max-w-[60%] flex-col items-start gap-1">
        {status === 'live' && (
          <div className="flex w-fit items-center gap-1.5 rounded bg-blood-500 px-2 py-0.5 text-[10px] font-black uppercase tracking-tight text-white shadow-glow-blood animate-pulse md:text-xs">
            <div className="h-1.5 w-1.5 rounded-full bg-white" /> LIVE
          </div>
        )}
        {auraTier === 3 && (
          <div className="flex w-fit items-center gap-1 rounded border border-volt-500/40 bg-volt-500/20 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-tight text-volt-400">
            <Sparkles className="h-2 w-2" /> Trending
          </div>
        )}
        <StatusBadge status={status} />
      </div>

      <div className="absolute right-2 top-2 z-[60] flex flex-col items-end gap-1.5">
        {!!scheduledAt && (status === 'scheduled' || status === 'pending') && onNotifyClick && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsReminded((prev) => {
                onNotifyClick?.();
                toast(!prev ? 'Rappel activé' : 'Rappel annulé', 'success');
                return !prev;
              });
            }}
            className={`flex h-7 w-7 items-center justify-center rounded-full transition-all ${isReminded ? 'border-cyan-400 bg-cyan-500 text-white' : 'bg-slate-900/40 backdrop-blur-sm border border-white/10 shadow-lg text-white hover:bg-white/20'}`}
          >
            <Bell className={`h-3.5 w-3.5 ${isReminded ? 'fill-white' : ''}`} />
          </button>
        )}
        {(onEdit || onDelete || onForfeit) && (
          <div className="relative">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsMenuOpen((prev) => !prev);
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900/40 backdrop-blur-sm border border-white/10 shadow-lg text-white hover:bg-white/20"
              aria-expanded={isMenuOpen}
              aria-label={"Actions sur l'affaire"}
            >
              <MoreVertical className="h-4 w-4" aria-hidden />
            </button>
            <AnimatePresence>
              {isMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -10 }}
                  className="absolute right-0 z-[70] mt-2 w-40 overflow-hidden rounded-xl bg-slate-950/75 backdrop-blur-md border border-white/10 shadow-2xl py-1 md:w-48"
                >
                  {onEdit && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsMenuOpen(false);
                        onEdit();
                      }}
                      className="flex w-full items-center gap-3 px-3 py-2 text-[11px] font-medium text-gray-300 hover:bg-white/5 md:px-4 md:text-sm"
                    >
                      <Edit2 className="h-3 w-3 md:h-4 md:w-4" aria-hidden /> Modifier
                    </button>
                  )}
                  {onForfeit && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsMenuOpen(false);
                        onForfeit();
                      }}
                      className="flex w-full items-center gap-3 px-3 py-2 text-[11px] font-bold text-prestige-gold hover:bg-prestige-gold/10 md:px-4 md:text-sm"
                    >
                      <Flag className="h-3 w-3 md:h-4 md:w-4" aria-hidden /> Forfait
                    </button>
                  )}
                  {onDelete && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsMenuOpen(false);
                        onDelete();
                      }}
                      className="flex w-full items-center gap-3 px-3 py-2 text-[11px] font-bold text-blood-400 hover:bg-blood-500/10 md:px-4 md:text-sm"
                    >
                      <Trash2 className="h-3 w-3 md:h-4 md:w-4" aria-hidden /> Supprimer
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
        {videoUrl && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleMute(e);
            }}
            className="rounded-full bg-slate-900/40 backdrop-blur-sm border border-white/10 shadow-lg p-1.5 transition-colors hover:bg-white/20"
            aria-label={isMuted ? 'Activer le son' : 'Couper le son'}
          >
            {isMuted ? <VolumeX className="h-3 w-3 text-white" /> : <Volume2 className="h-3 w-3 text-white" />}
          </button>
        )}
      </div>

      <div className="pointer-events-none absolute bottom-2 left-2 z-10 flex flex-col items-start gap-1">
        {status === 'scheduled' && scheduledAt && (
          <div
            className="pointer-events-auto origin-bottom-left scale-90 rounded bg-slate-900/40 backdrop-blur-sm border border-white/10 shadow-lg px-2 py-1 [&_.text-blue-400]:text-cyan-400 [&_svg]:text-cyan-400"
            aria-live="polite"
          >
            <Countdown scheduledAt={scheduledAt} />
          </div>
        )}
      </div>
    </div>
  );
}
