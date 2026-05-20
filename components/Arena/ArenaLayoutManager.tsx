'use client';

import { useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { resolveArenaLayoutMode } from '@/lib/arena-layout-mode';
import { ConstellationOrbit } from './constellation/ConstellationOrbit';
import { NexusGrid } from './nexus/NexusGrid';
import { MediatorOrb } from './shared/MediatorOrb';
import type { ArenaLayoutManagerProps } from './types';
import { useArenaLayoutTiles } from './useArenaLayoutTiles';

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

  const expectedCount = expectedUids.length;
  const connectedCount = useMemo(
    () => tiles.filter((t) => t.panel != null).length,
    [tiles],
  );
  const mode = resolveArenaLayoutMode(expectedCount, connectedCount);

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
