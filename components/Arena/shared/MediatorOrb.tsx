'use client';

import type React from 'react';
import { motion } from 'framer-motion';
import { Pause, Sliders, Timer } from 'lucide-react';
import { ParticipantVideo } from '@/components/ParticipantVideo';
import type { CallParticipant } from '@/hooks/useDailyCall';
import type { ArenaSupportSlotId } from '@/lib/arena-slots';

export interface MediatorOrbProps {
  mediatorParticipant: CallParticipant | null;
  mediatorIsLocal: boolean;
  mediatorName: string;
  auraMed: number;
  isWaitingForMediator: boolean;
  isCameraInterrupted: boolean;
  isViewer: boolean;
  isHost: boolean;
  mediatorGraceActive: boolean;
  mediatorGraceSeconds: number;
  isJoined: boolean;
  timerActive: boolean;
  timerPaused: boolean;
  beefTimeRemaining: number;
  formatBeefTime: (seconds: number) => string;
  mediatorHostId: string;
  getMediatorDynamicColor: (val: number) => string;
  onTapSupport: (slot: ArenaSupportSlotId) => void;
  onPreferSide: (side: ArenaSupportSlotId) => void;
  onOpenProfile: (username: string, knownUserId?: string | null) => void | Promise<void>;
  onRecoverMediaDevices: () => void | Promise<void>;
  onToggleMediatorSidebar: () => void;
  isConstellation?: boolean;
  constellationHaloVw?: number;
}

export function MediatorOrb({
  mediatorParticipant,
  mediatorIsLocal,
  mediatorName,
  auraMed,
  isWaitingForMediator,
  isCameraInterrupted,
  isViewer,
  isHost,
  mediatorGraceActive,
  mediatorGraceSeconds,
  isJoined,
  timerActive,
  timerPaused,
  beefTimeRemaining,
  formatBeefTime,
  mediatorHostId,
  getMediatorDynamicColor,
  onTapSupport,
  onPreferSide,
  onOpenProfile,
  onRecoverMediaDevices,
  onToggleMediatorSidebar,
  isConstellation = false,
  constellationHaloVw,
}: MediatorOrbProps) {
  const MIN_PX = 64;
  const MAX_REM = 22;
  const orbSizeStyle: React.CSSProperties =
    isConstellation && constellationHaloVw
      ? {
          width: `clamp(${MIN_PX}px, ${constellationHaloVw}vmin, ${MAX_REM}rem)`,
          height: `clamp(${MIN_PX}px, ${constellationHaloVw}vmin, ${MAX_REM}rem)`,
        }
      : { width: `clamp(110px, 30vmin, ${MAX_REM}rem)`, height: `clamp(110px, 30vmin, ${MAX_REM}rem)` };

  return (
    <div
      data-cinema-stay
      className={`pointer-events-none absolute left-1/2 z-[100] flex -translate-x-1/2 -translate-y-1/2 justify-center ${
        isConstellation ? 'top-[50%]' : 'top-1/2'
      }`}
    >
      <motion.div
        animate={{
          boxShadow:
            auraMed > 0
              ? `0 0 50px ${getMediatorDynamicColor(auraMed)}, inset 0 0 20px rgba(212,175,55,0.3)`
              : 'inset 0 0 20px rgba(255,255,255,0.05), 0 0 0 1px rgba(255,255,255,0.1)',
        }}
        style={{
          filter: `brightness(${1 + (auraMed / 300) * 0.6}) saturate(${1 + (auraMed / 300) * 0.4})`,
          ...orbSizeStyle,
        }}
        className={`pointer-events-auto relative overflow-hidden rounded-full ${
          !isConstellation ? 'sm:h-[220px] sm:w-[220px]' : ''
        }`}
      >
        {mediatorIsLocal && isCameraInterrupted && !isViewer && (
          <div className="absolute inset-0 z-[150] flex items-center justify-center bg-slate-950/55 p-2 backdrop-blur-md">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void onRecoverMediaDevices();
              }}
              className="rounded-full bg-white px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-black shadow-[0_0_15px_rgba(255,255,255,0.25)] hover:bg-gray-200"
            >
              📡 RÉACTIVER
            </button>
          </div>
        )}

        <button
          type="button"
          onPointerDown={(e) => {
            e.stopPropagation();
            if (isWaitingForMediator) return;
            onTapSupport('M');
            onPreferSide('M');
          }}
          onDoubleClick={(e) => e.stopPropagation()}
          className="flex h-full w-full touch-manipulation overflow-hidden rounded-full border-none bg-transparent outline-none active:scale-95"
        >
          {isWaitingForMediator ? (
            <div className="m-auto flex h-full w-full flex-col items-center justify-center bg-slate-950/55 p-4">
              <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-cyan-400 border-t-transparent sm:h-10 sm:w-10" />
            </div>
          ) : mediatorParticipant?.videoTrack ? (
            <ParticipantVideo
              videoTrack={mediatorParticipant.videoTrack}
              muted={mediatorIsLocal}
              className="h-full w-full object-cover"
            />
          ) : mediatorGraceActive ? (
            <div className="m-auto flex h-full w-full flex-col items-center justify-center bg-slate-900/65 p-4">
              <span className="text-[12px] font-black text-rose-500 sm:text-[14px]">
                {mediatorGraceSeconds}s
              </span>
            </div>
          ) : (
            <span className="m-auto text-4xl opacity-30 sm:text-5xl">⚖️</span>
          )}
        </button>

        <div className="pointer-events-auto absolute bottom-2 left-1/2 z-[160] flex w-max max-w-[90%] -translate-x-1/2 flex-col items-center gap-1">
          <div className="flex items-center rounded-full border border-white/[0.08] bg-slate-900/40 p-1 shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_1px_rgba(255,255,255,0.1)] backdrop-blur-[40px] transition-all duration-300 hover:bg-black/60 sm:px-2 sm:py-1">
            <button
              type="button"
              onClick={() => void onOpenProfile(mediatorName, mediatorHostId)}
              className="truncate max-w-[80px] sm:max-w-[130px] px-3 py-0.5 text-[11px] font-black text-prestige-gold transition-colors hover:text-white drop-shadow-md sm:text-[12px]"
            >
              @{mediatorName}
            </button>
            {isHost && (
              <button
                type="button"
                data-mediator-sidebar-toggle
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleMediatorSidebar();
                }}
                className="ml-1 flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-white/5 text-prestige-gold shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] transition-colors hover:bg-white/15 hover:text-white active:scale-95"
                title="Command Deck"
              >
                <Sliders className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </button>
            )}
          </div>

          {isJoined && timerActive && (
            <div className="flex items-center gap-1.5 rounded-full border border-rose-500/20 bg-rose-600/10 px-3 py-1 text-[10px] font-black text-rose-500 backdrop-blur-md tabular-nums shadow-[0_4px_16px_rgba(0,0,0,0.3)]">
              {timerPaused ? <Pause className="h-3 w-3 text-amber-200" /> : <Timer className="h-3 w-3" />}
              {formatBeefTime(beefTimeRemaining)}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
