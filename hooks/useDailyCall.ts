'use client';

import { useMemo } from 'react';
import { useDailyMeetingEngine } from '@/hooks/useDailyMeetingEngine';
import type { PhysicalPeer } from '@/lib/participant-identity';

/**
 * Surface de compatibilité pour `TikTokStyleArena` — délègue à {@link useDailyMeetingEngine}.
 * L’UI migrera ensuite vers le moteur directement.
 */
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
  join: (camEnabled: boolean, micEnabled: boolean, token?: string) => Promise<void>;
  leave: () => Promise<void>;
  stopCamera: () => void;
  toggleMic: () => void;
  toggleCam: () => void;
  setLocalAudioEnabled: (enabled: boolean) => void;
  setRemoteParticipantAudio: (sessionId: string, enabled: boolean) => void;
  ejectRemoteParticipant: (sessionId: string) => Promise<boolean>;
  isJoined: boolean;
  isJoining: boolean;
  micEnabled: boolean;
  camEnabled: boolean;
  localParticipant: CallParticipant | null;
  remoteParticipants: CallParticipant[];
  activeSpeakerPeerId: string | null;
  error: string | null;
  isCameraInterrupted: boolean;
  recoverMediaDevices: () => Promise<void>;
}

function physicalToCallParticipant(p: PhysicalPeer): CallParticipant {
  const vs = p.videoTrackState;
  const as = p.audioTrackState;
  const videoOn =
    !!p.videoTrack &&
    (vs === undefined || (typeof vs === 'string' && vs !== 'off' && vs !== 'blocked'));
  const audioOn =
    !!p.audioTrack &&
    (as === undefined || (typeof as === 'string' && as !== 'off' && as !== 'blocked'));
  return {
    sessionId: p.sessionId,
    userName: p.displayName,
    arenaUserId: p.arenaUserId,
    isLocal: p.isLocal,
    videoTrack: p.videoTrack,
    audioTrack: p.audioTrack,
    videoOn,
    audioOn,
  };
}

export function useDailyCall(
  roomUrl: string | null,
  userName: string,
  viewerMode = false,
  arenaUserId: string | null = null,
): UseDailyCallReturn {
  const engine = useDailyMeetingEngine({ roomUrl, userName, viewerMode, arenaUserId });

  const { localParticipant, remoteParticipants } = useMemo(() => {
    const list = Object.values(engine.peersBySessionId);
    const local = list.find((x) => x.isLocal) ?? null;
    const remotes = list.filter((x) => !x.isLocal);
    return {
      localParticipant: local ? physicalToCallParticipant(local) : null,
      remoteParticipants: remotes.map(physicalToCallParticipant),
    };
  }, [engine.peersBySessionId]);

  return {
    join: engine.join,
    leave: engine.leave,
    stopCamera: engine.stopCamera,
    toggleMic: engine.toggleMic,
    toggleCam: engine.toggleCam,
    setLocalAudioEnabled: engine.setLocalAudioEnabled,
    setRemoteParticipantAudio: engine.setRemoteParticipantAudio,
    ejectRemoteParticipant: engine.ejectRemoteParticipant,
    isJoined: engine.status === 'joined',
    isJoining: engine.status === 'joining',
    micEnabled: engine.micEnabled,
    camEnabled: engine.camEnabled,
    localParticipant,
    remoteParticipants,
    activeSpeakerPeerId: engine.activeSpeakerPeerId,
    error: engine.error,
    isCameraInterrupted: engine.isCameraInterrupted,
    recoverMediaDevices: engine.recoverMediaDevices,
  };
}
