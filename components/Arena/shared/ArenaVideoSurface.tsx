'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';
import { Mic, Video } from 'lucide-react';
import { ParticipantVideo } from '@/components/ParticipantVideo';
import type { ArenaSupportSlotId, ChallengerSlotId } from '@/lib/arena-slots';
import type { ArenaTileVM } from '../types';

export type ArenaVideoSurfaceVariant = 'nexus' | 'constellation';

export interface ArenaVideoSurfaceProps {
  tile: ArenaTileVM;
  tileCount: number;
  tileIndex: number;
  variant: ArenaVideoSurfaceVariant;
  isSpeaking: boolean;
  isMutedByFocus: boolean;
  speakingTurnActive: boolean;
  effectiveHotMicSpeakerSlot: ChallengerSlotId | null;
  structuredDebateEnabled: boolean;
  micMutedByMediator: boolean;
  mediatorHoldingFloor: boolean;
  micEnabled: boolean;
  camEnabled: boolean;
  onTapSupport: (slot: ArenaSupportSlotId) => void;
  onPreferSide: (side: ArenaSupportSlotId) => void;
  onOpenProfile: (username: string, knownUserId?: string | null) => void | Promise<void>;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onToast: (message: string, type: 'error' | 'success' | 'info') => void;
  onFlipCamera?: () => void;
  webrtcNetworkQuality?: 'good' | 'low' | 'very-low' | 'offline';
  isActiveSpeaker?: boolean;
}

export function ArenaVideoSurface({
  tile,
  tileCount,
  tileIndex,
  variant,
  isSpeaking,
  isMutedByFocus,
  speakingTurnActive,
  effectiveHotMicSpeakerSlot,
  structuredDebateEnabled,
  micMutedByMediator,
  mediatorHoldingFloor,
  micEnabled,
  camEnabled,
  onTapSupport,
  onPreferSide,
  onOpenProfile,
  onToggleMic,
  onToggleCam,
  onToast,
  webrtcNetworkQuality,
  isActiveSpeaker,
}: ArenaVideoSurfaceProps) {
  const auraShadow =
    tile.aura > 0
      ? `0 0 ${20 + Math.min(tile.aura, 120) * 0.8}px rgba(${tile.colorRgb}, 0.4), inset 0 0 40px rgba(${tile.colorRgb}, 0.15)`
      : 'inset 0 0 20px rgba(255,255,255,0.02)';
  const filterVal = isMutedByFocus
    ? 'grayscale(0.6) blur(3px)'
    : `brightness(${1 + (tile.aura / 300) * 0.4})`;

  const roundedClass =
    variant === 'constellation' ? 'rounded-full overflow-visible' : 'rounded-[2rem]';

  const chromePointer =
    variant === 'nexus' && tileCount === 3 && tileIndex === 2 ? '' : 'pointer-events-auto';

  const nexusChromeClass = `absolute z-[140] flex gap-1.5 ${tile.uiPosClass} ${
    variant === 'nexus' && tileCount === 3 && (tileIndex === 0 || tileIndex === 1)
      ? 'pointer-events-none'
      : chromePointer
  }`;

  const localControls = tile.isLocal ? (
    <div
      className={`flex flex-row flex-nowrap shrink-0 items-center justify-center gap-1 sm:gap-1.5 w-max ${tileCount === 3 && tileIndex === 2 && variant === 'nexus' ? 'pointer-events-auto' : ''}`}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          const isLockedByTurn =
            structuredDebateEnabled &&
            speakingTurnActive &&
            effectiveHotMicSpeakerSlot !== tile.slot;
          if (micMutedByMediator || mediatorHoldingFloor || isLockedByTurn) {
            onToast('Micro verrouillé par le Ref ou les règles du débat.', 'error');
            return;
          }
          onToggleMic();
        }}
        className={`flex h-8 w-8 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-full border backdrop-blur-[60px] transition-all duration-300 active:scale-95 ${micEnabled && !micMutedByMediator ? 'border-white/20 bg-white/10 text-white hover:bg-white/20 shadow-[0_4px_16px_rgba(255,255,255,0.1),inset_0_1px_1px_rgba(255,255,255,0.4)]' : 'border-rose-500/50 bg-rose-950/40 text-rose-400 shadow-[0_0_15px_rgba(225,29,72,0.4),inset_0_1px_1px_rgba(255,255,255,0.1)]'}`}
      >
        <Mic className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={1.75} />
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleCam();
        }}
        className={`flex h-8 w-8 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-full border backdrop-blur-[60px] transition-all duration-300 active:scale-95 ${camEnabled ? 'border-white/20 bg-white/10 text-white hover:bg-white/20 shadow-[0_4px_16px_rgba(255,255,255,0.1),inset_0_1px_1px_rgba(255,255,255,0.4)]' : 'border-rose-500/50 bg-rose-950/40 text-rose-400 shadow-[0_0_15px_rgba(225,29,72,0.4),inset_0_1px_1px_rgba(255,255,255,0.1)]'}`}
      >
        <Video className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={1.75} />
      </button>
    </div>
  ) : null;

  const pseudoBadge = (
    <div className="flex min-w-0 max-w-full flex-col items-center gap-1">
      <div className="flex min-w-0 max-w-full overflow-hidden items-center gap-2 rounded-full border border-white/[0.08] bg-slate-900/40 px-3 py-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_1px_rgba(255,255,255,0.1)] backdrop-blur-[40px] sm:px-4 sm:py-2">
        {tile.isLocal && webrtcNetworkQuality && webrtcNetworkQuality !== 'good' && (
          <div className="shrink-0 flex items-center justify-center" title="Réseau instable">
            <div
              className={`h-1.5 w-1.5 rounded-full animate-pulse ${webrtcNetworkQuality === 'low' ? 'bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]'}`}
            />
          </div>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void onOpenProfile(tile.name, tile.arenaUserId);
          }}
          className={`relative min-w-0 flex items-center overflow-hidden w-fit max-w-[80px] sm:max-w-[120px] text-left text-[10px] font-black tracking-wide text-white hover:text-cyan-400 drop-shadow-md sm:text-[11px]`}
        >
          {/* Si grille 5/6 joueurs ET nom long (> 8 chars), activer marquee. Sinon, truncate simple */}
          <span className={`${tileCount >= 5 && tile.name.length > 8 ? 'animate-marquee-pseudo' : 'truncate w-full'}`}>
            @{tile.name}
          </span>
        </button>
        {!tile.panel && (
          <span className="shrink-0 rounded border border-rose-500/20 bg-rose-500/20 px-1.5 py-0.5 text-[8px] font-black uppercase text-rose-400">
            Absent
          </span>
        )}
      </div>
      {isSpeaking && (
        <div className="w-fit animate-pulse rounded bg-rose-600 px-2 py-0.5 text-[9px] font-black text-white shadow-[0_0_10px_rgba(225,29,72,0.6)]">
          DIRECT
        </div>
      )}
    </div>
  );

  return (
    <motion.div
      className={`relative h-full w-full bg-transparent backdrop-blur-2xl transition-all duration-300 ${roundedClass} ${variant === 'nexus' ? tile.cellClass : ''} ${variant === 'nexus' ? 'overflow-hidden' : ''}`}
      style={{
        boxShadow: auraShadow,
        zIndex: tile.aura > 0 ? 10 : 1,
        opacity: isMutedByFocus ? 0.4 : 1,
      }}
    >
      <button
        type="button"
        data-cinema-stay
        onPointerDown={(e) => {
          if (!tile.isLocal) {
            e.stopPropagation();
            onTapSupport(tile.slot);
            onPreferSide(tile.slot);
          }
        }}
        className={`absolute inset-0 z-[28] h-full w-full touch-manipulation outline-none overflow-hidden rounded-[inherit] ${!tile.isLocal ? 'active:scale-95 transition-transform duration-150 cursor-pointer' : 'cursor-default'}`}
        style={{ filter: filterVal }}
      >
        {tile.hasActiveVideo && tile.panel?.videoTrack ? (
          <ParticipantVideo
            videoTrack={tile.panel.videoTrack}
            muted={tile.isLocal}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : tile.avatarUrl ? (
          <div className="absolute inset-0 h-full w-full">
            <Image
              src={tile.avatarUrl}
              alt=""
              fill
              className="object-cover opacity-60"
              sizes="(max-width: 640px) 38vw, 16rem"
            />
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80">
            <span className="text-3xl font-black uppercase text-white/40">
              {tile.name.replace(/^@/, '')[0] ?? '?'}
            </span>
          </div>
        )}
        {isActiveSpeaker && (
          <div className="absolute inset-0 z-20 pointer-events-none rounded-[inherit] border-2 border-brand-400 shadow-[0_0_20px_rgba(0,240,255,0.4)] animate-pulse" />
        )}
      </button>

      {variant === 'constellation' ? (
        <>
          {tile.isLocal && (
            <div
              data-cinema-stay
              className={`pointer-events-auto absolute left-1/2 z-[150] flex w-full max-w-[90px] sm:max-w-none -translate-x-1/2 flex-wrap justify-center items-center gap-1.5 sm:gap-2 ${
                (tileCount === 3 && tileIndex === 0) || ((tileCount === 5 || tileCount === 6) && tileIndex === 4)
                  ? 'bottom-[calc(100%+12px)] lg:bottom-[calc(100%+4px)]'
                  : 'top-[calc(100%+2.5rem)]'
              }`}
            >
              {localControls}
            </div>
          )}
          <div
            data-cinema-stay
            className="pointer-events-auto absolute top-[calc(100%+8px)] left-1/2 z-[140] flex w-max max-w-[200px] -translate-x-1/2 flex-col items-center"
          >
            {pseudoBadge}
          </div>
        </>
      ) : variant === 'nexus' && tileCount === 3 && (tileIndex === 0 || tileIndex === 1) ? (
        <div data-cinema-stay className={nexusChromeClass}>
          <div className="pointer-events-auto">{pseudoBadge}</div>
          <div className="pointer-events-auto shrink-0">{localControls}</div>
        </div>
      ) : (
        <div data-cinema-stay className={nexusChromeClass}>
          <div
            className={`flex items-start gap-1.5 ${tileCount === 3 && tileIndex === 2 ? 'pointer-events-auto' : ''}`}
          >
            {pseudoBadge}
          </div>
          {localControls}
        </div>
      )}
    </motion.div>
  );
}
