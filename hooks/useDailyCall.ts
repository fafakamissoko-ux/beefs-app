'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import DailyIframe, { DailyCall, DailyParticipant } from '@daily-co/daily-js';
import { supabase } from '@/lib/supabase/client';
import { buildDailyJoinUserData, extractArenaUserIdFromDailyParticipant } from '@/lib/participant-identity';

export interface CallParticipant {
  sessionId: string;
  userName: string;
  /** UUID arena (session Supabase), extrait de userData Daily si valide. */
  arenaUserId: string | null;
  isLocal: boolean;
  videoTrack: MediaStreamTrack | null;
  audioTrack: MediaStreamTrack | null;
  videoOn: boolean;
  audioOn: boolean;
}

interface UseDailyCallReturn {
  join: (preAcquiredStream?: MediaStream | null) => Promise<void>;
  leave: () => Promise<void>;
  stopCamera: () => void;
  toggleMic: () => void;
  toggleCam: () => void;
  /** Force le micro local (hors mode viewer) — ex. tours de parole imposés par le médiateur */
  setLocalAudioEnabled: (enabled: boolean) => void;
  /** Médiateur / owner Daily : coupe ou réactive le micro d’un participant distant. */
  setRemoteParticipantAudio: (sessionId: string, enabled: boolean) => void;
  /** Expulsion de la salle (owner token). */
  ejectRemoteParticipant: (sessionId: string) => void;
  isJoined: boolean;
  isJoining: boolean;
  micEnabled: boolean;
  camEnabled: boolean;
  localParticipant: CallParticipant | null;
  remoteParticipants: CallParticipant[];
  /** `session_id` Daily du participant actuellement détecté comme parlant (active-speaker-change). */
  activeSpeakerPeerId: string | null;
  error: string | null;
}

/** Clé utilisée par `participants()` — alignée sur `session_id` pour `updateParticipant`. */
function resolveDailySessionId(co: DailyCall, hint: string): string | null {
  try {
    const parts = co.participants();
    if (parts[hint]) return hint;
    for (const [key, p] of Object.entries(parts)) {
      const dp = p as DailyParticipant;
      if (key === hint || dp.session_id === hint) return key;
    }
  } catch {
    /* ignore */
  }
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
    // Show video element as soon as track exists (even in 'loading' state)
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
): UseDailyCallReturn {
  const callRef = useRef<DailyCall | null>(null);
  const [isJoined, setIsJoined] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [micEnabled, setMicEnabled] = useState(!viewerMode);
  const [camEnabled, setCamEnabled] = useState(!viewerMode);
  const [localParticipant, setLocalParticipant] = useState<CallParticipant | null>(null);
  const [remoteParticipants, setRemoteParticipants] = useState<CallParticipant[]>([]);
  const [activeSpeakerPeerId, setActiveSpeakerPeerId] = useState<string | null>(null);
  /** Incrémenté à chaque `joined-meeting` pour rattacher les listeners au bon `DailyCall`. */
  const [dailyAttachKey, setDailyAttachKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const reconnectingRef = useRef(false);
  const joinWatchdogRef = useRef<number | null>(null);
  const roomUrlRef = useRef(roomUrl);
  const userNameRef = useRef(userName);
  const arenaUserIdRef = useRef(arenaUserId);
  const beefIdRef = useRef(beefId);
  const viewerModeRef = useRef(viewerMode);
  roomUrlRef.current = roomUrl;
  userNameRef.current = userName;
  arenaUserIdRef.current = arenaUserId;
  beefIdRef.current = beefId;
  viewerModeRef.current = viewerMode;

  const fetchMeetingToken = useCallback(async (): Promise<string> => {
    const bid = beefIdRef.current;
    if (!bid) {
      throw new Error('Identifiant beef manquant pour le token Daily');
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error('Session requise pour rejoindre la visio');
    }
    const res = await fetch('/api/daily/meeting-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ beefId: bid }),
    });
    const data: { error?: string; token?: string } = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Impossible d’obtenir le token Daily');
    }
    if (!data.token) {
      throw new Error('Token Daily manquant');
    }
    return data.token;
  }, []);

  const refreshParticipants = useCallback((co: DailyCall) => {
    const all = Object.values(co.participants());
    const local = all.find(p => p.local);
    const remotes = all.filter(p => !p.local);
    setLocalParticipant(local ? toCallParticipant(local) : null);
    setRemoteParticipants(remotes.map(toCallParticipant));
  }, []);

  const clearJoinWatchdog = useCallback(() => {
    if (joinWatchdogRef.current != null) {
      window.clearTimeout(joinWatchdogRef.current);
      joinWatchdogRef.current = null;
    }
  }, []);

  const join = useCallback(async (preAcquiredStream?: MediaStream | null) => {
    if (!roomUrl || isJoining || isJoined) return;
    setIsJoining(true);
    setError(null);
    clearJoinWatchdog();

    try {
      // Destroy our own previous instance if any (safe approach)
      if (callRef.current) {
        try {
          await callRef.current.leave();
          await callRef.current.destroy();
        } catch (_) {}
        callRef.current = null;
      }

      /** Flux déjà obtenu sur l’écran pré-joint : même geste utilisateur → évite le blocage iOS/Safari/Brave après await fetchMeetingToken(). */
      let videoSource: boolean | MediaStreamTrack = !viewerMode;
      let audioSource: boolean | MediaStreamTrack = !viewerMode;
      if (!viewerMode && preAcquiredStream) {
        const vt = preAcquiredStream.getVideoTracks()[0];
        const at = preAcquiredStream.getAudioTracks()[0];
        if (vt) videoSource = vt;
        else videoSource = false;
        if (at) audioSource = at;
        else audioSource = false;
      }

      const co = DailyIframe.createCallObject({
        audioSource,
        videoSource,
      });
      callRef.current = co;

      co.on('joined-meeting', () => {
        clearJoinWatchdog();
        console.log('✅ Daily.co joined-meeting');
        setIsJoined(true);
        setIsJoining(false);
        refreshParticipants(co);
        setDailyAttachKey((k) => k + 1);
      });
      co.on('participant-joined', () => refreshParticipants(co));
      co.on('participant-updated', () => refreshParticipants(co));
      co.on('participant-left', () => refreshParticipants(co));
      // Fired when a track becomes active — crucial to detect when camera is ready
      co.on('track-started', (e: any) => {
        console.log('🎥 Daily.co track-started:', e?.track?.kind);
        refreshParticipants(co);
      });
      co.on('track-stopped', () => refreshParticipants(co));
      co.on('left-meeting', () => {
        setIsJoined(false);
        setLocalParticipant(null);
        setRemoteParticipants([]);
        setActiveSpeakerPeerId(null);
        setDailyAttachKey(0);
      });
      co.on('error', (e: any) => {
        clearJoinWatchdog();
        console.error('❌ Daily.co error:', e);
        setError(e?.errorMsg || 'Erreur de connexion');
        setIsJoining(false);
      });
      co.on('load-attempt-failed', (e: any) => {
        clearJoinWatchdog();
        console.error('❌ Daily load-attempt-failed:', e);
        setError(e?.errorMsg || 'Impossible de charger la salle Daily (token, réseau ou salle expirée).');
        setIsJoining(false);
      });
      co.on('camera-error', (e: any) => {
        clearJoinWatchdog();
        setError(`Caméra inaccessible: ${e?.errorMsg || 'vérifiez les permissions'}`);
        setIsJoining(false);
      });

      console.log('🔌 Daily.co joining room:', roomUrl, viewerMode ? '(viewer)' : '');
      const userData = buildDailyJoinUserData(arenaUserId);
      /** Salles privées Daily : le token est obligatoire (même logique que la reconnexion réseau). */
      let token: string | undefined;
      if (beefIdRef.current) {
        token = await fetchMeetingToken();
      }

      joinWatchdogRef.current = window.setTimeout(() => {
        joinWatchdogRef.current = null;
        const c = callRef.current;
        if (!c) return;
        try {
          const st = c.meetingState();
          if (st !== 'joined-meeting') {
            setError(
              'Connexion trop lente ou bloquée. Vérifie le réseau, autorise micro/caméra, ou désactive le bouclier Brave sur ce site.',
            );
            setIsJoining(false);
          }
        } catch {
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
  }, [roomUrl, userName, isJoining, isJoined, refreshParticipants, viewerMode, arenaUserId, fetchMeetingToken, clearJoinWatchdog]);

  const leave = useCallback(async () => {
    if (!callRef.current) return;
    const co = callRef.current;
    callRef.current = null;

    // ── STEP 1: Tell Daily.co to stop camera/mic first ──
    try { co.setLocalVideo(false); } catch (_) {}
    try { co.setLocalAudio(false); } catch (_) {}

    // ── STEP 2: Stop all <video>/<audio> srcObject tracks ──
    if (typeof document !== 'undefined') {
      document.querySelectorAll('video, audio').forEach((el) => {
        const media = el as HTMLVideoElement | HTMLAudioElement;
        if (media.srcObject) {
          try { (media.srcObject as MediaStream).getTracks().forEach(t => t.stop()); } catch (_) {}
          media.srcObject = null;
        }
      });
    }

    // ── STEP 3: Stop Daily.co persistent tracks ──
    try {
      const parts = co.participants();
      const local = Object.values(parts).find((p: any) => p.local);
      if (local) {
        (local as any).tracks?.video?.persistentTrack?.stop();
        (local as any).tracks?.audio?.persistentTrack?.stop();
      }
    } catch (_) {}

    // ── STEP 4: Destroy directly (skipping leave() avoids the leave handshake
    // which can briefly re-enable camera tracks via Daily.co internals) ──
    try { await co.destroy(); } catch (_) {}

    setIsJoined(false);
    setLocalParticipant(null);
    setRemoteParticipants([]);
    setActiveSpeakerPeerId(null);
    setDailyAttachKey(0);
  }, []);

  // Expose a stopCamera helper for external use
  const stopCamera = useCallback(() => {
    if (!callRef.current) return;
    try {
      const parts = callRef.current.participants();
      const local = Object.values(parts).find((p: any) => p.local);
      if (local) {
        (local as any).tracks?.video?.persistentTrack?.stop();
        (local as any).tracks?.audio?.persistentTrack?.stop();
      }
    } catch (_) {}
  }, []);

  const toggleMic = useCallback(() => {
    if (!callRef.current || viewerMode) return;
    const next = !micEnabled;
    callRef.current.setLocalAudio(next);
    setMicEnabled(next);
  }, [micEnabled, viewerMode]);

  const toggleCam = useCallback(() => {
    if (!callRef.current || viewerMode) return;
    const next = !camEnabled;
    callRef.current.setLocalVideo(next);
    setCamEnabled(next);
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
        if (!id) {
          console.warn('[Daily] setRemoteParticipantAudio: session introuvable', sessionId);
          return;
        }
        co.updateParticipant(id, { setAudio: enabled });
      } catch (e) {
        console.warn('[Daily] setRemoteParticipantAudio', e);
      }
    };
    // Double rAF : meilleure prise en charge après gestes tactiles (iOS / WebView).
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => {
        requestAnimationFrame(run);
      });
    } else {
      run();
    }
  }, []);

  const ejectRemoteParticipant = useCallback((sessionId: string) => {
    if (!callRef.current || viewerModeRef.current) return;
    try {
      const co = callRef.current;
      const id = resolveDailySessionId(co, sessionId);
      if (!id) {
        console.warn('[Daily] ejectRemoteParticipant: session introuvable', sessionId);
        return;
      }
      co.updateParticipant(id, { eject: true });
    } catch (e) {
      console.warn('[Daily] ejectRemoteParticipant', e);
    }
  }, []);

  // ── AUTO-RECONNECT on network loss ──
  useEffect(() => {
    if (!isJoined) return;

    const handleOffline = () => {
      console.log('📡 Network lost — will auto-reconnect when online');
      reconnectingRef.current = true;
    };

    const handleOnline = async () => {
      if (!reconnectingRef.current || !callRef.current) return;
      console.log('📡 Network back — attempting auto-reconnect');

      try {
        const co = callRef.current;
        const state = co.meetingState();

        if (state === 'joined-meeting') {
          reconnectingRef.current = false;
          return;
        }

        // Destroy old instance and rejoin
        try { await co.destroy(); } catch (_) {}
        callRef.current = null;

        const newCo = DailyIframe.createCallObject({
          audioSource: !viewerMode,
          videoSource: !viewerMode,
        });
        callRef.current = newCo;

        newCo.on('joined-meeting', () => {
          setIsJoined(true);
          setIsJoining(false);
          reconnectingRef.current = false;
          refreshParticipants(newCo);
          setDailyAttachKey((k) => k + 1);
        });
        newCo.on('participant-joined', () => refreshParticipants(newCo));
        newCo.on('participant-updated', () => refreshParticipants(newCo));
        newCo.on('participant-left', () => refreshParticipants(newCo));
        newCo.on('track-started', () => refreshParticipants(newCo));
        newCo.on('track-stopped', () => refreshParticipants(newCo));
        newCo.on('left-meeting', () => {
          setIsJoined(false);
          setLocalParticipant(null);
          setRemoteParticipants([]);
          setActiveSpeakerPeerId(null);
          setDailyAttachKey(0);
        });
        newCo.on('error', (e: any) => {
          setError(e?.errorMsg || 'Erreur de reconnexion');
          reconnectingRef.current = false;
        });

        if (roomUrlRef.current && beefIdRef.current) {
          const token = await fetchMeetingToken();
          const userData = buildDailyJoinUserData(arenaUserIdRef.current);
          await newCo.join({
            url: roomUrlRef.current,
            token,
            userName: userNameRef.current,
            ...(userData ? { userData } : {}),
            startVideoOff: viewerModeRef.current,
            startAudioOff: viewerModeRef.current,
          });
        }
      } catch (err) {
        console.error('Auto-reconnect failed:', err);
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

  /** Daily.co — qui parle maintenant (pour halos UI). Un seul listener par instance, retiré au cleanup. */
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
        /* call déjà détruit */
      }
    };
  }, [dailyAttachKey]);

  // Cleanup on unmount — same order: media elements first, then Daily.co
  useEffect(() => {
    return () => {
      // Stop all video/audio elements immediately
      if (typeof document !== 'undefined') {
        document.querySelectorAll('video, audio').forEach((el) => {
          const media = el as HTMLVideoElement | HTMLAudioElement;
          if (media.srcObject) {
            try { (media.srcObject as MediaStream).getTracks().forEach(t => t.stop()); } catch (_) {}
            media.srcObject = null;
          }
        });
      }
      if (callRef.current) {
        const co = callRef.current;
        callRef.current = null;
        try {
          const parts = co.participants();
          const local = Object.values(parts).find((p: any) => p.local);
          if (local) {
            (local as any).tracks?.video?.persistentTrack?.stop();
            (local as any).tracks?.audio?.persistentTrack?.stop();
          }
        } catch (_) {}
        try { co.setLocalVideo(false); } catch (_) {}
        try { co.setLocalAudio(false); } catch (_) {}
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
  };
}
