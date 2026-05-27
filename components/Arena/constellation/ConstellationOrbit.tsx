'use client';

import { useState, useEffect } from 'react';
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

  // 1. Détection dynamique de l'écran
  const [vp, setVp] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const handleResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 2. Hydratation sécurisée
  if (vp.w === 0 || vp.h === 0) {
    return <div className="relative h-full w-full overflow-visible" />;
  }

  // 3. Calcul Dynamique
  const layout = computeConstellationLayout(tileCount, vp.w, vp.h);

  const MIN_PX = 64;
  const MAX_REM = 22;
  const haloStyle: React.CSSProperties = {
    width: `clamp(${MIN_PX}px, ${layout.haloVw}vmin, ${MAX_REM}rem)`,
    height: `clamp(${MIN_PX}px, ${layout.haloVw}vmin, ${MAX_REM}rem)`,
  };

  return (
    <div className="relative h-full w-full overflow-visible">
      <MediatorOrb {...mediator} isConstellation constellationHaloVw={layout.haloVw} />

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
