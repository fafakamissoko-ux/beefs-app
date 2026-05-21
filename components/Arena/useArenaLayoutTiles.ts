'use client';

import { useMemo } from 'react';
import { userIdsEqual } from '@/lib/user-id-equal';
import {
  ARENA_CHALLENGER_SLOT_COUNT,
  indexToChallengerSlot,
} from '@/lib/arena-slots';
import { ORPHAN_GUEST_LABEL } from '@/lib/participant-identity';
import {
  CHALLENGER_SLOT_COLORS,
  type ArenaTileVM,
  type UseArenaLayoutTilesParams,
} from './types';
import {
  getNexusCellClass,
  getNexusChromeUiPos,
} from './nexus/nexusGridTemplates';

function resolveTileName(
  idx: number,
  uid: string | undefined,
  panel: UseArenaLayoutTilesParams['challengerRemoteSlots'][number],
  reconciledPeers: UseArenaLayoutTilesParams['reconciledPeers'],
  participantRoles: UseArenaLayoutTilesParams['participantRoles'],
): string {
  const r = reconciledPeers.find((x) => x.semantic.expectedSlotIndex === idx);
  if (r?.semantic.kind === 'orphan') {
    return `@${ORPHAN_GUEST_LABEL}`;
  }
  if (uid && participantRoles[uid]?.name) {
    return participantRoles[uid].name;
  }
  const trimmed = panel?.userName?.trim();
  if (trimmed) return trimmed;
  return `Participant ${idx + 1}`;
}

function hasActiveVideo(
  panel: UseArenaLayoutTilesParams['challengerRemoteSlots'][number],
): boolean {
  return panel?.videoOn === true;
}

function resolveIsLocal(
  uid: string | undefined,
  panel: UseArenaLayoutTilesParams['challengerRemoteSlots'][number],
  localUserId: string,
  localSessionId: string | null | undefined,
  isViewer: boolean,
): boolean {
  if (isViewer) return false;
  if (uid && userIdsEqual(uid, localUserId)) return true;
  return panel != null && panel.sessionId === localSessionId;
}

export function useArenaLayoutTiles(params: UseArenaLayoutTilesParams): ArenaTileVM[] {
  const {
    expectedUids,
    challengerRemoteSlots,
    reconciledPeers,
    participantRoles,
    auras,
    localUserId,
    localSessionId,
    isViewer,
  } = params;

  return useMemo(() => {
    const tileCount =
      expectedUids.length > 0
        ? Math.min(expectedUids.length, ARENA_CHALLENGER_SLOT_COUNT)
        : challengerRemoteSlots.reduce((max, p, i) => (p ? Math.max(max, i + 1) : max), 0);

    if (tileCount <= 0) return [];

    const tiles: ArenaTileVM[] = [];

    for (let idx = 0; idx < tileCount; idx++) {
      const uid = expectedUids[idx];
      const panel = challengerRemoteSlots[idx] ?? null;
      const slot = indexToChallengerSlot(idx);
      const name = resolveTileName(idx, uid, panel, reconciledPeers, participantRoles);
      const arenaUserId = uid ?? panel?.arenaUserId ?? null;

      tiles.push({
        id: `arena-tile-${slot}`,
        slot,
        name,
        arenaUserId,
        panel,
        aura: auras[slot],
        colorRgb: CHALLENGER_SLOT_COLORS[slot],
        hasActiveVideo: hasActiveVideo(panel),
        isLocal: resolveIsLocal(uid, panel, localUserId, localSessionId, isViewer),
        cellClass: getNexusCellClass(idx, tileCount),
        uiPosClass: getNexusChromeUiPos(idx, tileCount),
      });
    }

    return tiles;
  }, [
    expectedUids,
    challengerRemoteSlots,
    reconciledPeers,
    participantRoles,
    auras,
    localUserId,
    localSessionId,
    isViewer,
  ]);
}
