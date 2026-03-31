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
  join: () => Promise<void>;
  leave: () => Promise<void>;
  stopCamera: () => void;
  toggleMic: () => void;
  toggleCam: () => void;
  isJoined: boolean;
  isJoining: boolean;
  micEnabled: boolean;
  camEnabled: boolean;
  localParticipant: CallParticipant | null;
  remoteParticipants: CallParticipant[];
  error: string | null;
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
  const [error, setError] = useState<string | null>(null);
  const reconnectingRef = useRef(false);
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

  const join = useCallback(async () => {
    if (!roomUrl || isJoining || isJoined) return;
    setIsJoining(true);
    setError(null);

    try {
      // Destroy our own previous instance if any (safe approach)
      if (callRef.current) {
        try {
          await callRef.current.leave();
          await callRef.current.destroy();
        } catch (_) {}
        callRef.current = null;
      }

      const co = DailyIframe.createCallObject({
        audioSource: !viewerMode,
        videoSource: !viewerMode,
      });
      callRef.current = co;

      co.on('joined-meeting', () => {
        console.log('✅ Daily.co joined-meeting');
        setIsJoined(true);
        setIsJoining(false);
        refreshParticipants(co);
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
      });
      co.on('error', (e: any) => {
        console.error('❌ Daily.co error:', e);
        setError(e?.errorMsg || 'Erreur de connexion');
        setIsJoining(false);
      });
      co.on('camera-error', (e: any) => {
        setError(`Caméra inaccessible: ${e?.errorMsg || 'vérifiez les permissions'}`);
      });

      console.log('🔌 Daily.co joining room:', roomUrl, viewerMode ? '(viewer)' : '');
      const userData = buildDailyJoinUserData(arenaUserId);
      await co.join({
        url: roomUrl,
        userName,
        ...(userData ? { userData } : {}),
        startVideoOff: viewerMode,
        startAudioOff: viewerMode,
      });
    } catch (err: any) {
      setError(err.message || 'Impossible de rejoindre');
      setIsJoining(false);
    }
  }, [roomUrl, userName, isJoining, isJoined, refreshParticipants, viewerMode, arenaUserId, fetchMeetingToken]);

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

  return { join, leave, stopCamera, toggleMic, toggleCam, isJoined, isJoining, micEnabled, camEnabled, localParticipant, remoteParticipants, error };
}
