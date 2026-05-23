'use client';

import type { ChallengerSlotId } from '@/lib/arena-slots';
import type { ArenaTileVM } from '../types';
import { ArenaVideoSurface, type ArenaVideoSurfaceProps } from '../shared/ArenaVideoSurface';
import { MediatorOrb, type MediatorOrbProps } from '../shared/MediatorOrb';
import { getOrbitPositionPercent } from './orbitGeometry';

const getDynamicSizeClass = (count: number) => {
  if (count <= 1) return 'h-[clamp(160px,46vw,22rem)] w-[clamp(160px,46vw,22rem)]';
  if (count === 2) return 'h-[clamp(120px,40vw,19rem)] w-[clamp(120px,40vw,19rem)]';
  if (count === 3) return 'h-[clamp(96px,26vw,12rem)] w-[clamp(96px,26vw,12rem)]';
  return 'h-[clamp(92px,24vw,11rem)] w-[clamp(92px,24vw,11rem)]';
};

export type ConstellationOrbitProps = Omit<
  ArenaVideoSurfaceProps,
  'tile' | 'tileCount' | 'tileIndex' | 'variant' | 'isSpeaking' | 'isMutedByFocus'
> & {
  tiles: ArenaTileVM[];
  speakingTurnActive: boolean;
  effectiveHotMicSpeakerSlot: ChallengerSlotId | null;
  mediator: MediatorOrbProps;
};

export function ConstellationOrbit({
  tiles,
  speakingTurnActive,
  effectiveHotMicSpeakerSlot,
  mediator,
  ...surfaceProps
}: ConstellationOrbitProps) {
  const tileCount = tiles.length;

  return (
    <div className="relative h-full w-full overflow-visible">
      <MediatorOrb {...mediator} isConstellation />

      {tiles.map((tile, idx) => {
        const pos = getOrbitPositionPercent(idx, tileCount);
        const isSpeaking =
          speakingTurnActive && effectiveHotMicSpeakerSlot === tile.slot;
        const isMutedByFocus =
          speakingTurnActive &&
          Boolean(effectiveHotMicSpeakerSlot) &&
          effectiveHotMicSpeakerSlot !== tile.slot;

        return (
          <div
            key={tile.id}
            className={`absolute z-[80] ${getDynamicSizeClass(tileCount)} -translate-x-1/2 -translate-y-1/2 overflow-visible`}
            style={{ left: pos.left, top: pos.top }}
          >
            <ArenaVideoSurface
              tile={tile}
              tileCount={tileCount}
              tileIndex={idx}
              variant="constellation"
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
