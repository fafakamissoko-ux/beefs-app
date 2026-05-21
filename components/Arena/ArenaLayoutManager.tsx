'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { ChallengerSlotId } from '@/lib/arena-slots';
import { resolveArenaLayoutMode } from '@/lib/arena-layout-mode';
import { ConstellationOrbit } from './constellation/ConstellationOrbit';
import { NexusGrid } from './nexus/NexusGrid';
import { MediatorOrb } from './shared/MediatorOrb';
import { StarField } from './shared/StarField';
import type { ArenaLayoutManagerProps } from './types';
import { useArenaLayoutTiles } from './useArenaLayoutTiles';

const LAYOUT_GRACE_MS = 1500;

export function ArenaLayoutManager(props: ArenaLayoutManagerProps) {
  const {
    expectedUids,
    challengerRemoteSlots,
    reconciledPeers,
    participantRoles,
    auras,
    localUserId,
    localSessionId,
    isViewer,
    isHost,
    speakingTurnActive,
    effectiveHotMicSpeakerSlot,
    structuredDebateEnabled,
    micMutedByMediator,
    mediatorHoldingFloor,
    micEnabled,
    camEnabled,
    localCamEnabled = true,
    onTapSupport,
    onPreferSide,
    onOpenProfile,
    onToggleMic,
    onToggleCam,
    onToast,
    mediatorParticipant,
    mediatorIsLocal,
    mediatorName,
    auraMed,
    isWaitingForMediator,
    isCameraInterrupted,
    onRecoverMediaDevices,
    mediatorGraceActive,
    mediatorGraceSeconds,
    mediatorHostId,
    isJoined,
    timerActive,
    timerPaused,
    beefTimeRemaining,
    formatBeefTime,
    onToggleMediatorSidebar,
    getMediatorDynamicColor,
  } = props;

  const tiles = useArenaLayoutTiles({
    expectedUids,
    challengerRemoteSlots,
    reconciledPeers,
    participantRoles,
    auras,
    localUserId,
    localSessionId,
    isViewer,
  });

  const graceUntilRef = useRef<Partial<Record<ChallengerSlotId, number>>>({});
  const [graceTick, setGraceTick] = useState(0);

  useEffect(() => {
    const now = Date.now();
    let nextExpiry: number | null = null;

    for (const tile of tiles) {
      if (!tile.panel) {
        delete graceUntilRef.current[tile.slot];
        continue;
      }

      if (tile.hasActiveVideo) {
        delete graceUntilRef.current[tile.slot];
        continue;
      }

      const intentionalCamOff =
        tile.isLocal && (!camEnabled || !localCamEnabled);
      if (intentionalCamOff) {
        delete graceUntilRef.current[tile.slot];
        continue;
      }

      if (graceUntilRef.current[tile.slot] == null) {
        graceUntilRef.current[tile.slot] = now + LAYOUT_GRACE_MS;
      }

      const until = graceUntilRef.current[tile.slot];
      if (until && until > now) {
        nextExpiry = nextExpiry == null ? until : Math.min(nextExpiry, until);
      }
    }

    if (nextExpiry == null) return;

    const delay = Math.max(0, nextExpiry - now + 50);
    const timerId = window.setTimeout(() => setGraceTick((t) => t + 1), delay);
    return () => window.clearTimeout(timerId);
  }, [tiles, camEnabled, localCamEnabled]);

  const expectedCount = expectedUids.length;

  const effectiveVideoCount = useMemo(() => {
    void graceTick;
    const now = Date.now();
    const realActive = tiles.filter((t) => t.hasActiveVideo).length;
    if (realActive === 0 && !localCamEnabled) {
      return 0;
    }
    return tiles.filter((tile) => {
      if (tile.hasActiveVideo) return true;
      const until = graceUntilRef.current[tile.slot];
      return until != null && until > now;
    }).length;
  }, [tiles, graceTick, localCamEnabled]);

  const mode = resolveArenaLayoutMode(expectedCount, effectiveVideoCount);

  const surfaceProps = {
    isViewer,
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
  };

  const mediatorProps = {
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
  };

  return (
    <div className="absolute inset-0 z-0 bg-black/50 backdrop-blur-3xl p-1 sm:p-2">
      <AnimatePresence mode="wait">
        {mode === 'nexus' ? (
          <motion.div
            key="nexus"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="relative h-full w-full"
          >
            <NexusGrid
              tiles={tiles}
              speakingTurnActive={speakingTurnActive}
              effectiveHotMicSpeakerSlot={effectiveHotMicSpeakerSlot}
              {...surfaceProps}
            />
            <MediatorOrb {...mediatorProps} />
          </motion.div>
        ) : (
          <motion.div
            key="constellation"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="relative h-full w-full"
          >
            <StarField />
            <ConstellationOrbit
              tiles={tiles}
              speakingTurnActive={speakingTurnActive}
              effectiveHotMicSpeakerSlot={effectiveHotMicSpeakerSlot}
              mediator={mediatorProps}
              {...surfaceProps}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
