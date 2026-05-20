'use client';

import type { ChallengerSlotId } from '@/lib/arena-slots';
import type { ArenaTileVM } from '../types';
import { ArenaVideoSurface, type ArenaVideoSurfaceProps } from '../shared/ArenaVideoSurface';
import { getNexusGridClass } from './nexusGridTemplates';

export type NexusGridProps = Omit<
  ArenaVideoSurfaceProps,
  'tile' | 'tileCount' | 'tileIndex' | 'variant' | 'isSpeaking' | 'isMutedByFocus'
> & {
  tiles: ArenaTileVM[];
  speakingTurnActive: boolean;
  effectiveHotMicSpeakerSlot: ChallengerSlotId | null;
};

export function NexusGrid({
  tiles,
  speakingTurnActive,
  effectiveHotMicSpeakerSlot,
  ...surfaceProps
}: NexusGridProps) {
  const tileCount = tiles.length;
  const gridClass = getNexusGridClass(tileCount);

  return (
    <div className={`relative h-full w-full grid gap-1 sm:gap-2 ${gridClass}`}>
      {tiles.map((tile, idx) => {
        const isSpeaking =
          speakingTurnActive && effectiveHotMicSpeakerSlot === tile.slot;
        const isMutedByFocus =
          speakingTurnActive &&
          Boolean(effectiveHotMicSpeakerSlot) &&
          effectiveHotMicSpeakerSlot !== tile.slot;

        return (
          <ArenaVideoSurface
            key={tile.id}
            tile={tile}
            tileCount={tileCount}
            tileIndex={idx}
            variant="nexus"
            isSpeaking={isSpeaking}
            isMutedByFocus={isMutedByFocus}
            speakingTurnActive={speakingTurnActive}
            effectiveHotMicSpeakerSlot={effectiveHotMicSpeakerSlot}
            {...surfaceProps}
          />
        );
      })}
    </div>
  );
}
