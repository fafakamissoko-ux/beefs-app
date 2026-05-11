'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import DailyIframe, { DailyCall, DailyParticipant } from '@daily-co/daily-js';
import {
  buildDailyJoinUserData,
  extractArenaUserIdFromDailyParticipant,
  type PhysicalPeer,
} from '@/lib/participant-identity';

export type MeetingConnectionStatus = 'idle' | 'joining' | 'joined' | 'error' | 'left';

async function disposeCallSafely(co: DailyCall | null): Promise<void> {
  if (!co) return;
  try {
    co.setLocalVideo(false);
    co.setLocalAudio(false);
  } catch (_) {}
  await co.leave().catch(() => {});
  await co.destroy().catch(() => {});
}

function toPhysicalPeer(p: DailyParticipant): PhysicalPeer {
  const vState = p.tracks?.video?.state;
  const aState = p.tracks?.audio?.state;
  const vTrack = p.tracks?.video?.persistentTrack ?? p.tracks?.video?.track ?? null;
  const aTrack = p.tracks?.audio?.persistentTrack ?? p.tracks?.audio?.track ?? null;
  return {
    sessionId: p.session_id,
    displayName: (p.user_name as string) || 'Participant',
    videoTrack: vTrack,
    audioTrack: aTrack,
    isLocal: p.local,
    arenaUserId: extractArenaUserIdFromDailyParticipant(p),
    videoTrackState: typeof vState === 'string' ? vState : undefined,
    audioTrackState: typeof aState === 'string' ? aState : undefined,
  };
}

function buildPeersRecord(co: DailyCall): Record<string, PhysicalPeer> {
  const parts = co.participants() as Record<string, DailyParticipant>;
  const out: Record<string, PhysicalPeer> = {};
  for (const p of Object.values(parts)) {
    out[p.session_id] = toPhysicalPeer(p);
  }
  return out;
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

export interface UseDailyMeetingEngineOptions {
  roomUrl: string | null;
  userName: string;
  viewerMode: boolean;
  arenaUserId: string | null;
}

export interface UseDailyMeetingEngineResult {
  status: MeetingConnectionStatus;
  /** Snapshot stable par `session_id` Daily */
  peersBySessionId: Record<string, PhysicalPeer>;
  join: (startCam?: boolean, startMic?: boolean, token?: string) => Promise<void>;
  leave: () => Promise<void>;
  stopCamera: () => void;
  toggleMic: () => void;
  toggleCam: () => void;
  setLocalAudioEnabled: (enabled: boolean) => void;
  setRemoteParticipantAudio: (sessionId: string, enabled: boolean) => void;
  ejectRemoteParticipant: (sessionId: string) => Promise<boolean>;
  micEnabled: boolean;
  camEnabled: boolean;
  activeSpeakerPeerId: string | null;
  error: string | null;
  isCameraInterrupted: boolean;
  recoverMediaDevices: () => Promise<void>;
}

export function useDailyMeetingEngine(options: UseDailyMeetingEngineOptions): UseDailyMeetingEngineResult {
  const { roomUrl, userName, viewerMode, arenaUserId } = options;

  const [status, setStatus] = useState<MeetingConnectionStatus>('idle');
  const [peersBySessionId, setPeersBySessionId] = useState<Record<string, PhysicalPeer>>({});
  const [micEnabled, setMicEnabled] = useState(!viewerMode);
  const [camEnabled, setCamEnabled] = useState(!viewerMode);
  const [activeSpeakerPeerId, setActiveSpeakerPeerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCameraInterrupted, setIsCameraInterrupted] = useState(false);

  const callRef = useRef<DailyCall | null>(null);
  const reconnectingRef = useRef(false);
  const intentionalActionRef = useRef(false);
  const joinWatchdogRef = useRef<number | null>(null);

  const refreshPeers = useCallback((co: DailyCall) => {
    setPeersBySessionId(buildPeersRecord(co));
  }, []);

  const setupListeners = useCallback(
    (co: DailyCall) => {
      co.on('joined-meeting', () => {
        if (joinWatchdogRef.current != null) {
          window.clearTimeout(joinWatchdogRef.current);
          joinWatchdogRef.current = null;
        }
        setStatus('joined');
        setError(null);
        setIsCameraInterrupted(false);
        reconnectingRef.current = false;
        refreshPeers(co);
      });
      co.on('participant-joined', () => refreshPeers(co));
      co.on('participant-updated', () => refreshPeers(co));
      co.on('participant-left', () => refreshPeers(co));
      co.on('track-started', (evt: unknown) => {
        const e = evt as { participant?: { local?: boolean } };
        refreshPeers(co);
        if (e.participant?.local) setIsCameraInterrupted(false);
      });
      co.on('track-stopped', (evt: unknown) => {
        const e = evt as { participant?: { local?: boolean; screen?: boolean }; track?: MediaStreamTrack };
        refreshPeers(co);
        if (e.participant?.local && e.track && !intentionalActionRef.current) {
          const isScreen = e.track.label?.toLowerCase().includes('screen') || e.participant.screen;
          if (!isScreen) setIsCameraInterrupted(true);
        }
      });
      co.on('left-meeting', () => {
        setStatus('left');
        setPeersBySessionId({});
        setActiveSpeakerPeerId(null);
        setIsCameraInterrupted(false);
      });
      co.on('error', (e: unknown) => {
        if (joinWatchdogRef.current != null) {
          window.clearTimeout(joinWatchdogRef.current);
          joinWatchdogRef.current = null;
        }
        const msg = (e as { errorMsg?: string })?.errorMsg;
        setError(msg || 'Erreur de connexion');
        setStatus('error');
      });
      co.on('active-speaker-change', (event: unknown) => {
        const ev = event as { activeSpeaker?: { peerId?: string } };
        setActiveSpeakerPeerId(ev?.activeSpeaker?.peerId ?? null);
      });
    },
    [refreshPeers],
  );

  const join = useCallback(
    async (startCam = true, startMic = true, token?: string) => {
      if (!roomUrl || status === 'joining' || status === 'joined') return;
      setStatus('joining');
      setError(null);
      setCamEnabled(startCam);
      setMicEnabled(startMic);

      try {
        if (callRef.current) {
          const prev = callRef.current;
          callRef.current = null;
          await disposeCallSafely(prev);
        }

        const userData = buildDailyJoinUserData(arenaUserId);
        const co = DailyIframe.createCallObject({
          userData,
          subscribeToTracksAutomatically: true,
        });
        callRef.current = co;
        setupListeners(co);

        if (joinWatchdogRef.current != null) {
          window.clearTimeout(joinWatchdogRef.current);
          joinWatchdogRef.current = null;
        }
        joinWatchdogRef.current = window.setTimeout(() => {
          if (callRef.current?.meetingState() !== 'joined-meeting') {
            setError('Connexion trop lente ou bloquée par le navigateur.');
            setStatus('error');
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
        if (joinWatchdogRef.current != null) {
          window.clearTimeout(joinWatchdogRef.current);
          joinWatchdogRef.current = null;
        }
        const dangling = callRef.current;
        callRef.current = null;
        await disposeCallSafely(dangling);
        setError(err instanceof Error ? err.message : 'Impossible de rejoindre');
        setStatus('error');
      }
    },
    [roomUrl, userName, viewerMode, arenaUserId, setupListeners, status],
  );

  const leave = useCallback(async () => {
    if (!callRef.current) return;
    const co = callRef.current;
    callRef.current = null;
    await disposeCallSafely(co);
    setStatus('left');
    setPeersBySessionId({});
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

  const setLocalAudioEnabled = useCallback(
    (enabled: boolean) => {
      if (!callRef.current || viewerMode) return;
      try {
        callRef.current.setLocalAudio(enabled);
        setMicEnabled(enabled);
      } catch {
        /* ignore */
      }
    },
    [viewerMode],
  );

  const setRemoteParticipantAudio = useCallback(
    (sessionId: string, enabled: boolean) => {
      if (!callRef.current || viewerMode) return;
      const id = resolveDailySessionId(callRef.current, sessionId);
      if (id) callRef.current.updateParticipant(id, { setAudio: enabled });
    },
    [viewerMode],
  );

  const ejectRemoteParticipant = useCallback(
    async (sessionId: string): Promise<boolean> => {
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
    },
    [viewerMode],
  );

  const recoverMediaDevices = useCallback(async () => Promise.resolve(), []);

  useEffect(() => {
    if (status !== 'joined') return;
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
  }, [status]);

  useEffect(() => {
    return () => {
      if (joinWatchdogRef.current != null) {
        window.clearTimeout(joinWatchdogRef.current);
        joinWatchdogRef.current = null;
      }
      const co = callRef.current;
      callRef.current = null;
      void disposeCallSafely(co);
    };
  }, []);

  return {
    status,
    peersBySessionId,
    join,
    leave,
    stopCamera,
    toggleMic,
    toggleCam,
    setLocalAudioEnabled,
    setRemoteParticipantAudio,
    ejectRemoteParticipant,
    micEnabled,
    camEnabled,
    activeSpeakerPeerId,
    error,
    isCameraInterrupted,
    recoverMediaDevices,
  };
}
