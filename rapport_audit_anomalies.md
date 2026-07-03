# Rapport d'audit source — Anomalies Phase D.1 (PiP, Unmute, Flip, Débordement)

**Date :** 31 mai 2026  
**Périmètre :** extraction intégrale, zéro modification du code source  
**Objectif :** préparer la Phase D.1 — correction des failles critiques d'ergonomie et matériel.

---

## Verdict Architecte — Anomalies ciblées

### D.1.1 — PiP Mobile bloqué (`SmartPiPManager`)

| Élément | Localisation | Risque identifié |
|---------|--------------|------------------|
| Conteneur fantôme | L28-30 | `z-[-9999]` — empilement négatif extrême, peut exclure la vidéo du compositeur visible |
| Opacité quasi-nulle | L29 | `opacity-[0.01]` — certains moteurs (iOS Safari, Chrome Android) exigent une vidéo « visible » pour `autoPictureInPicture` |
| Overflow | L29 | `overflow-hidden` sur `fixed inset-0` — clip potentiel de la surface vidéo |
| Vidéo muette | L34 | `muted={true}` — requis pour autoplay, mais la piste audio n'est pas attachée (OK pour PiP vidéo seule) |

**Chaîne auto-PiP (contexte, hors extraction demandée) :**
```
SmartPiPManager → ParticipantVideo(isSmartPiPUI) → usePiP(ref, true) → autoPictureInPicture = true
```

**Hypothèse D.1 :** remplacer les classes d'invisibilité agressives par une stratégie « off-screen but composited » (ex. `fixed w-px h-px opacity-0` sans `z-[-9999]`, ou `sr-only` vidéo 1×1) tout en gardant la vidéo dans le flux de rendu GPU.

---

### D.1.2 — Unmute forcé (`recoverMediaDevices`)

| Élément | Localisation | Risque identifié |
|---------|--------------|------------------|
| `recoverMediaDevices` | L364-385 | Force `setLocalAudio(true)` + `setMicEnabled(true)` sans respecter l'état utilisateur |
| Listener `visibilitychange` | L447-454 | Appelle `recoverMediaDevices()` à **chaque** retour `visible` — déclenche un unmute systématique |
| Séquence cam/mic | L371-374 | Toggle off/on vidéo **et** audio même si l'utilisateur avait coupé le micro volontairement |

**Hypothèse D.1 :** mémoriser l'intention utilisateur (`micEnabled` / `camEnabled` refs) avant recovery et restaurer l'état voulu au lieu de forcer `true`.

---

### D.1.3 — Camera Flip erratique (`flipCamera`)

| Élément | Localisation | Risque identifié |
|---------|--------------|------------------|
| `flipCamera` | L387-394 | Appelle uniquement `cycleCamera()` — ordre des devices non déterministe sur multi-cam |
| Pas de facingMode | — | Aucun basculement explicite `user` ↔ `environment` via `setInputDevicesAsync` |
| Conflit recovery | L447-454 | `recoverMediaDevices` sur visibility peut réinitialiser la caméra active pendant/après un flip |

**Hypothèse D.1 :** remplacer `cycleCamera()` par sélection explicite front/back via Daily `setInputDevicesAsync({ videoDeviceId })` ou contrainte `facingMode`.

---

### D.1.4 — UI qui déborde (Layout Nexus)

| Élément | Localisation | Risque identifié |
|---------|--------------|------------------|
| Contrôles locaux | ArenaVideoSurface L81-126 | 3 boutons `h-11 w-11` + gap → ~140px horizontal (Mic + Cam + Flip) |
| Grille 3 tuiles index 0/1 | nexusGridTemplates L37-43 | Chrome en `flex-col justify-between` dans `inset-2` — contrôles en bas, pseudo en haut |
| Grille 3 tuiles index 1 | L41-43 | `pt-12 sm:pt-14` pour éviter Live/Share — réduit l'espace vertical disponible |
| Grille 2 tuiles index 1 | L34-35 | `top-[3.5rem]` — décalage pour header, peut chevaucher sur petits viewports |
| Flip mobile only | ArenaVideoSurface L120 | `md:hidden` — 3e bouton visible uniquement mobile, amplifie le débordement |

**Propagation :** `useArenaLayoutTiles` injecte `uiPosClass: getNexusChromeUiPos(idx, tileCount)` → consommé par `ArenaVideoSurface` via `tile.uiPosClass` (L75).

---

## Fichiers extraits

| Fichier | Lignes | Rôle |
|---------|--------|------|
| `components/Arena/SmartPiPManager.tsx` | 40 | Cerveau PiP fantôme (C5) |
| `hooks/useDailyMeetingEngine.ts` | 486 | Moteur WebRTC Daily |
| `components/Arena/shared/ArenaVideoSurface.tsx` | 252 | Surface tuile + contrôles |
| `components/Arena/nexus/nexusGridTemplates.ts` | 56 | Grille Nexus + position chrome |

---

## `components/Arena/SmartPiPManager.tsx` (40 lignes)

```typescript
'use client';

import { ParticipantVideo } from '../ParticipantVideo';
import type { ArenaTileVM } from './types';

interface SmartPiPManagerProps {
  tiles: ArenaTileVM[];
  activeSpeakerPeerId: string | null;
}

export function SmartPiPManager({ tiles, activeSpeakerPeerId }: SmartPiPManagerProps) {
  // Priorité 1: L'orateur actif. Priorité 2: L'utilisateur local. Priorité 3: N'importe quelle tuile avec vidéo.
  let targetTile = activeSpeakerPeerId ? tiles.find((t) => t.panel?.sessionId === activeSpeakerPeerId) : null;

  if (!targetTile) {
    targetTile = tiles.find((t) => t.isLocal);
  }

  if (!targetTile) {
    targetTile = tiles.find((t) => t.hasActiveVideo);
  }

  if (!targetTile || !targetTile.panel?.videoTrack) return null;

  return (
    // Ce conteneur est invisible mais présent dans le DOM pour que le navigateur
    // puisse extraire la vidéo lors de la réduction de l'application.
    <div
      className="fixed inset-0 z-[-9999] opacity-[0.01] pointer-events-none overflow-hidden"
      aria-hidden="true"
    >
      <ParticipantVideo
        videoTrack={targetTile.panel.videoTrack}
        muted={true}
        isSmartPiPUI={true}
      />
    </div>
  );
}
```

---

## `hooks/useDailyMeetingEngine.ts` (486 lignes)

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

  const flipCamera = useCallback(async () => {
    if (!callRef.current || viewerModeRef.current) return;
    try {
      await callRef.current.cycleCamera();
    } catch (err) {
      console.warn('[WebRTC] Erreur lors du Camera Flip:', err);
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
    networkQuality,
    flipCamera,
  };
}
```

---

## `components/Arena/shared/ArenaVideoSurface.tsx` (252 lignes)

```tsx
'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';
import { Mic, Video, SwitchCamera } from 'lucide-react';
import { ParticipantVideo } from '@/components/ParticipantVideo';
import type { ArenaSupportSlotId, ChallengerSlotId } from '@/lib/arena-slots';
import type { ArenaTileVM } from '../types';

export type ArenaVideoSurfaceVariant = 'nexus' | 'constellation';

export interface ArenaVideoSurfaceProps {
  tile: ArenaTileVM;
  tileCount: number;
  tileIndex: number;
  variant: ArenaVideoSurfaceVariant;
  isSpeaking: boolean;
  isMutedByFocus: boolean;
  speakingTurnActive: boolean;
  effectiveHotMicSpeakerSlot: ChallengerSlotId | null;
  structuredDebateEnabled: boolean;
  micMutedByMediator: boolean;
  mediatorHoldingFloor: boolean;
  micEnabled: boolean;
  camEnabled: boolean;
  onTapSupport: (slot: ArenaSupportSlotId) => void;
  onPreferSide: (side: ArenaSupportSlotId) => void;
  onOpenProfile: (username: string, knownUserId?: string | null) => void | Promise<void>;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onToast: (message: string, type: 'error' | 'success' | 'info') => void;
  onFlipCamera?: () => void;
  webrtcNetworkQuality?: 'good' | 'low' | 'very-low' | 'offline';
  isActiveSpeaker?: boolean;
}

export function ArenaVideoSurface({
  tile,
  tileCount,
  tileIndex,
  variant,
  isSpeaking,
  isMutedByFocus,
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
  onFlipCamera,
  webrtcNetworkQuality,
  isActiveSpeaker,
}: ArenaVideoSurfaceProps) {
  const auraShadow =
    tile.aura > 0
      ? `0 0 ${20 + Math.min(tile.aura, 120) * 0.8}px rgba(${tile.colorRgb}, 0.4), inset 0 0 40px rgba(${tile.colorRgb}, 0.15)`
      : 'inset 0 0 20px rgba(255,255,255,0.02)';
  const filterVal = isMutedByFocus
    ? 'grayscale(0.6) blur(3px)'
    : `brightness(${1 + (tile.aura / 300) * 0.4})`;

  const roundedClass =
    variant === 'constellation' ? 'rounded-full overflow-visible' : 'rounded-[2rem]';

  const chromePointer =
    variant === 'nexus' && tileCount === 3 && tileIndex === 2 ? '' : 'pointer-events-auto';

  const nexusChromeClass = `absolute z-[140] flex gap-1.5 ${tile.uiPosClass} ${
    variant === 'nexus' && tileCount === 3 && (tileIndex === 0 || tileIndex === 1)
      ? 'pointer-events-none'
      : chromePointer
  }`;

  const localControls = tile.isLocal ? (
    <div
      className={`flex shrink-0 items-center gap-1.5 ${tileCount === 3 && tileIndex === 2 && variant === 'nexus' ? 'pointer-events-auto' : ''}`}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          const isLockedByTurn =
            structuredDebateEnabled &&
            speakingTurnActive &&
            effectiveHotMicSpeakerSlot !== tile.slot;
          if (micMutedByMediator || mediatorHoldingFloor || isLockedByTurn) {
            onToast('Micro verrouillé par le Ref ou les règles du débat.', 'error');
            return;
          }
          onToggleMic();
        }}
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border backdrop-blur-[60px] transition-all duration-300 active:scale-95 ${micEnabled && !micMutedByMediator ? 'border-white/20 bg-white/10 text-white hover:bg-white/20 shadow-[0_4px_16px_rgba(255,255,255,0.1),inset_0_1px_1px_rgba(255,255,255,0.4)]' : 'border-rose-500/50 bg-rose-950/40 text-rose-400 shadow-[0_0_15px_rgba(225,29,72,0.4),inset_0_1px_1px_rgba(255,255,255,0.1)]'}`}
      >
        <Mic className="h-4 w-4" strokeWidth={1.75} />
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleCam();
        }}
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border backdrop-blur-[60px] transition-all duration-300 active:scale-95 ${camEnabled ? 'border-white/20 bg-white/10 text-white hover:bg-white/20 shadow-[0_4px_16px_rgba(255,255,255,0.1),inset_0_1px_1px_rgba(255,255,255,0.4)]' : 'border-rose-500/50 bg-rose-950/40 text-rose-400 shadow-[0_0_15px_rgba(225,29,72,0.4),inset_0_1px_1px_rgba(255,255,255,0.1)]'}`}
      >
        <Video className="h-4 w-4" strokeWidth={1.75} />
      </button>
      {onFlipCamera && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onFlipCamera();
          }}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white backdrop-blur-[60px] transition-all hover:bg-white/20 active:scale-95 shadow-[0_4px_16px_rgba(255,255,255,0.1),inset_0_1px_1px_rgba(255,255,255,0.4)] md:hidden"
          title="Basculer la caméra"
        >
          <SwitchCamera className="h-4 w-4" strokeWidth={1.75} />
        </button>
      )}
    </div>
  ) : null;

  const pseudoBadge = (
    <div className="flex max-w-full flex-col items-center gap-1">
      <div className="flex max-w-full items-center gap-2 rounded-full border border-white/[0.08] bg-slate-900/40 px-3 py-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_1px_rgba(255,255,255,0.1)] backdrop-blur-[40px] sm:px-4 sm:py-2">
        {tile.isLocal && webrtcNetworkQuality && webrtcNetworkQuality !== 'good' && (
          <div className="shrink-0 flex items-center justify-center" title="Réseau instable">
            <div
              className={`h-1.5 w-1.5 rounded-full animate-pulse ${webrtcNetworkQuality === 'low' ? 'bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]'}`}
            />
          </div>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void onOpenProfile(tile.name, tile.arenaUserId);
          }}
          className="truncate max-w-[80px] sm:max-w-[130px] text-[10px] font-black tracking-wide text-white hover:text-cyan-400 drop-shadow-md sm:text-[11px]"
        >
          @{tile.name}
        </button>
        {!tile.panel && (
          <span className="shrink-0 rounded border border-rose-500/20 bg-rose-500/20 px-1.5 py-0.5 text-[8px] font-black uppercase text-rose-400">
            Absent
          </span>
        )}
      </div>
      {isSpeaking && (
        <div className="w-fit animate-pulse rounded bg-rose-600 px-2 py-0.5 text-[9px] font-black text-white shadow-[0_0_10px_rgba(225,29,72,0.6)]">
          DIRECT
        </div>
      )}
    </div>
  );

  return (
    <motion.div
      className={`relative h-full w-full bg-transparent backdrop-blur-2xl transition-all duration-300 ${roundedClass} ${variant === 'nexus' ? tile.cellClass : ''} ${variant === 'nexus' ? 'overflow-hidden' : ''}`}
      style={{
        boxShadow: auraShadow,
        zIndex: tile.aura > 0 ? 10 : 1,
        opacity: isMutedByFocus ? 0.4 : 1,
      }}
    >
      <button
        type="button"
        data-cinema-stay
        onPointerDown={(e) => {
          if (!tile.isLocal) {
            e.stopPropagation();
            onTapSupport(tile.slot);
            onPreferSide(tile.slot);
          }
        }}
        className={`absolute inset-0 z-[28] h-full w-full touch-manipulation outline-none overflow-hidden rounded-[inherit] ${!tile.isLocal ? 'active:scale-95 transition-transform duration-150 cursor-pointer' : 'cursor-default'}`}
        style={{ filter: filterVal }}
      >
        {tile.hasActiveVideo && tile.panel?.videoTrack ? (
          <ParticipantVideo
            videoTrack={tile.panel.videoTrack}
            muted={tile.isLocal}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : tile.avatarUrl ? (
          <div className="absolute inset-0 h-full w-full">
            <Image
              src={tile.avatarUrl}
              alt=""
              fill
              className="object-cover opacity-60"
              sizes="(max-width: 640px) 38vw, 16rem"
            />
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80">
            <span className="text-3xl font-black uppercase text-white/40">
              {tile.name.replace(/^@/, '')[0] ?? '?'}
            </span>
          </div>
        )}
        {isActiveSpeaker && (
          <div className="absolute inset-0 z-20 pointer-events-none rounded-[inherit] border-2 border-brand-400 shadow-[0_0_20px_rgba(0,240,255,0.4)] animate-pulse" />
        )}
      </button>

      {variant === 'constellation' ? (
        <>
          {tile.isLocal && (
            <div
              data-cinema-stay
              className={`pointer-events-auto absolute left-1/2 z-[150] flex -translate-x-1/2 items-center gap-1.5 ${
                (tileCount === 3 && tileIndex === 0) || ((tileCount === 5 || tileCount === 6) && tileIndex === 4)
                  ? 'bottom-[calc(100%+1.5rem)] lg:bottom-[calc(100%+4px)] flex-row'
                  : 'top-[calc(100%+3.2rem)] flex-row'
              }`}
            >
              {localControls}
            </div>
          )}
          <div
            data-cinema-stay
            className="pointer-events-auto absolute top-[calc(100%+8px)] left-1/2 z-[140] flex w-max max-w-[200px] -translate-x-1/2 flex-col items-center"
          >
            {pseudoBadge}
          </div>
        </>
      ) : variant === 'nexus' && tileCount === 3 && (tileIndex === 0 || tileIndex === 1) ? (
        <div data-cinema-stay className={nexusChromeClass}>
          <div className="pointer-events-auto">{pseudoBadge}</div>
          <div className="pointer-events-auto shrink-0">{localControls}</div>
        </div>
      ) : (
        <div data-cinema-stay className={nexusChromeClass}>
          <div
            className={`flex items-start gap-1.5 ${tileCount === 3 && tileIndex === 2 ? 'pointer-events-auto' : ''}`}
          >
            {pseudoBadge}
          </div>
          {localControls}
        </div>
      )}
    </motion.div>
  );
}
```

---

## `components/Arena/nexus/nexusGridTemplates.ts` (56 lignes)

```typescript
/** Classes Tailwind du conteneur grille selon le nombre de tuiles (1–6). */
export function getNexusGridClass(tileCount: number): string {
  switch (tileCount) {
    case 1:
      return 'grid-cols-1 grid-rows-1';
    case 2:
      return 'grid-cols-2 grid-rows-1';
    case 3:
      return 'grid-cols-2 grid-rows-2';
    case 4:
      return 'grid-cols-2 grid-rows-2';
    case 5:
      return 'grid-cols-6 grid-rows-2';
    case 6:
      return 'grid-cols-3 grid-rows-2';
    default:
      return 'grid-cols-1 grid-rows-1';
  }
}

/** Placement d'une cellule dans la grille Nexus. */
export function getNexusCellClass(index: number, tileCount: number): string {
  if (tileCount === 3 && index === 2) return 'col-span-2';
  if (tileCount === 5) {
    if (index <= 2) return 'col-span-2';
    if (index === 3) return 'col-span-2 col-start-2';
    if (index === 4) return 'col-span-2 col-start-4';
  }
  return '';
}

/** Position du chrome (nom, DIRECT, contrôles) sur une tuile Nexus. */
export function getNexusChromeUiPos(index: number, tileCount: number): string {
  if (tileCount === 2 && index === 1) {
    return 'top-[3.5rem] right-2 sm:top-[4.5rem] sm:right-4 flex-row-reverse items-start';
  }
  if (tileCount === 3 && index === 0) {
    // Haut-Gauche : Pseudo Haut-Droite (self-end), Contrôles Bas-Gauche (self-start)
    return 'inset-2 sm:inset-3 flex-col justify-between !pointer-events-none [&>*:first-child]:self-end [&>*:first-child]:!pointer-events-auto [&>*:last-child]:self-start [&>*:last-child]:!pointer-events-auto';
  }
  if (tileCount === 3 && index === 1) {
    // Haut-Droite : Pseudo Haut-Gauche (self-start), Contrôles Bas-Droite (self-end). pt-12 pour éviter les icônes Live/Share.
    return 'inset-2 sm:inset-3 pt-12 sm:pt-14 flex-col justify-between !pointer-events-none [&>*:first-child]:self-start [&>*:first-child]:!pointer-events-auto [&>*:last-child]:self-end [&>*:last-child]:!pointer-events-auto';
  }
  if (tileCount === 3 && index === 2) {
    return 'left-2 right-2 sm:left-4 sm:right-4 top-2 sm:top-4 flex-row justify-between items-start pointer-events-none';
  }
  if (tileCount === 4 && index === 3) {
    return 'top-2 right-2 sm:top-4 sm:right-4 flex-col items-end';
  }
  if (tileCount >= 5 && index % 2 === 1) {
    return 'top-2 right-2 sm:top-4 sm:right-4 flex-row-reverse items-start';
  }
  return 'top-2 left-2 sm:top-4 sm:left-4 flex-row items-start';
}
```

---

## Annexe — Fonctions D.1 prioritaires (références rapides)

### `recoverMediaDevices` (L364-385)

```typescript
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
```

### `flipCamera` (L387-394)

```typescript
const flipCamera = useCallback(async () => {
  if (!callRef.current || viewerModeRef.current) return;
  try {
    await callRef.current.cycleCamera();
  } catch (err) {
    console.warn('[WebRTC] Erreur lors du Camera Flip:', err);
  }
}, []);
```

### Listener visibility → unmute (L447-454)

```typescript
useEffect(() => {
  if (status !== 'joined' || viewerModeRef.current) return;
  const onVis = () => {
    if (document.visibilityState === 'visible') void recoverMediaDevices();
  };
  document.addEventListener('visibilitychange', onVis);
  return () => document.removeEventListener('visibilitychange', onVis);
}, [status, recoverMediaDevices]);
```

---

## Prochaines étapes Phase D.1 (non implémentées)

1. **PiP** — revoir classes Tailwind du conteneur `SmartPiPManager` (supprimer `z-[-9999]`, tester `opacity-0` + dimensions minimales compositées)
2. **Unmute** — `recoverMediaDevices` : restaurer état mic/cam utilisateur au lieu de forcer `true`
3. **Flip** — remplacer `cycleCamera()` par bascule front/back explicite
4. **Layout** — ajuster `getNexusChromeUiPos` et/ou réduire footprint des `localControls` sur mobile (grille 3 tuiles)
