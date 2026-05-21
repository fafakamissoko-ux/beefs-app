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
  } catch {
    /* ignore */
  }
  await co.leave().catch(() => {});
  await co.destroy().catch(() => {});
}

export function toPhysicalPeerFromDailyParticipant(p: DailyParticipant): PhysicalPeer {
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
    out[p.session_id] = toPhysicalPeerFromDailyParticipant(p);
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
  } catch {
    /* ignore */
  }
  return null;
}

export interface UseDailyMeetingEngineOptions {
  roomUrl: string | null;
  userName: string;
  viewerMode: boolean;
  arenaUserId: string | null;
  /** Jeton issu exclusivement de la Phase 1 (aucun fetch réseau dans ce hook). */
  meetingToken: string | null | undefined;
}

export interface UseDailyMeetingEngineResult {
  status: MeetingConnectionStatus;
  peersBySessionId: Record<string, PhysicalPeer>;
  join: (preAcquiredStream?: MediaStream | null, opts?: { camEnabled?: boolean }) => Promise<void>;
  leave: () => Promise<void>;
  stopCamera: () => void;
  toggleMic: () => void;
  toggleCam: () => void;
  setLocalAudioEnabled: (enabled: boolean) => void;
  setRemoteParticipantAudio: (sessionId: string, enabled: boolean) => void;
  /** Coupure micro côté room (token owner Daily) : `muted=true` force la cible muette pour tous. */
  hardMuteParticipant: (sessionId: string, muted: boolean) => void;
  ejectRemoteParticipant: (sessionId: string) => Promise<boolean>;
  micEnabled: boolean;
  camEnabled: boolean;
  activeSpeakerPeerId: string | null;
  error: string | null;
  isCameraInterrupted: boolean;
  recoverMediaDevices: () => Promise<void>;
}

/**
 * Moteur WebRTC Daily « idiote » : uniquement `co.join({ url, token, … })`.
 * Aucun appel HTTP vers les APIs backend de l’app.
 */
export function useDailyMeetingEngine(options: UseDailyMeetingEngineOptions): UseDailyMeetingEngineResult {
  const { roomUrl, userName, viewerMode, arenaUserId, meetingToken } = options;

  const [status, setStatus] = useState<MeetingConnectionStatus>('idle');
  const [peersBySessionId, setPeersBySessionId] = useState<Record<string, PhysicalPeer>>({});
  const [micEnabled, setMicEnabled] = useState(!viewerMode);
  const [camEnabled, setCamEnabled] = useState(!viewerMode);
  const [activeSpeakerPeerId, setActiveSpeakerPeerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCameraInterrupted, setIsCameraInterrupted] = useState(false);

  const statusRef = useRef(status);
  statusRef.current = status;

  const callRef = useRef<DailyCall | null>(null);
  const reconnectingRef = useRef(false);
  const intentionalActionRef = useRef(false);
  const joinWatchdogRef = useRef<number | null>(null);

  const roomUrlRef = useRef(roomUrl);
  const userNameRef = useRef(userName);
  const viewerModeRef = useRef(viewerMode);
  const arenaUserIdRef = useRef(arenaUserId);
  const meetingTokenRef = useRef(meetingToken);
  roomUrlRef.current = roomUrl;
  userNameRef.current = userName;
  viewerModeRef.current = viewerMode;
  arenaUserIdRef.current = arenaUserId;
  meetingTokenRef.current = meetingToken;

  const refreshPeers = useCallback((co: DailyCall) => {
    setPeersBySessionId(buildPeersRecord(co));
  }, []);

  const clearJoinWatchdog = useCallback(() => {
    if (joinWatchdogRef.current != null) {
      window.clearTimeout(joinWatchdogRef.current);
      joinWatchdogRef.current = null;
    }
  }, []);

  const setupListeners = useCallback(
    (co: DailyCall) => {
      co.on('joined-meeting', () => {
        clearJoinWatchdog();
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
          const isScreen =
            e.track.label?.toLowerCase().includes('screen') || e.participant.screen;
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
        clearJoinWatchdog();
        const msg = (e as { errorMsg?: string })?.errorMsg;
        setError(msg || 'Erreur de connexion');
        setStatus('error');
      });
      co.on('load-attempt-failed', (e: unknown) => {
        clearJoinWatchdog();
        setError((e as { errorMsg?: string })?.errorMsg || 'Chargement de la salle impossible.');
        setStatus('error');
      });
      co.on('active-speaker-change', (event: unknown) => {
        const ev = event as { activeSpeaker?: { peerId?: string } };
        setActiveSpeakerPeerId(ev?.activeSpeaker?.peerId ?? null);
      });
      co.on('camera-error', () => {
        setIsCameraInterrupted(true);
      });
    },
    [clearJoinWatchdog, refreshPeers],
  );

  const join = useCallback(
    async (preAcquiredStream?: MediaStream | null, opts?: { camEnabled?: boolean }) => {
      const url = roomUrlRef.current;
      const tokRaw = meetingTokenRef.current;
      const token = typeof tokRaw === 'string' && tokRaw.length > 0 ? tokRaw : undefined;

      if (!url || statusRef.current === 'joining' || statusRef.current === 'joined') return;

      if (!token) {
        setError('Jeton Daily manquant — repasse par la page d’entrée (Phase 1).');
        setStatus('error');
        return;
      }

      setStatus('joining');
      setError(null);
      clearJoinWatchdog();

      try {
        await disposeCallSafely(callRef.current);
        callRef.current = null;

        const vm = viewerModeRef.current;
        const shouldStartVideoOff = vm || opts?.camEnabled === false;

        let videoSource: boolean | MediaStreamTrack = !vm && !shouldStartVideoOff;
        let audioSource: boolean | MediaStreamTrack = !vm;
        if (!vm && preAcquiredStream) {
          const at = preAcquiredStream.getAudioTracks()[0];
          if (!shouldStartVideoOff) {
            const vt = preAcquiredStream.getVideoTracks()[0];
            if (vt) videoSource = vt;
            else videoSource = false;
          } else {
            videoSource = false;
          }
          if (at) audioSource = at;
          else audioSource = false;
        }

        if (opts?.camEnabled === false) {
          setCamEnabled(false);
        }

        const co = DailyIframe.createCallObject(
          vm
            ? { subscribeToTracksAutomatically: true }
            : { audioSource, videoSource },
        );
        callRef.current = co;
        setupListeners(co);

        joinWatchdogRef.current = window.setTimeout(() => {
          if (callRef.current?.meetingState() !== 'joined-meeting') {
            setError('Connexion trop lente ou bloquée par le navigateur.');
            setStatus('error');
          }
        }, 15_000);

        const userData = buildDailyJoinUserData(arenaUserIdRef.current);

        await co.join({
          url,
          token,
          userName: userNameRef.current,
          ...(userData ? { userData } : {}),
          startVideoOff: shouldStartVideoOff,
          startAudioOff: vm,
        });
      } catch (err: unknown) {
        clearJoinWatchdog();
        const dangling = callRef.current;
        callRef.current = null;
        await disposeCallSafely(dangling);
        setError(err instanceof Error ? err.message : 'Impossible de rejoindre');
        setStatus('error');
      }
    },
    [clearJoinWatchdog, setupListeners],
  );

  const leave = useCallback(async () => {
    await disposeCallSafely(callRef.current);
    callRef.current = null;
    setStatus('left');
    setPeersBySessionId({});
    setActiveSpeakerPeerId(null);
  }, []);

  const stopCamera = useCallback(() => {
    try {
      callRef.current?.setLocalVideo(false);
    } catch {
      /* ignore */
    }
  }, []);

  const toggleMic = useCallback(() => {
    if (!callRef.current || viewerModeRef.current) return;
    intentionalActionRef.current = true;
    const next = !micEnabled;
    callRef.current.setLocalAudio(next);
    setMicEnabled(next);
    setTimeout(() => {
      intentionalActionRef.current = false;
    }, 1000);
  }, [micEnabled]);

  const toggleCam = useCallback(() => {
    if (!callRef.current || viewerModeRef.current) return;
    intentionalActionRef.current = true;
    const next = !camEnabled;
    callRef.current.setLocalVideo(next);
    setCamEnabled(next);
    setTimeout(() => {
      intentionalActionRef.current = false;
    }, 1000);
  }, [camEnabled]);

  const setLocalAudioEnabled = useCallback((enabled: boolean) => {
    if (!callRef.current || viewerModeRef.current) return;
    try {
      callRef.current.setLocalAudio(enabled);
      setMicEnabled(enabled);
    } catch {
      /* ignore */
    }
  }, []);

  const setRemoteParticipantAudio = useCallback((sessionId: string, enabled: boolean) => {
    if (!callRef.current || viewerModeRef.current) return;
    const id = resolveDailySessionId(callRef.current, sessionId);
    if (id) callRef.current.updateParticipant(id, { setAudio: enabled });
  }, []);

  const hardMuteParticipant = useCallback((sessionId: string, muted: boolean) => {
    if (!callRef.current || viewerModeRef.current) return;
    const id = resolveDailySessionId(callRef.current, sessionId);
    if (id) callRef.current.updateParticipant(id, { setAudio: !muted });
  }, []);

  const ejectRemoteParticipant = useCallback(async (sessionId: string): Promise<boolean> => {
    if (!callRef.current || viewerModeRef.current) return false;
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
  }, []);

  const recoverMediaDevices = useCallback(async () => {
    const co = callRef.current;
    if (!co) return;
    try {
      intentionalActionRef.current = true;
      setIsCameraInterrupted(false);
      if (!viewerModeRef.current) {
        await co.setLocalVideo(false);
        await co.setLocalAudio(false);
        await co.setLocalVideo(true);
        await co.setLocalAudio(true);
        setCamEnabled(true);
        setMicEnabled(true);
      }
      setTimeout(() => {
        intentionalActionRef.current = false;
      }, 1500);
    } catch {
      setIsCameraInterrupted(true);
      intentionalActionRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (status !== 'joined') return;
    const handleOffline = () => {
      reconnectingRef.current = true;
    };
    const handleOnline = async () => {
      if (!reconnectingRef.current || !roomUrlRef.current) return;
      const tokRaw = meetingTokenRef.current;
      const token = typeof tokRaw === 'string' && tokRaw.length > 0 ? tokRaw : undefined;
      if (!token) {
        reconnectingRef.current = false;
        return;
      }
      const co = callRef.current;
      if (co?.meetingState() === 'joined-meeting') {
        reconnectingRef.current = false;
        return;
      }
      try {
        await disposeCallSafely(callRef.current);
        callRef.current = null;

        const vm = viewerModeRef.current;
        const newCo = DailyIframe.createCallObject(
          vm ? { subscribeToTracksAutomatically: true } : { audioSource: true, videoSource: true },
        );
        callRef.current = newCo;
        setupListeners(newCo);
        const userData = buildDailyJoinUserData(arenaUserIdRef.current);
        await newCo.join({
          url: roomUrlRef.current,
          token,
          userName: userNameRef.current,
          ...(userData ? { userData } : {}),
          startVideoOff: vm,
          startAudioOff: vm,
        });
        reconnectingRef.current = false;
        refreshPeers(newCo);
      } catch {
        reconnectingRef.current = false;
      }
    };
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [refreshPeers, setupListeners, status]);

  useEffect(() => {
    if (status !== 'joined' || viewerModeRef.current) return;
    const onVis = () => {
      if (document.visibilityState === 'visible') void recoverMediaDevices();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [status, recoverMediaDevices]);

  useEffect(() => {
    return () => {
      clearJoinWatchdog();
      void disposeCallSafely(callRef.current);
      callRef.current = null;
    };
  }, [clearJoinWatchdog]);

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
    hardMuteParticipant,
    ejectRemoteParticipant,
    micEnabled,
    camEnabled,
    activeSpeakerPeerId,
    error,
    isCameraInterrupted,
    recoverMediaDevices,
  };
}
