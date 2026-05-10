'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import DailyIframe, { DailyCall, DailyParticipant } from '@daily-co/daily-js';
import { supabase } from '@/lib/supabase/client';
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
  join: (preAcquiredStream?: MediaStream | null) => Promise<void>;
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
  } catch {}
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
  beefId: string | null = null,
  accessMeetingToken: string | null | undefined = undefined,
): UseDailyCallReturn {
  const callRef = useRef<DailyCall | null>(null);
  const [isJoined, setIsJoined] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [micEnabled, setMicEnabled] = useState(!viewerMode);
  const [camEnabled, setCamEnabled] = useState(!viewerMode);
  const [localParticipant, setLocalParticipant] = useState<CallParticipant | null>(null);
  const [remoteParticipants, setRemoteParticipants] = useState<CallParticipant[]>([]);
  const [activeSpeakerPeerId, setActiveSpeakerPeerId] = useState<string | null>(null);
  const [dailyAttachKey, setDailyAttachKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isCameraInterrupted, setIsCameraInterrupted] = useState(false);
  const reconnectingRef = useRef(false);
  const intentionalActionRef = useRef(false);
  const joinWatchdogRef = useRef<number | null>(null);

  const roomUrlRef = useRef(roomUrl);
  const userNameRef = useRef(userName);
  const arenaUserIdRef = useRef(arenaUserId);
  const beefIdRef = useRef(beefId);
  const viewerModeRef = useRef(viewerMode);
  const accessMeetingTokenRef = useRef(accessMeetingToken);
  roomUrlRef.current = roomUrl;
  userNameRef.current = userName;
  arenaUserIdRef.current = arenaUserId;
  beefIdRef.current = beefId;
  viewerModeRef.current = viewerMode;
  accessMeetingTokenRef.current = accessMeetingToken;

  const fetchMeetingToken = useCallback(async (): Promise<string> => {
    const bid = beefIdRef.current;
    if (!bid) throw new Error('Identifiant beef manquant pour le token Daily');
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Session requise pour rejoindre la visio');
    const res = await fetch('/api/daily/meeting-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ beefId: bid }),
    });
    const data: { error?: string; token?: string } = await res.json();
    if (!res.ok) throw new Error(data.error || 'Impossible d’obtenir le token Daily');
    if (!data.token) throw new Error('Token Daily manquant');
    return data.token;
  }, []);

  const refreshParticipants = useCallback((co: DailyCall) => {
    const all = Object.values(co.participants());
    const local = all.find((p) => p.local);
    const remotes = all.filter((p) => !p.local);
    setLocalParticipant(local ? toCallParticipant(local) : null);
    setRemoteParticipants(remotes.map(toCallParticipant));
  }, []);

  const clearJoinWatchdog = useCallback(() => {
    if (joinWatchdogRef.current != null) {
      window.clearTimeout(joinWatchdogRef.current);
      joinWatchdogRef.current = null;
    }
  }, []);

  const join = useCallback(
    async (preAcquiredStream?: MediaStream | null) => {
      if (!roomUrl || isJoining || isJoined) return;
      setIsJoining(true);
      setError(null);
      clearJoinWatchdog();

      try {
        if (callRef.current) {
          try {
            await callRef.current.leave();
            await callRef.current.destroy();
          } catch (_) {}
          callRef.current = null;
        }

        const userData = buildDailyJoinUserData(arenaUserId);

        // CONFIGURATION DYNAMIQUE : On omet totalement les clés matérielles si la piste n'existe pas (Fix du crash)
        const callOptions: any = {
          userData,
          subscribeToTracksAutomatically: true,
        };

        if (preAcquiredStream) {
          const audioTrack = preAcquiredStream.getAudioTracks()[0];
          const videoTrack = preAcquiredStream.getVideoTracks()[0];
          if (audioTrack) callOptions.audioSource = audioTrack;
          if (videoTrack) callOptions.videoSource = videoTrack;
        }

        const co = DailyIframe.createCallObject(callOptions);
        callRef.current = co;

        co.on('joined-meeting', () => {
          clearJoinWatchdog();
          setIsJoined(true);
          setIsJoining(false);
          setIsCameraInterrupted(false);
          refreshParticipants(co);
          setDailyAttachKey((k) => k + 1);
        });
        co.on('participant-joined', () => refreshParticipants(co));
        co.on('participant-updated', () => refreshParticipants(co));
        co.on('participant-left', () => refreshParticipants(co));
        co.on('track-started', (evt: any) => {
          refreshParticipants(co);
          if (evt.participant?.local) setIsCameraInterrupted(false);
        });
        co.on('track-stopped', (evt: any) => {
          refreshParticipants(co);
          if (evt.participant?.local && evt.track && !intentionalActionRef.current) {
            const isScreen = evt.track.label?.toLowerCase().includes('screen') || evt.participant.screen;
            if (!isScreen) setIsCameraInterrupted(true);
          }
        });
        co.on('left-meeting', () => {
          setIsJoined(false);
          setLocalParticipant(null);
          setRemoteParticipants([]);
          setActiveSpeakerPeerId(null);
          setIsCameraInterrupted(false);
          setDailyAttachKey(0);
        });
        co.on('error', (e: any) => {
          clearJoinWatchdog();
          setError(e?.errorMsg || 'Erreur de connexion');
          setIsJoining(false);
        });
        co.on('load-attempt-failed', (e: any) => {
          clearJoinWatchdog();
          setError(e?.errorMsg || 'Impossible de charger la salle Daily.');
          setIsJoining(false);
        });
        co.on('camera-error', (e: any) => {
          console.warn('Daily camera-error', e?.errorMsg);
          setIsCameraInterrupted(true);
        });

        let token: string | undefined;
        const accessTok = accessMeetingTokenRef.current;
        if (typeof accessTok === 'string' && accessTok.length > 0) {
          token = accessTok;
        } else if (accessTok === null && viewerModeRef.current && beefIdRef.current) {
          clearJoinWatchdog();
          setError('Accès vidéo refusé : jeton de réunion manquant.');
          setIsJoining(false);
          return;
        } else if (beefIdRef.current) {
          token = await fetchMeetingToken();
        }

        joinWatchdogRef.current = window.setTimeout(() => {
          joinWatchdogRef.current = null;
          if (callRef.current?.meetingState() !== 'joined-meeting') {
            setError('Connexion trop lente ou bloquée. Vérifie ton réseau ou tes permissions.');
            setIsJoining(false);
          }
        }, 50_000);

        await co.join({
          url: roomUrl,
          ...(token ? { token } : {}),
          userName,
          ...(userData ? { userData } : {}),
          startVideoOff: viewerMode,
          startAudioOff: viewerMode,
        });
      } catch (err: any) {
        clearJoinWatchdog();
        setError(err.message || 'Impossible de rejoindre');
        setIsJoining(false);
      }
    },
    [roomUrl, userName, isJoining, isJoined, refreshParticipants, viewerMode, arenaUserId, fetchMeetingToken, clearJoinWatchdog],
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
    try {
      const local = Object.values(co.participants()).find((p: any) => p.local);
      if (local) {
        (local as any).tracks?.video?.persistentTrack?.stop();
        (local as any).tracks?.audio?.persistentTrack?.stop();
      }
    } catch (_) {}
    try {
      await co.destroy();
    } catch (_) {}
    setIsJoined(false);
    setLocalParticipant(null);
    setRemoteParticipants([]);
    setActiveSpeakerPeerId(null);
    setIsCameraInterrupted(false);
    setDailyAttachKey(0);
  }, []);

  const stopCamera = useCallback(() => {
    if (!callRef.current) return;
    try {
      const local = Object.values(callRef.current.participants()).find((p: any) => p.local);
      if (local) {
        (local as any).tracks?.video?.persistentTrack?.stop();
        (local as any).tracks?.audio?.persistentTrack?.stop();
      }
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
    const run = () => {
      try {
        const co = callRef.current;
        if (!co) return;
        const id = resolveDailySessionId(co, sessionId);
        if (!id) return;
        co.updateParticipant(id, { setAudio: enabled });
      } catch {
        /* ignore */
      }
    };
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => requestAnimationFrame(run));
    } else {
      run();
    }
  }, []);

  const ejectRemoteParticipant = useCallback(async (sessionId: string): Promise<boolean> => {
    if (!callRef.current || viewerModeRef.current) return false;
    try {
      const co = callRef.current;
      const id = resolveDailySessionId(co, sessionId);
      if (!id) return false;
      const out = co.updateParticipant(id, { eject: true }) as unknown;
      if (out != null && typeof (out as Promise<unknown>).then === 'function') {
        await (out as Promise<unknown>);
      }
      return true;
    } catch {
      return false;
    }
  }, []);

  const recoverMediaDevices = useCallback(async () => {
    if (!callRef.current) return;
    try {
      intentionalActionRef.current = true;
      setIsCameraInterrupted(false);
      if (!viewerModeRef.current) {
        await callRef.current.setLocalVideo(false);
        await callRef.current.setLocalAudio(false);
        await callRef.current.setLocalVideo(true);
        await callRef.current.setLocalAudio(true);
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
    const onVis = () => {
      if (document.visibilityState === 'visible' && isJoined && !viewerModeRef.current) {
        void recoverMediaDevices();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [isJoined, recoverMediaDevices]);

  useEffect(() => {
    if (!isJoined) return;
    const handleOffline = () => {
      reconnectingRef.current = true;
    };
    const handleOnline = async () => {
      if (!reconnectingRef.current || !callRef.current) return;
      try {
        const co = callRef.current;
        if (co.meetingState() === 'joined-meeting') {
          reconnectingRef.current = false;
          return;
        }
        try {
          await co.destroy();
        } catch (_) {}
        callRef.current = null;

        const newCo = DailyIframe.createCallObject({
          subscribeToTracksAutomatically: true,
        });
        callRef.current = newCo;

        newCo.on('joined-meeting', () => {
          setIsJoined(true);
          setIsJoining(false);
          setIsCameraInterrupted(false);
          reconnectingRef.current = false;
          refreshParticipants(newCo);
          setDailyAttachKey((k) => k + 1);
        });
        newCo.on('participant-joined', () => refreshParticipants(newCo));
        newCo.on('participant-updated', () => refreshParticipants(newCo));
        newCo.on('participant-left', () => refreshParticipants(newCo));

        if (roomUrlRef.current && beefIdRef.current) {
          const accessTok = accessMeetingTokenRef.current;
          if (accessTok === null && viewerModeRef.current) {
            reconnectingRef.current = false;
            return;
          }
          let token: string | undefined;
          if (typeof accessTok === 'string' && accessTok.length > 0) token = accessTok;
          else token = await fetchMeetingToken();

          const userData = buildDailyJoinUserData(arenaUserIdRef.current);
          await newCo.join({
            url: roomUrlRef.current,
            ...(token ? { token } : {}),
            userName: userNameRef.current,
            ...(userData ? { userData } : {}),
            startVideoOff: viewerModeRef.current,
            startAudioOff: viewerModeRef.current,
          });
        }
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
  }, [isJoined, refreshParticipants, fetchMeetingToken]);

  useEffect(() => {
    if (!dailyAttachKey) return;
    const co = callRef.current;
    if (!co) return;
    const handler = (event: { activeSpeaker?: { peerId?: string } }) => {
      const next = event?.activeSpeaker?.peerId ?? null;
      setActiveSpeakerPeerId((prev) => (prev === next ? prev : next));
    };
    co.on('active-speaker-change', handler);
    return () => {
      try {
        co.off('active-speaker-change', handler);
      } catch {
        /* ignore */
      }
    };
  }, [dailyAttachKey]);

  // NETTOYAGE PURIFIÉ : Ne détruit plus tout le DOM aveuglément
  useEffect(() => {
    return () => {
      if (callRef.current) {
        const co = callRef.current;
        callRef.current = null;
        try {
          co.setLocalVideo(false);
        } catch (_) {}
        try {
          co.setLocalAudio(false);
        } catch (_) {}
        try {
          const local = Object.values(co.participants()).find((p: any) => p.local);
          if (local) {
            (local as any).tracks?.video?.persistentTrack?.stop();
            (local as any).tracks?.audio?.persistentTrack?.stop();
          }
        } catch (_) {}
        co.leave().catch(() => {});
        co.destroy().catch(() => {});
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
