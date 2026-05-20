'use client';

import type { ChallengerSlotId } from '@/lib/arena-slots';
import type { ArenaTileVM } from '../types';
import { ArenaVideoSurface, type ArenaVideoSurfaceProps } from '../shared/ArenaVideoSurface';
import { MediatorOrb, type MediatorOrbProps } from '../shared/MediatorOrb';
import { getOrbitPositionPercent } from './orbitGeometry';

export type ConstellationOrbitProps = Omit<
  ArenaVideoSurfaceProps,
  'tile' | 'tileCount' | 'tileIndex' | 'variant' | 'isLocal' | 'isSpeaking' | 'isMutedByFocus'
> & {
  tiles: ArenaTileVM[];
  localSessionId: string | null | undefined;
  speakingTurnActive: boolean;
  effectiveHotMicSpeakerSlot: ChallengerSlotId | null;
  mediator: MediatorOrbProps;
};

export function ConstellationOrbit({
  tiles,
  localSessionId,
  speakingTurnActive,
  effectiveHotMicSpeakerSlot,
  mediator,
  ...surfaceProps
}: ConstellationOrbitProps) {
  const tileCount = tiles.length;

  return (
    <div className="relative h-full w-full">
      <MediatorOrb {...mediator} />

      {tiles.map((tile, idx) => {
        const pos = getOrbitPositionPercent(idx, tileCount);
        const isSpeaking =
          speakingTurnActive && effectiveHotMicSpeakerSlot === tile.slot;
        const isLocal =
          tile.panel?.sessionId === localSessionId && !surfaceProps.isViewer;
        const isMutedByFocus =
          speakingTurnActive &&
          Boolean(effectiveHotMicSpeakerSlot) &&
          effectiveHotMicSpeakerSlot !== tile.slot;

        return (
          <div
            key={tile.id}
            className="absolute z-[80] h-[7.5rem] w-[7.5rem] -translate-x-1/2 -translate-y-1/2 sm:h-[9.5rem] sm:w-[9.5rem]"
            style={{ left: pos.left, top: pos.top }}
          >
            <ArenaVideoSurface
              tile={tile}
              tileCount={tileCount}
              tileIndex={idx}
              variant="constellation"
              isLocal={isLocal}
              isSpeaking={isSpeaking}
              isMutedByFocus={isMutedByFocus}
              speakingTurnActive={speakingTurnActive}
              effectiveHotMicSpeakerSlot={effectiveHotMicSpeakerSlot}
              {...surfaceProps}
            />
          </div>
        );
      })}
    </div>
  );
}
