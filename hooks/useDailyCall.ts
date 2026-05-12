'use client';

import { useMemo } from 'react';
import { useDailyMeetingEngine, type MeetingConnectionStatus } from '@/hooks/useDailyMeetingEngine';
import type { PhysicalPeer } from '@/lib/participant-identity';

export interface CallParticipant {
  sessionId: string;
  userName: string;
  arenaUserId: string | null;
  isLocal: boolean;
  videoTrack: MediaStreamTrack | null;
  audioTrack: MediaStreamTrack | null;
  videoOn: boolean;
  audioOn: boolean;
}

export interface UseDailyCallReturn {
  join: (preAcquiredStream?: MediaStream | null) => Promise<void>;
  leave: () => Promise<void>;
  stopCamera: () => void;
  toggleMic: () => void;
  toggleCam: () => void;
  setLocalAudioEnabled: (enabled: boolean) => void;
  setRemoteParticipantAudio: (sessionId: string, enabled: boolean) => void;
  hardMuteParticipant: (sessionId: string, muted: boolean) => void;
  ejectRemoteParticipant: (sessionId: string) => Promise<boolean>;
  isJoined: boolean;
  isJoining: boolean;
  micEnabled: boolean;
  camEnabled: boolean;
  /** Paires Daily triées (réconciliation identité). */
  physicalPeers: PhysicalPeer[];
  connectionStatus: MeetingConnectionStatus;
  localParticipant: CallParticipant | null;
  remoteParticipants: CallParticipant[];
  activeSpeakerPeerId: string | null;
  error: string | null;
  isCameraInterrupted: boolean;
  recoverMediaDevices: () => Promise<void>;
}

/** Mappe un {@link PhysicalPeer} vers le format affichage arène (pistes Daily). */
export function physicalPeerToCallParticipant(p: PhysicalPeer): CallParticipant {
  const vBlocked = p.videoTrackState === 'off' || p.videoTrackState === 'blocked';
  const aBlocked = p.audioTrackState === 'off' || p.audioTrackState === 'blocked';
  return {
    sessionId: p.sessionId,
    userName: p.displayName,
    arenaUserId: p.arenaUserId,
    isLocal: p.isLocal,
    videoTrack: p.videoTrack,
    audioTrack: p.audioTrack,
    videoOn: !!p.videoTrack && !vBlocked,
    audioOn: !!p.audioTrack && !aBlocked,
  };
}

/**
 * Façade arène : mappe le moteur {@link useDailyMeetingEngine} vers l’ancien `CallParticipant`.
 * Aucun fetch réseau — jeton fourni par la Phase 1 uniquement.
 */
export function useDailyCall(
  roomUrl: string | null,
  userName: string,
  viewerMode = false,
  arenaUserId: string | null = null,
  accessMeetingToken: string | null | undefined = undefined,
): UseDailyCallReturn {
  const engine = useDailyMeetingEngine({
    roomUrl,
    userName,
    viewerMode,
    arenaUserId,
    meetingToken: accessMeetingToken,
  });

  const physicalPeers = useMemo(() => {
    const list = Object.values(engine.peersBySessionId);
    return list.slice().sort((a, b) => a.sessionId.localeCompare(b.sessionId));
  }, [engine.peersBySessionId]);

  const localParticipant = useMemo(() => {
    const lp = Object.values(engine.peersBySessionId).find((x) => x.isLocal);
    return lp ? physicalPeerToCallParticipant(lp) : null;
  }, [engine.peersBySessionId]);

  const remoteParticipants = useMemo(
    () =>
      Object.values(engine.peersBySessionId)
        .filter((x) => !x.isLocal)
        .map(physicalPeerToCallParticipant),
    [engine.peersBySessionId],
  );

  const isJoined = engine.status === 'joined';
  const isJoining = engine.status === 'joining';

  return {
    join: engine.join,
    leave: engine.leave,
    stopCamera: engine.stopCamera,
    toggleMic: engine.toggleMic,
    toggleCam: engine.toggleCam,
    setLocalAudioEnabled: engine.setLocalAudioEnabled,
    setRemoteParticipantAudio: engine.setRemoteParticipantAudio,
    hardMuteParticipant: engine.hardMuteParticipant,
    ejectRemoteParticipant: engine.ejectRemoteParticipant,
    isJoined,
    isJoining,
    micEnabled: engine.micEnabled,
    camEnabled: engine.camEnabled,
    physicalPeers,
    connectionStatus: engine.status,
    localParticipant,
    remoteParticipants,
    activeSpeakerPeerId: engine.activeSpeakerPeerId,
    error: engine.error,
    isCameraInterrupted: engine.isCameraInterrupted,
    recoverMediaDevices: engine.recoverMediaDevices,
  };
}
