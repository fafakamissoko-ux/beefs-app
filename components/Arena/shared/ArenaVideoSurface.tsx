'use client';

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
  isViewer: boolean;
  isLocal: boolean;
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
}

export function ArenaVideoSurface({
  tile,
  tileCount,
  tileIndex,
  variant,
  isLocal,
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
}: ArenaVideoSurfaceProps) {
  const auraShadow =
    tile.aura > 0
      ? `0 0 ${20 + Math.min(tile.aura, 120) * 0.8}px rgba(${tile.colorRgb}, 0.4), inset 0 0 40px rgba(${tile.colorRgb}, 0.15)`
      : 'inset 0 0 20px rgba(255,255,255,0.02)';
  const filterVal = isMutedByFocus
    ? 'grayscale(0.6) blur(3px)'
    : `brightness(${1 + (tile.aura / 300) * 0.4})`;

  const roundedClass =
    variant === 'constellation'
      ? 'rounded-full'
      : 'rounded-[2rem]';

  const chromePointer =
    tileCount === 3 && tileIndex === 2 && variant === 'nexus' ? '' : 'pointer-events-auto';

  return (
    <motion.div
      className={`relative h-full w-full overflow-hidden bg-transparent backdrop-blur-2xl transition-all duration-300 ${roundedClass} ${tile.cellClass}`}
      style={{
        boxShadow: auraShadow,
        zIndex: tile.aura > 0 ? 10 : 1,
        opacity: isMutedByFocus ? 0.4 : 1,
        filter: filterVal,
      }}
    >
      {tile.panel?.videoTrack ? (
        <ParticipantVideo
          videoTrack={tile.panel.videoTrack}
          muted={isLocal}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-4xl opacity-20">
          👤
        </div>
      )}

      {!isLocal && (
        <motion.button
          type="button"
          data-cinema-stay
          whileTap={{ scale: 0.96 }}
          onPointerDown={(e) => {
            e.stopPropagation();
            onTapSupport(tile.slot);
            onPreferSide(tile.slot);
          }}
          className="absolute inset-0 z-[28] h-full w-full touch-manipulation outline-none"
        />
      )}

      <div
        data-cinema-stay
        className={`absolute z-[140] flex gap-1.5 ${tile.uiPosClass} ${chromePointer}`}
      >
        <div
          className={`flex items-start gap-1.5 ${tileCount === 3 && tileIndex === 2 && variant === 'nexus' ? 'pointer-events-auto' : ''}`}
        >
          <div className="flex max-w-[9rem] items-center gap-2 rounded-full border border-white/[0.08] bg-slate-900/40 px-4 py-2 shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_1px_rgba(255,255,255,0.1)] backdrop-blur-[40px] sm:max-w-[14rem]">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void onOpenProfile(tile.name, tile.panel?.arenaUserId ?? null);
              }}
              className="truncate text-[10px] font-black tracking-wide text-white hover:text-cyan-400 drop-shadow-md sm:text-[11px]"
            >
              @{tile.name}
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

        {isLocal && (
          <div
            className={`flex shrink-0 items-center gap-1.5 ${tileCount === 3 && tileIndex === 2 && variant === 'nexus' ? 'pointer-events-auto' : ''}`}
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
                  onToast('Micro verrouillé par le médiateur ou les règles du débat.', 'error');
                  return;
                }
                onToggleMic();
              }}
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border backdrop-blur-[60px] transition-all duration-300 active:scale-95 ${micEnabled && !micMutedByMediator ? 'border-white/20 bg-white/10 text-white hover:bg-white/20 shadow-[0_4px_16px_rgba(255,255,255,0.1),inset_0_1px_1px_rgba(255,255,255,0.4)]' : 'border-rose-500/50 bg-rose-950/40 text-rose-400 shadow-[0_0_15px_rgba(225,29,72,0.4),inset_0_1px_1px_rgba(255,255,255,0.1)]'}`}
            >
              <Mic className="h-4 w-4" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleCam();
              }}
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border backdrop-blur-[60px] transition-all duration-300 active:scale-95 ${camEnabled ? 'border-white/20 bg-white/10 text-white hover:bg-white/20 shadow-[0_4px_16px_rgba(255,255,255,0.1),inset_0_1px_1px_rgba(255,255,255,0.4)]' : 'border-rose-500/50 bg-rose-950/40 text-rose-400 shadow-[0_0_15px_rgba(225,29,72,0.4),inset_0_1px_1px_rgba(255,255,255,0.1)]'}`}
            >
              <Video className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
