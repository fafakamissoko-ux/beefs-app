'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import DailyIframe, { DailyCall, DailyParticipant } from '@daily-co/daily-js';
import { buildDailyJoinUserData, extractArenaUserIdFromDailyParticipant } from '@/lib/participant-identity';

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

function resolveDailySessionId(co: DailyCall, hint: string): string | null {
  try {
    const parts = co.participants();
    if (parts[hint]) return hint;
    for (const [key, p] of Object.entries(parts)) {
      const dp = p as DailyParticipant;
      if (key === hint || dp.session_id === hint) return key;
      const uid = typeof dp.user_id === 'string' ? dp.user_id : '';
      if (uid && uid === hint) return key;
    }
  } catch (_) {}
  return null;
}

function toCallParticipant(p: DailyParticipant): CallParticipant {
  const videoState = p.tracks?.video?.state;
  const audioState = p.tracks?.audio?.state;
  return {
    sessionId: p.session_id,
    userName: (p.user_name as string) || 'Participant',
    arenaUserId: extractArenaUserIdFromDailyParticipant(p),
    isLocal: p.local,
    videoTrack: p.tracks?.video?.persistentTrack ?? null,
    audioTrack: p.tracks?.audio?.persistentTrack ?? null,
    videoOn: !!p.tracks?.video?.persistentTrack && videoState !== 'off' && videoState !== 'blocked',
    audioOn: !!p.tracks?.audio?.persistentTrack && audioState !== 'off' && audioState !== 'blocked',
  };
}

export function useDailyCall(
  roomUrl: string | null,
  userName: string,
  viewerMode = false,
  arenaUserId: string | null = null,
): UseDailyCallReturn {
  const callRef = useRef<DailyCall | null>(null);
  const [isJoined, setIsJoined] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [micEnabled, setMicEnabled] = useState(!viewerMode);
  const [camEnabled, setCamEnabled] = useState(!viewerMode);

  const camEnabledRef = useRef(camEnabled);
  const micEnabledRef = useRef(micEnabled);
  useEffect(() => {
    camEnabledRef.current = camEnabled;
  }, [camEnabled]);
  useEffect(() => {
    micEnabledRef.current = micEnabled;
  }, [micEnabled]);

  const [localParticipant, setLocalParticipant] = useState<CallParticipant | null>(null);
  const [remoteParticipants, setRemoteParticipants] = useState<CallParticipant[]>([]);
  const [activeSpeakerPeerId, setActiveSpeakerPeerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCameraInterrupted, setIsCameraInterrupted] = useState(false);

  const reconnectingRef = useRef(false);
  const intentionalActionRef = useRef(false);
  const joinWatchdogRef = useRef<number | null>(null);

  const refreshParticipants = useCallback((co: DailyCall) => {
    const all = Object.values(co.participants());
    const local = all.find((p) => p.local);
    const remotes = all.filter((p) => !p.local);
    setLocalParticipant(local ? toCallParticipant(local) : null);
    setRemoteParticipants(remotes.map(toCallParticipant));
  }, []);

  const setupListeners = useCallback(
    (co: DailyCall) => {
      co.on('joined-meeting', () => {
        if (joinWatchdogRef.current != null) window.clearTimeout(joinWatchdogRef.current);
        setIsJoined(true);
        setIsJoining(false);
        setIsCameraInterrupted(false);
        reconnectingRef.current = false;
        refreshParticipants(co);
      });
      co.on('participant-joined', () => refreshParticipants(co));
      co.on('participant-updated', () => refreshParticipants(co));
      co.on('participant-left', () => refreshParticipants(co));
      co.on('track-started', (evt: unknown) => {
        const e = evt as { participant?: { local?: boolean } };
        refreshParticipants(co);
        if (e.participant?.local) setIsCameraInterrupted(false);
      });
      co.on('track-stopped', (evt: unknown) => {
        const e = evt as { participant?: { local?: boolean; screen?: boolean }; track?: MediaStreamTrack };
        refreshParticipants(co);
        if (e.participant?.local && e.track && !intentionalActionRef.current) {
          const isScreen = e.track.label?.toLowerCase().includes('screen') || e.participant.screen;
          if (!isScreen) setIsCameraInterrupted(true);
        }
      });
      co.on('left-meeting', () => {
        setIsJoined(false);
        setLocalParticipant(null);
        setRemoteParticipants([]);
        setActiveSpeakerPeerId(null);
        setIsCameraInterrupted(false);
      });
      co.on('error', (e: unknown) => {
        if (joinWatchdogRef.current != null) window.clearTimeout(joinWatchdogRef.current);
        const msg = (e as { errorMsg?: string })?.errorMsg;
        setError(msg || 'Erreur de connexion');
        setIsJoining(false);
      });
      co.on('active-speaker-change', (event: unknown) => {
        const ev = event as { activeSpeaker?: { peerId?: string } };
        setActiveSpeakerPeerId(ev?.activeSpeaker?.peerId ?? null);
      });
    },
    [refreshParticipants],
  );

  const join = useCallback(
    async (startCam: boolean = true, startMic: boolean = true, token?: string) => {
      if (!roomUrl || isJoining || isJoined) return;
      setIsJoining(true);
      setError(null);

      setCamEnabled(startCam);
      setMicEnabled(startMic);

      try {
        if (callRef.current) {
          await callRef.current.destroy();
          callRef.current = null;
        }

        const userData = buildDailyJoinUserData(arenaUserId);
        const co = DailyIframe.createCallObject({
          userData,
          subscribeToTracksAutomatically: true,
        });
        callRef.current = co;
        setupListeners(co);

        joinWatchdogRef.current = window.setTimeout(() => {
          if (callRef.current?.meetingState() !== 'joined-meeting') {
            setError('Connexion trop lente ou bloquée par le navigateur.');
            setIsJoining(false);
          }
        }, 15_000);

        await co.join({
          url: roomUrl,
          ...(token ? { token } : {}),
          userName,
          ...(userData ? { userData } : {}),
          startVideoOff: viewerMode ? true : !startCam,
          startAudioOff: viewerMode ? true : !startMic,
        });
      } catch (err: unknown) {
        if (joinWatchdogRef.current != null) window.clearTimeout(joinWatchdogRef.current);
        const m = err instanceof Error ? err.message : 'Impossible de rejoindre';
        setError(m);
        setIsJoining(false);
      }
    },
    [roomUrl, userName, isJoining, isJoined, viewerMode, arenaUserId, setupListeners],
  );

  const leave = useCallback(async () => {
    if (!callRef.current) return;
    const co = callRef.current;
    callRef.current = null;
    try {
      co.setLocalVideo(false);
    } catch (_) {}
    try {
      co.setLocalAudio(false);
    } catch (_) {}
    await co.leave().catch(() => {});
    await co.destroy().catch(() => {});
    setIsJoined(false);
    setLocalParticipant(null);
    setRemoteParticipants([]);
    setActiveSpeakerPeerId(null);
  }, []);

  const stopCamera = useCallback(() => {
    try {
      callRef.current?.setLocalVideo(false);
    } catch (_) {}
  }, []);

  const toggleMic = useCallback(() => {
    if (!callRef.current || viewerMode) return;
    intentionalActionRef.current = true;
    const next = !micEnabled;
    callRef.current.setLocalAudio(next);
    setMicEnabled(next);
    setTimeout(() => {
      intentionalActionRef.current = false;
    }, 1000);
  }, [micEnabled, viewerMode]);

  const toggleCam = useCallback(() => {
    if (!callRef.current || viewerMode) return;
    intentionalActionRef.current = true;
    const next = !camEnabled;
    callRef.current.setLocalVideo(next);
    setCamEnabled(next);
    setTimeout(() => {
      intentionalActionRef.current = false;
    }, 1000);
  }, [camEnabled, viewerMode]);

  const setLocalAudioEnabled = useCallback((enabled: boolean) => {
    if (!callRef.current || viewerMode) return;
    try {
      callRef.current.setLocalAudio(enabled);
      setMicEnabled(enabled);
    } catch {
      /* ignore */
    }
  }, [viewerMode]);

  const setRemoteParticipantAudio = useCallback((sessionId: string, enabled: boolean) => {
    if (!callRef.current || viewerMode) return;
    const id = resolveDailySessionId(callRef.current, sessionId);
    if (id) callRef.current.updateParticipant(id, { setAudio: enabled });
  }, [viewerMode]);

  const ejectRemoteParticipant = useCallback(async (sessionId: string): Promise<boolean> => {
    if (!callRef.current || viewerMode) return false;
    try {
      const id = resolveDailySessionId(callRef.current, sessionId);
      if (id) {
        await callRef.current.updateParticipant(id, { eject: true });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [viewerMode]);

  const recoverMediaDevices = useCallback(async () => {
    return Promise.resolve();
  }, []);

  useEffect(() => {
    if (!isJoined) return;
    const handleOffline = () => {
      reconnectingRef.current = true;
    };
    const handleOnline = () => {
      if (!reconnectingRef.current || !callRef.current) return;
      const co = callRef.current;
      if (co.meetingState() === 'joined-meeting') {
        reconnectingRef.current = false;
      }
    };
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [isJoined]);

  useEffect(() => {
    return () => {
      if (callRef.current) {
        void callRef.current.destroy().catch(() => {});
        callRef.current = null;
      }
    };
  }, []);

  return {
    join,
    leave,
    stopCamera,
    toggleMic,
    toggleCam,
    setLocalAudioEnabled,
    setRemoteParticipantAudio,
    ejectRemoteParticipant,
    isJoined,
    isJoining,
    micEnabled,
    camEnabled,
    localParticipant,
    remoteParticipants,
    activeSpeakerPeerId,
    error,
    isCameraInterrupted,
    recoverMediaDevices,
  };
}
