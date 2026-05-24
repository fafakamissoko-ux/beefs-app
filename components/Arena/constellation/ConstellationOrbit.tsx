'use client';

import type { ChallengerSlotId } from '@/lib/arena-slots';
import type { ArenaTileVM } from '../types';
import { ArenaVideoSurface, type ArenaVideoSurfaceProps } from '../shared/ArenaVideoSurface';
import { MediatorOrb, type MediatorOrbProps } from '../shared/MediatorOrb';
import { computeConstellationLayout, getOrbitPositionPercent } from './orbitGeometry';

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

  // Layout calculé une seule fois par render pour ce tileCount
  const layout = computeConstellationLayout(tileCount);

  // Taille physique de la bulle challenger dérivée du layout (style inline pour valeur dynamique)
  const MIN_PX = 64;
  const MAX_REM = tileCount <= 1 ? 22 : tileCount === 2 ? 19 : tileCount === 3 ? 12 : 11;
  const haloStyle: React.CSSProperties = {
    width: `clamp(${MIN_PX}px, ${layout.haloVw}vw, ${MAX_REM}rem)`,
    height: `clamp(${MIN_PX}px, ${layout.haloVw}vw, ${MAX_REM}rem)`,
  };

  return (
    <div className="relative h-full w-full overflow-visible">
      <MediatorOrb {...mediator} isConstellation />

      {tiles.map((tile, idx) => {
        const pos = getOrbitPositionPercent(idx, tileCount, layout.rx, layout.ry, layout.centerY);
        const isSpeaking =
          speakingTurnActive && effectiveHotMicSpeakerSlot === tile.slot;
        const isMutedByFocus =
          speakingTurnActive &&
          Boolean(effectiveHotMicSpeakerSlot) &&
          effectiveHotMicSpeakerSlot !== tile.slot;

        return (
          <div
            key={tile.id}
            className="absolute z-[80] -translate-x-1/2 -translate-y-1/2 overflow-visible"
            style={{ left: pos.left, top: pos.top, ...haloStyle }}
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
