# Rapport d'audit — Phase G.0

- **Date :** 2026-07-21
- **Commit ref :** `ef123dc`
- **Contrainte :** zéro modification du dépôt — lecture seule

---

## Synthèse

Deux anomalies majeures identifiées dans le flux spectateur / participation arène :

1. **Écran noir spectateur (WebRTC / tokens)** — Le jeton Daily est émis avec le rôle `spectator` (`start_video_off` / `start_audio_off`), mais `useDailyCall` force `viewerMode: false` vers `useDailyMeetingEngine`. Le moteur WebRTC crée alors un `CallObject` avec `audioSource` / `videoSource` actifs au lieu de `subscribeToTracksAutomatically: true`, ce qui peut empêcher la souscription correcte aux flux distants pour un spectateur.

2. **Contournement validation Ref via raise-hand** — `POST /api/beef/raise-hand` effectue un `upsert` direct en `beef_participants` avec `invite_status: 'pending'` sans créer de ligne `beef_invitations` ni vérifier qu'une invitation Ref préalable existe. Tout spectateur authentifié sur un beef `live` peut ainsi déclencher le flux d'invitation côté UI (`refInviteAlert`) sans passer par la validation du médiateur.

---

## Note importante

**`app/api/beef/join/route.ts` N'EXISTE PAS** dans le dépôt.

Le point d'entrée principal pour l'émission du jeton Daily est :

- `app/api/beef/access/route.ts` (GET — rôle `mediator` | `participant` | `spectator`)

---

## Cartographie fichiers

| Fichier | Rôle |
|---------|------|
| `app/api/beef/access/route.ts` | Émission jeton Daily selon rôle (médiateur, participant accepté, spectateur) |
| `app/api/beef/raise-hand/route.ts` | Upsert `beef_participants.pending` sans validation Ref |
| `hooks/useDailyCall.ts` | Façade arène — **force `viewerMode: false`** (L77) |
| `hooks/useDailyMeetingEngine.ts` | Moteur WebRTC Daily — branche `subscribeToTracksAutomatically` si `viewerMode=true` |
| `components/TikTokStyleArena.tsx` | UI arène — auto-join, raise-hand, callbacks realtime, acceptation invite Ref |

---

## Chaîne spectateur : access token → useDailyCall → useDailyMeetingEngine

```
GET /api/beef/access?beefId=…
  └─ role: 'spectator' → dailyToken (start_video_off, start_audio_off)
       └─ useDailyCall(roomUrl, userName, viewerMode?, …)
            └─ useDailyMeetingEngine({ viewerMode: false })  ← FORCÉ L77
                 └─ DailyIframe.createCallObject(
                      viewerMode ? { subscribeToTracksAutomatically: true }
                                 : { audioSource, videoSource }  ← branche spectateur jamais prise
                    )
```

**Anomalie :** même avec un token `spectator`, le moteur emprunte la branche « participant » (`viewerMode=false`), ce qui peut provoquer un écran noir faute de souscription automatique aux tracks distants.

---

## Faille raise-hand : upsert pending sans validation Ref + pas de beef_invitations

```
Spectateur clique « Lever la main »
  └─ handleRaiseHand → POST /api/beef/raise-hand
       └─ upsert beef_participants { invite_status: 'pending' }  ← sans beef_invitations
            └─ useEffect L321-333 détecte pending → setRefInviteAlert(true)
                 └─ Modal « Le Ref te convoque » → accept → reload
```

**Écart vs flux Ref légitime :** une invitation Ref devrait passer par `beef_invitations` et être validée par le médiateur avant que le spectateur ne voie la modale de convocation.

---

## Source complète — `hooks/useDailyMeetingEngine.ts`

```typescript
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

export type WebRtcNetworkQuality = 'good' | 'low' | 'very-low' | 'offline';

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
  networkQuality: WebRtcNetworkQuality;
  flipCamera: () => Promise<void>;
}

/**
 * Moteur WebRTC Daily « idiote » : uniquement `co.join({ url, token, … })`.
 * Aucun appel HTTP vers les APIs backend de l'app.
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
  const [networkQuality, setNetworkQuality] = useState<WebRtcNetworkQuality>('good');

  const micEnabledRef = useRef(micEnabled);
  const camEnabledRef = useRef(camEnabled);
  useEffect(() => { micEnabledRef.current = micEnabled; }, [micEnabled]);
  useEffect(() => { camEnabledRef.current = camEnabled; }, [camEnabled]);

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
        setNetworkQuality('good');
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
      co.on('network-quality-change', (event: unknown) => {
        const ev = event as { threshold?: WebRtcNetworkQuality };
        if (ev && ev.threshold) {
          setNetworkQuality(ev.threshold);
        }
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
        setError('Jeton Daily manquant — repasse par la page d'entrée (Phase 1).');
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
        const wasMicOn = micEnabledRef.current;
        const wasCamOn = camEnabledRef.current;
        await co.setLocalVideo(false);
        await co.setLocalAudio(false);
        if (wasCamOn) await co.setLocalVideo(true);
        if (wasMicOn) await co.setLocalAudio(true);
      }
      setTimeout(() => {
        intentionalActionRef.current = false;
      }, 1500);
    } catch {
      setIsCameraInterrupted(true);
      intentionalActionRef.current = false;
    }
  }, []);

  const flipCamera = useCallback(async () => {
    const co = callRef.current;
    if (!co || viewerModeRef.current) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === 'videoinput');

      if (videoDevices.length <= 2) {
        await co.cycleCamera();
        return;
      }
      // Contournement Tier-1 iOS/Android (Évite les objectifs Macro/Telephoto)
      const currentInput = await co.getInputDevices();
      const camera = currentInput?.camera;
      const currentDeviceId =
        camera && 'deviceId' in camera ? camera.deviceId : undefined;

      const frontDevices = videoDevices.filter(
        (d) => d.label.toLowerCase().includes('front') || d.label.toLowerCase().includes('avant'),
      );
      const backDevices = videoDevices.filter(
        (d) => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('arrière'),
      );

      let targetDeviceId: string | null = null;
      if (frontDevices.some((d) => d.deviceId === currentDeviceId) && backDevices.length > 0) {
        targetDeviceId = backDevices[0].deviceId;
      } else if (backDevices.some((d) => d.deviceId === currentDeviceId) && frontDevices.length > 0) {
        targetDeviceId = frontDevices[0].deviceId;
      } else {
        const currentIndex = videoDevices.findIndex((d) => d.deviceId === currentDeviceId);
        targetDeviceId =
          currentIndex === 0 ? videoDevices[videoDevices.length - 1].deviceId : videoDevices[0].deviceId;
      }

      if (targetDeviceId && targetDeviceId !== currentDeviceId) {
        await co.setInputDevicesAsync({ videoDeviceId: targetDeviceId });
      } else {
        await co.cycleCamera();
      }
    } catch (err) {
      console.warn('[WebRTC] Erreur Camera Flip:', err);
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
    networkQuality,
    flipCamera,
  };
}
```

---

## Source complète — `app/api/beef/access/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { User } from '@supabase/supabase-js';
import { normalizeBeefId } from '@/lib/beef-id';
import { userIdsEqual, canonicalUserUuid } from '@/lib/user-id-equal';
import { beefDailyRoomName } from '@/lib/beef-daily-room';
import { ensureDailyRoomExistsForBeef, getDailyRoomUrlByName } from '@/lib/server/daily-rooms';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const AUTH_MEETING_TOKEN_TTL_SEC = 2 * 60 * 60;

/** Statuts où un spectateur peut recevoir un billet (écoute) une fois la room existante. */
function beefStatusAllowsSpectatorTicket(status: string): boolean {
  return status === 'pending' || status === 'live' || status === 'scheduled' || status === 'ready';
}

async function getAuthUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.length < 15) return null;

  try {
    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const {
      data: { user },
      error,
    } = await supabaseAuth.auth.getUser();
    if (error || !user) return null;
    return user;
  } catch {
    return null;
  }
}

function beefIdFromSearchParams(searchParams: URLSearchParams): string | null {
  for (const key of ['beefId', 'beef_id', 'beefid']) {
    const v = searchParams.get(key);
    if (v?.trim()) return v.trim();
  }
  return null;
}

type DailyTokenRole = 'mediator' | 'participant' | 'spectator';

type UsersNameFields = { display_name: string | null; username: string | null };

/**
 * POST https://api.daily.co/v1/meeting-tokens — exp = maintenant + tokenTtlSec secondes.
 */
async function createDailyMeetingToken(params: {
  apiKey: string;
  roomName: string;
  user: User;
  userName: string;
  role: DailyTokenRole;
  tokenTtlSec: number;
}): Promise<string | null> {
  const { apiKey, roomName, user, userName, role, tokenTtlSec } = params;
  const uidRaw = user.id.trim().toLowerCase();
  if (uidRaw.length < 1 || uidRaw.length > 64) return null;

  const exp = Math.floor(Date.now() / 1000) + tokenTtlSec;

  const properties: Record<string, unknown> = {
    room_name: roomName,
    user_id: uidRaw,
    user_name: userName.slice(0, 120),
    exp,
    eject_at_token_exp: true,
  };

  if (role === 'mediator') {
    properties.is_owner = true;
  }
  if (role === 'spectator') {
    properties.start_video_off = true;
    properties.start_audio_off = true;
  }

  const res = await fetch('https://api.daily.co/v1/meeting-tokens', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ properties }),
  });

  const data = (await res.json()) as { token?: string; error?: string };
  if (!res.ok || typeof data.token !== 'string') {
    return null;
  }
  return data.token;
}

async function resolveDisplayName(supabase: typeof supabaseAdmin, user: User): Promise<string> {
  const profileUid = canonicalUserUuid(user.id) ?? user.id.trim();
  const { data } = await supabase
    .from('users')
    .select('display_name, username')
    .eq('id', profileUid)
    .maybeSingle();
  const profile = data as UsersNameFields | null;
  return (
    profile?.display_name?.trim() ||
    profile?.username?.trim() ||
    user.email?.split('@')[0] ||
    'Utilisateur'
  ).slice(0, 120);
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json(
        { ok: false, code: 'AUTH_REQUIRED', error: 'Authentification requise' },
        { status: 401 },
      );
    }

    const rawId = beefIdFromSearchParams(new URL(request.url).searchParams);
    const beefId = rawId ? normalizeBeefId(rawId) : null;
    if (!beefId) return NextResponse.json({ error: 'beefId invalide ou requis' }, { status: 400 });

    const { data: beef, error: beefErr } = await supabaseAdmin
      .from('beefs')
      .select('id, mediator_id, created_by, status')
      .eq('id', beefId)
      .single();

    if (beefErr || !beef) return NextResponse.json({ error: 'Beef introuvable' }, { status: 404 });

    if (beef.status === 'ended' || beef.status === 'cancelled' || beef.status === 'replay') {
      return NextResponse.json({ error: 'Beef non disponible', viewerAccess: 'not_live' as const }, { status: 403 });
    }

    const apiKey = process.env.DAILY_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Configuration Daily manquante' }, { status: 500 });
    }

    const roomName = beefDailyRoomName(beefId);

    let tokenRole: DailyTokenRole = 'spectator';
    let isCreator = false;

    const effectiveHostId = beef.mediator_id ?? beef.created_by ?? '';

    if (userIdsEqual(effectiveHostId, user.id)) {
      tokenRole = 'mediator';
      isCreator = true;
    } else {
      const uidForParticipant = canonicalUserUuid(user.id) ?? user.id.trim();
      const { data: part } = await supabaseAdmin
        .from('beef_participants')
        .select('id')
        .eq('beef_id', beefId)
        .eq('user_id', uidForParticipant)
        .eq('invite_status', 'accepted')
        .maybeSingle();
      if (part) {
        tokenRole = 'participant';
        isCreator = true;
      }
    }

    const userName = await resolveDisplayName(supabaseAdmin, user);

    /** ── Créateurs : création de salle obligatoire côté serveur, puis jeton. ── */
    if (isCreator) {
      const dailyRoomUrl = await ensureDailyRoomExistsForBeef(beefId);
      if (!dailyRoomUrl) {
        return NextResponse.json(
          { error: 'Impossible de préparer la salle vidéo', code: 'DAILY_ROOM_UNREACHABLE' },
          { status: 503 },
        );
      }
      const token = await createDailyMeetingToken({
        apiKey,
        roomName,
        user,
        userName,
        role: tokenRole,
        tokenTtlSec: AUTH_MEETING_TOKEN_TTL_SEC,
      });
      if (!token) {
        return NextResponse.json({ error: 'Émission du jeton impossible', code: 'TOKEN_FAILED' }, { status: 503 });
      }
      return NextResponse.json({
        ok: true,
        role: tokenRole,
        viewerAccess: 'full' as const,
        dailyRoomUrl,
        dailyToken: token,
      });
    }

    /** ── Spectateurs connectés : jamais de POST room — lookup GET uniquement. ── */
    if (!beefStatusAllowsSpectatorTicket(beef.status)) {
      return NextResponse.json({
        ok: false,
        role: 'spectator' as const,
        viewerAccess: 'not_live' as const,
        dailyRoomUrl: null,
        dailyToken: null,
        code: 'BEEF_NOT_WATCHABLE',
      });
    }

    const dailyRoomUrl = await getDailyRoomUrlByName(roomName, apiKey);
    if (!dailyRoomUrl) {
      return NextResponse.json({
        ok: false,
        role: 'spectator' as const,
        viewerAccess: 'not_live' as const,
        dailyRoomUrl: null,
        dailyToken: null,
        code: 'ROOM_NOT_FOUND',
      });
    }

    const token = await createDailyMeetingToken({
      apiKey,
      roomName,
      user,
      userName,
      role: 'spectator',
      tokenTtlSec: AUTH_MEETING_TOKEN_TTL_SEC,
    });

    if (!token) {
      return NextResponse.json(
        { ok: false, error: 'Émission du jeton spectateur impossible', code: 'TOKEN_FAILED', dailyRoomUrl, dailyToken: null },
        { status: 503 },
      );
    }

    return NextResponse.json({
      ok: true,
      role: 'spectator' as const,
      viewerAccess: 'full' as const,
      dailyRoomUrl,
      dailyToken: token,
    });
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
```

---

## Extraits — `components/TikTokStyleArena.tsx`

### 1. useEffect — vérification `invite_status` pending (L321–333)

```typescript
  // L321
  useEffect(() => {
    // L322
    if (isViewer && userId) {
      // L323
      void supabase
        // L324
        .from('beef_participants')
        // L325
        .select('invite_status')
        // L326
        .eq('beef_id', roomId)
        // L327
        .eq('user_id', userId)
        // L328
        .single()
        // L329
        .then(({ data }) => {
          // L330
          if (data?.invite_status === 'pending') setRefInviteAlert(true);
          // L331
        });
      // L332
    }
    // L333
  }, [isViewer, userId, roomId]);
```

### 2. `loadParticipants` callback — inclut détecteur d'expulsion (L787–855)

```typescript
  // L787
  const loadParticipants = useCallback(async () => {
    // L788
    const { data } = await supabase
      // L789
      .from('beef_participants')
      // L790
      .select('user_id, role, is_main, invite_status, created_at')
      // L791
      .eq('beef_id', roomId);

    // L793
    // --- DÉTECTEUR D'EXPULSION (LIMBO FIX) ---
    // L794
    if (!isViewer && !isHost && data) {
      // L795
      const amIStillHere = data.some((p: { user_id: string }) => p.user_id === userId);
      // L796
      if (!amIStillHere) {
        // L797
        toast('Vous avez été renvoyé dans les gradins par la régie.', 'error');
        // L798
        setTimeout(() => window.location.reload(), 1200);
        // L799
        return;
        // L800
      }
      // L801
    }
    // L802
    // -----------------------------------------

    // L804
    if (!data?.length) {
      // L805
      setParticipantRoles({});
      // L806
      setParticipantUidOrder([]);
      // L807
      return;
      // L808
    }

    // L810
    type ParticipantRow = {
      // L811
      user_id: string;
      // L812
      role: string;
      // L813
      is_main: boolean | null;
      // L814
      invite_status?: string | null;
      // L815
      created_at?: string | null;
      // L816
    };

    // L818
    // Seuls les "accepted" obtiennent un halo dans la grille géométrique
    // L819
    const validData = (data as ParticipantRow[]).filter(
      // L820
      (p) =>
        // L821
        p.role !== 'witness' &&
        // L822
        p.invite_status === 'accepted',
      // L823
    );

    // L825
    // Même ordre que le feed : accepted → is_main → created_at
    // L826
    const sorted = [...validData].sort((a, b) => {
      // L827
      const statusA = a.invite_status === 'accepted' ? 0 : 1;
      // L828
      const statusB = b.invite_status === 'accepted' ? 0 : 1;
      // L829
      if (statusA !== statusB) return statusA - statusB;
      // L830
      const mainA = a.is_main ? 0 : 1;
      // L831
      const mainB = b.is_main ? 0 : 1;
      // L832
      if (mainA !== mainB) return mainA - mainB;
      // L833
      return new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime();
      // L834
    });

    // L836
    const { fetchUserPublicByIds } = await import('@/lib/fetch-user-public-profile');
    // L837
    const ids = sorted.map((p) => p.user_id).filter(Boolean);
    // L838
    const pubMap = await fetchUserPublicByIds(supabase, ids, 'id, username, display_name, avatar_url');
    // L839
    const roles: Record<string, BeefParticipantRowMeta> = {};
    // L840
    sorted.forEach((p) => {
      // L841
      const u = pubMap.get(p.user_id);
      // L842
      const dn = (u?.display_name ?? '').trim();
      // L843
      const un = (u?.username ?? '').trim();
      // L844
      const name = dn || un || 'Participant';
      // L845
      roles[p.user_id] = {
        // L846
        role: p.role,
        // L847
        name,
        // L848
        matchAliases: buildParticipantAliasSet(u?.display_name, u?.username, name),
        // L849
        avatarUrl: u?.avatar_url?.trim() || null,
        // L850
        isMain: p.is_main ?? false,
        // L851
      };
      // L852
    });
    // L853
    setParticipantRoles(roles);
    // L854
    setParticipantUidOrder(sorted.map((p) => p.user_id));
    // L855
  }, [roomId, userId, isViewer, isHost, toast]);
```

### 3. useEffect appelant `loadParticipants` (L857–859)

```typescript
  // L857
  useEffect(() => {
    // L858
    void loadParticipants();
    // L859
  }, [loadParticipants]);
```

### 4. useEffect auto-join (L1532–1536)

```typescript
  // L1532
  useEffect(() => {
    // L1533
    if (!hasJoined || !effectiveDailyRoomUrl || !meetingTokenForDaily || isJoined || isJoining || joinAttemptedRef.current) return;
    // L1534
    joinAttemptedRef.current = true;
    // L1535
    void join(preJoinMediaStream, { camEnabled: preJoinCamEnabled });
    // L1536
  }, [hasJoined, effectiveDailyRoomUrl, meetingTokenForDaily, isJoined, isJoining, join, preJoinMediaStream, preJoinCamEnabled]);
```

### 5. `handleRaiseHand` (L1538–1560)

```typescript
  // L1538
  const handleRaiseHand = useCallback(async () => {
    // L1539
    if (!userId || !roomId) return;
    // L1540
    try {
      // L1541
      const {
        // L1542
        data: { session },
        // L1543
      } = await supabase.auth.getSession();
      // L1544
      const res = await fetch('/api/beef/raise-hand', {
        // L1545
        method: 'POST',
        // L1546
        headers: {
          // L1547
          'Content-Type': 'application/json',
          // L1548
          Authorization: `Bearer ${session?.access_token || ''}`,
          // L1549
        },
        // L1550
        body: JSON.stringify({ beefId: roomId }),
        // L1551
      });
      // L1552
      const data = (await res.json()) as { error?: string };
      // L1553
      if (!res.ok) throw new Error(data.error || 'Erreur');
      // L1554
      toast('Demande envoyée ! Le Ref va te répondre.', 'success');
      // L1555
    } catch (error) {
      // L1556
      console.error('Erreur lors de la demande');
      // L1557
      const msg = error instanceof Error ? error.message : 'Impossible d'envoyer la demande.';
      // L1558
      toast(msg, 'error');
      // L1559
    }
    // L1560
  }, [userId, roomId, toast]);
```

### 6. Callbacks realtime arène (L2922–2927)

```typescript
    // L2922
    onSpectatorSelfInviteAccepted: () => setAcceptedInviteAlert(true),
    // L2923
    onSpectatorReceivedRefInvite: () => setRefInviteAlert(true),
    // L2924
    onBeefParticipantsTableChanged: () => {
      // L2925
      if (isHost) void fetchPendingInvites();
      // L2926
      void loadParticipants();
      // L2927
    },
```

### 7. Handler acceptation invite Ref — reload (L4012–4032)

```typescript
                // L4012
                <button
                  // L4013
                  type="button"
                  // L4014
                  onClick={async () => {
                    // L4015
                    await supabase
                      // L4016
                      .from('beef_participants')
                      // L4017
                      .update({
                        // L4018
                        invite_status: 'accepted',
                        // L4019
                        responded_at: new Date().toISOString(),
                        // L4020
                      })
                      // L4021
                      .eq('beef_id', roomId)
                      // L4022
                      .eq('user_id', userId);
                    // L4023
                    await supabase
                      // L4024
                      .from('beef_invitations')
                      // L4025
                      .update({
                        // L4026
                        status: 'accepted',
                        // L4027
                        responded_at: new Date().toISOString(),
                        // L4028
                      })
                      // L4029
                      .eq('beef_id', roomId)
                      // L4030
                      .eq('invitee_id', userId);
                    // L4031
                    window.location.reload();
                    // L4032
                  }}
```

---

## Bonus — Source complète — `app/api/beef/raise-hand/route.ts` (contexte bypass raise-hand)

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { normalizeBeefId } from '@/lib/beef-id';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function getAuthUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return null;
  const supabaseAuth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  return user;
}

/**
 * Spectateur : demande à rejoindre le ring (beef_participants.pending).
 * Contournement RLS via service role — la policy INSERT client est réservée au médiateur.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const body = (await request.json()) as { beefId?: string };
    const beefId = body.beefId ? normalizeBeefId(body.beefId) : null;
    if (!beefId) {
      return NextResponse.json({ error: 'beefId invalide' }, { status: 400 });
    }

    const { data: beef, error: beefErr } = await supabaseAdmin
      .from('beefs')
      .select('id, mediator_id, status')
      .eq('id', beefId)
      .single();

    if (beefErr?.code === 'PGRST116' || !beef) {
      return NextResponse.json({ error: 'Beef introuvable' }, { status: 404 });
    }
    if (beef.status !== 'live') {
      return NextResponse.json({ error: 'Le beef n'est pas en direct' }, { status: 400 });
    }
    if (beef.mediator_id === user.id) {
      return NextResponse.json({ error: 'Le médiateur n'a pas besoin de lever la main' }, { status: 400 });
    }

    const { data: existing } = await supabaseAdmin
      .from('beef_participants')
      .select('invite_status')
      .eq('beef_id', beefId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing?.invite_status === 'accepted') {
      return NextResponse.json({ error: 'Tu participes déjà à ce beef' }, { status: 400 });
    }

    const { error: upsertErr } = await supabaseAdmin.from('beef_participants').upsert(
      {
        beef_id: beefId,
        user_id: user.id,
        role: 'participant',
        is_main: false,
        invite_status: 'pending',
      },
      { onConflict: 'beef_id,user_id' },
    );

    if (upsertErr) {
      console.error('[raise-hand] upsert', upsertErr);
      return NextResponse.json({ error: 'Impossible d'enregistrer la demande' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[raise-hand]', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
```

---

## Référence — `hooks/useDailyCall.ts` (viewerMode forcé)

```typescript
// L67-80 (extrait pertinent à la chaîne spectateur)
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
    viewerMode: false,
    arenaUserId,
    meetingToken: accessMeetingToken,
  });
```

---

*Aucune modification appliquée au code source du dépôt.*
