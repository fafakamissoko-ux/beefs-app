# Rapport d'audit source — Hardware & Network Health (Tier-1 Agora)

**Date :** 31 mai 2026  
**Périmètre :** extraction intégrale, zéro modification du code source  
**Objectif :** préparer Network Health indicators + Camera Flip mobile — cartographie contrôles locaux et hooks Daily.

---

## Synthèse des findings

### Hooks Daily React — ABSENTS

| Hook recherché | Résultat |
|----------------|----------|
| `useNetwork()` (@daily-co/daily-react) | **Non utilisé** — package non présent dans le pipeline arène |
| `useLocalSessionId()` | **Non utilisé** |
| `useDevices()` | **Non utilisé** |

**Stack actuelle :** `@daily-co/daily-js` via `DailyIframe.createCallObject()` dans `hooks/useDailyMeetingEngine.ts`, exposé par `hooks/useDailyCall.ts`.

### Contrôles locaux micro / caméra

| Couche | Fichier | Mécanisme |
|--------|---------|-----------|
| **UI tuile locale** | `ArenaVideoSurface.tsx` | Boutons Mic/Video si `tile.isLocal` → `onToggleMic` / `onToggleCam` |
| **Moteur WebRTC** | `useDailyMeetingEngine.ts` | `call.setLocalAudio()` / `call.setLocalVideo()` |
| **Façade arène** | `useDailyCall.ts` | Re-export `toggleMic`, `toggleCam`, `micEnabled`, `camEnabled` |
| **Câblage** | `TikTokStyleArena.tsx` | `useDailyCall(...)` → props `ArenaLayoutManager` |
| **PreJoin (sas)** | `PreJoinScreen.tsx` | `getUserMedia`, `enumerateDevices`, toggles track.enabled |
| **Régie médiateur** | `MediatorSidebar.tsx` | `onMediatorToggleMic/Cam` → mêmes `toggleMic/Cam` |

**Camera Flip :** aucune implémentation `facingMode: 'user'|'environment'` ou `cycleCamera()` Daily — seul sélecteur caméra par `deviceId` dans PreJoin (si >1 caméra).

### Network Health — état actuel

| Signal | Source | Granularité |
|--------|--------|-------------|
| `window offline/online` | `TikTokStyleArena` | Overlay « Reconnexion en cours » |
| `connectionStatus` | `useDailyMeetingEngine` | `idle \| joining \| joined \| error \| left` |
| `isCameraInterrupted` | Daily events `track-stopped`, `camera-error` | Overlay « RÉACTIVER » MediatorOrb |
| Reconnexion Daily | `useDailyMeetingEngine` | `offline`/`online` → re-join call object |
| `networkHealthy` | `MediatorSidebar` prop | **Déclaré mais jamais passé** depuis TikTokStyleArena |
| Stats réseau Daily | — | **Aucun** `getNetworkStats()` / `network-quality-change` |

### Zones overlay pour icônes réseau (post-PiP C3.2)

1. **`ArenaVideoSurface.pseudoBadge`** — badge `@username` sous chaque tuile (z-140)
2. **`ParticipantVideo`** — bouton PiP top-right (z-20) — candidat adjacent Network icon
3. **`MediatorOrb`** — badge médiateur + timer (z-160)

---

## Fichiers extraits

| Fichier | Lignes | Rôle |
|---------|--------|------|
| `components/Arena/shared/ArenaVideoSurface.tsx` | 223 | Contrôles locaux + overlay pseudo |
| `components/ParticipantVideo.tsx` | 77 | `<video>` + PiP overlay (C3.2) |
| `hooks/useDailyMeetingEngine.ts` | 463 | Moteur Daily : toggle A/V, reconnexion |
| `hooks/useDailyCall.ts` | 123 | Façade CallParticipant |
| `components/PreJoinScreen.tsx` | 396 | getUserMedia, devices, toggles pre-live |
| `components/Arena/shared/MediatorOrb.tsx` | 179 | Vidéo médiateur + badge overlay |
| `hooks/usePiP.ts` | 56 | Hook PiP (overlay bouton) |

---

## `components/Arena/shared/ArenaVideoSurface.tsx` (222 lignes)

```typescript
'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';
import { Mic, Video } from 'lucide-react';
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
            onToast('Micro verrouillÃ© par le Ref ou les rÃ¨gles du dÃ©bat.', 'error');
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
    </div>
  ) : null;

  const pseudoBadge = (
    <div className="flex max-w-full flex-col items-center gap-1">
      <div className="flex max-w-full items-center gap-2 rounded-full border border-white/[0.08] bg-slate-900/40 px-3 py-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_1px_rgba(255,255,255,0.1)] backdrop-blur-[40px] sm:px-4 sm:py-2">
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

## `components/ParticipantVideo.tsx` (76 lignes)

```typescript
'use client';
import { useEffect, useRef } from 'react';
import { usePiP } from '@/hooks/usePiP';
import { PictureInPicture2 } from 'lucide-react';

interface ParticipantVideoProps {
  videoTrack: MediaStreamTrack | null;
  audioTrack?: MediaStreamTrack | null;
  muted?: boolean;
  className?: string;
  mirror?: boolean;
}

export function ParticipantVideo({ videoTrack, audioTrack, muted = false, className = '', mirror = false }: ParticipantVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { isPiPSupported, isPiPActive, togglePiP } = usePiP(videoRef);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    // Recyclage du stream pour Ã©viter le clignotement (Blink)
    let stream = el.srcObject as MediaStream;
    if (!stream) {
      stream = new MediaStream();
      el.srcObject = stream;
    }

    // Nettoyage des anciennes pistes
    stream.getTracks().forEach(t => stream.removeTrack(t));

    // Ajout des nouvelles
    let hasTracks = false;
    if (videoTrack) { stream.addTrack(videoTrack); hasTracks = true; }
    if (audioTrack && !muted) { stream.addTrack(audioTrack); hasTracks = true; }

    if (hasTracks) {
      void el.play().catch(err => console.warn('Autoplay bloquÃ©', err));
    }
  }, [videoTrack, audioTrack, muted]);

  // Correction iOS : Forcer la lecture au retour dans l'application
  useEffect(() => {
    const el = videoRef.current;
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && el && el.srcObject) {
        void el.play().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  return (
    <div className={className || 'relative h-full w-full'}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        disablePictureInPicture={false}
        className={`absolute inset-0 h-full w-full object-cover ${mirror ? '[transform:scaleX(-1)]' : ''} bg-transparent`}
      />
      {isPiPSupported && !isPiPActive && (
        <button
          onClick={togglePiP}
          type="button"
          className="absolute top-2 right-2 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white/80 backdrop-blur-md transition-all hover:bg-black/60 hover:text-white"
          title="DÃ©tacher la vidÃ©o"
        >
          <PictureInPicture2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
```

## `hooks/useDailyMeetingEngine.ts` (462 lignes)

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
  /** Jeton issu exclusivement de la Phase 1 (aucun fetch rÃ©seau dans ce hook). */
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
  /** Coupure micro cÃ´tÃ© room (token owner Daily) : `muted=true` force la cible muette pour tous. */
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
 * Moteur WebRTC Daily Â« idiote Â» : uniquement `co.join({ url, token, â€¦ })`.
 * Aucun appel HTTP vers les APIs backend de lâ€™app.
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
        setError('Jeton Daily manquant â€” repasse par la page dâ€™entrÃ©e (Phase 1).');
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
            setError('Connexion trop lente ou bloquÃ©e par le navigateur.');
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
```

## `hooks/useDailyCall.ts` (122 lignes)

```typescript
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
  join: (preAcquiredStream?: MediaStream | null, opts?: { camEnabled?: boolean }) => Promise<void>;
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
  /** Paires Daily triÃ©es (rÃ©conciliation identitÃ©). */
  physicalPeers: PhysicalPeer[];
  connectionStatus: MeetingConnectionStatus;
  localParticipant: CallParticipant | null;
  remoteParticipants: CallParticipant[];
  activeSpeakerPeerId: string | null;
  error: string | null;
  isCameraInterrupted: boolean;
  recoverMediaDevices: () => Promise<void>;
}

/** Mappe un {@link PhysicalPeer} vers le format affichage arÃ¨ne (pistes Daily). */
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
 * FaÃ§ade arÃ¨ne : mappe le moteur {@link useDailyMeetingEngine} vers lâ€™ancien `CallParticipant`.
 * Aucun fetch rÃ©seau â€” jeton fourni par la Phase 1 uniquement.
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
```

## `components/PreJoinScreen.tsx` (395 lignes)

```typescript
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Video, VideoOff, ChevronDown } from 'lucide-react';
import { MutinyProtocol } from './MutinyProtocol';

interface PreJoinScreenProps {
  userName: string;
  /** Flux dÃ©jÃ  autorisÃ© par lâ€™utilisateur â€” transmis Ã  Daily pour Ã©viter un 2áµ‰ getUserMedia sans geste (iOS / Brave). */
  onJoin: (preAcquiredMedia: MediaStream | null, opts?: { camEnabled: boolean }) => void;
  viewerMode?: boolean;
  mediatorName?: string;
  currentUserSlot?: 'A' | 'B';
  otherPartyInitiatedMutiny?: boolean;
  onMutinyInitiate?: () => void;
  onMutinyConfirm?: () => void;
  onMutinyRefuse?: () => void;
}

export function PreJoinScreen({
  userName,
  onJoin,
  viewerMode = false,
  mediatorName,
  currentUserSlot,
  otherPartyInitiatedMutiny,
  onMutinyInitiate,
  onMutinyConfirm,
  onMutinyRefuse,
}: PreJoinScreenProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  /** True si le MediaStream a Ã©tÃ© passÃ© Ã  Daily â€” ne pas stopper les pistes au dÃ©montage. */
  const mediaHandedOffRef = useRef(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [camEnabled, setCamEnabled] = useState(true);
  const [micEnabled, setMicEnabled] = useState(true);
  const [camError, setCamError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [devices, setDevices] = useState<{ cameras: MediaDeviceInfo[]; mics: MediaDeviceInfo[] }>({ cameras: [], mics: [] });
  const [selectedCam, setSelectedCam] = useState('');
  const [selectedMic, setSelectedMic] = useState('');
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);

  const closeAudioContext = useCallback(() => {
    analyserRef.current = null;
    const ctx = audioContextRef.current;
    audioContextRef.current = null;
    if (ctx && ctx.state !== 'closed') {
      void ctx.close().catch(() => {});
    }
  }, []);

  /** LibÃ¨re preview PreJoin ; si handoff Daily, ne pas stopper les pistes matÃ©rielles. */
  const releasePreJoinResources = useCallback(
    (options: { stopTracks: boolean }) => {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      closeAudioContext();
      if (options.stopTracks) {
        streamRef.current?.getTracks().forEach((t) => {
          try {
            t.stop();
          } catch {
            /* ignore */
          }
        });
      }
      streamRef.current = null;
      setStream(null);
    },
    [closeAudioContext],
  );

  const startPreview = useCallback(async (camId?: string, micId?: string) => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    closeAudioContext();
    setCamError(null);

    try {
      const constraints: MediaStreamConstraints = {
        video: camEnabled ? (camId ? { deviceId: { exact: camId } } : true) : false,
        audio: micId ? { deviceId: { exact: micId } } : true,
      };
      const s = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(s);
      streamRef.current = s;

      if (videoRef.current) {
        videoRef.current.srcObject = s;
      }

      // Audio level meter
      const ctx = new AudioContext();
      audioContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(s);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const tick = () => {
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setAudioLevel(Math.min(100, avg * 2));
        animFrameRef.current = requestAnimationFrame(tick);
      };
      tick();

      // Enumerate devices after getting permission
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      setDevices({
        cameras: allDevices.filter(d => d.kind === 'videoinput'),
        mics: allDevices.filter(d => d.kind === 'audioinput'),
      });
    } catch (err: unknown) {
      setCamError('CamÃ©ra/micro non disponible. VÃ©rifie les permissions du navigateur.');
      console.error('Camera error:', err);
    }
  }, [camEnabled, closeAudioContext]);

  const startPreviewRef = useRef(startPreview);
  startPreviewRef.current = startPreview;

  useEffect(() => {
    if (!viewerMode) {
      void startPreviewRef.current();
    }
    return () => {
      releasePreJoinResources({ stopTracks: !mediaHandedOffRef.current });
    };
  }, [viewerMode, releasePreJoinResources]);

  const toggleCam = () => {
    if (stream) {
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !camEnabled;
        setCamEnabled(!camEnabled);
      }
    }
  };

  const toggleMic = () => {
    if (stream) {
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !micEnabled;
        setMicEnabled(!micEnabled);
      }
    }
  };

  const handleJoin = () => {
    mediaHandedOffRef.current = true;
    const acquired = streamRef.current ?? stream;
    if (!camEnabled) {
      acquired?.getVideoTracks().forEach((t) => t.stop());
    }
    /** Ne pas stopper les pistes : Daily les rÃ©utilise ; on libÃ¨re seulement preview + AudioContext. */
    releasePreJoinResources({ stopTracks: false });
    onJoin(acquired, { camEnabled });
  };

  const ambientLayer = (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute -left-[20%] -top-[25%] h-[min(70vh,32rem)] w-[min(85vw,36rem)] rounded-full bg-cyan-600/[0.22] blur-[100px] sm:blur-[120px]" />
      <div className="absolute -right-[18%] -bottom-[20%] h-[min(65vh,30rem)] w-[min(80vw,34rem)] rounded-full bg-cyan-500/20 blur-[95px] sm:blur-[115px]" />
      <div className="absolute right-0 top-1/3 h-40 w-40 -translate-y-1/2 translate-x-1/4 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="absolute bottom-0 left-1/4 h-32 w-32 rounded-full bg-cyan-400/10 blur-3xl" />
    </div>
  );

  if (viewerMode) {
    return (
      <div className="relative flex h-full w-full touch-manipulation items-center justify-center overflow-y-auto overflow-x-hidden bg-transparent p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {ambientLayer}
        <div className="relative z-10 w-full max-w-md max-h-[90dvh] overflow-y-auto">
          <div className="relative rounded-[2.5rem] border border-white/10 bg-slate-950/75 p-5 shadow-2xl backdrop-blur-md sm:p-6">
            <button
              type="button"
              onClick={() => {
                window.location.href = '/feed';
              }}
              className="absolute left-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white backdrop-blur-md transition-colors hover:bg-white/10"
            >
              <span aria-hidden>â†</span>
            </button>
            <div className="space-y-5 pt-10 text-center">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500/25 to-cyan-500/15 ring-1 ring-white/10 sm:h-24 sm:w-24">
                <span className="text-4xl font-black text-white sm:text-5xl">{userName?.[0]?.toUpperCase() || '?'}</span>
              </div>
              <div>
                <h2 className="text-xl font-black tracking-tight text-white sm:text-2xl">Rejoindre en tant que spectateur</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-white/50">Tu pourras regarder le beef, commenter, voter et envoyer des reactions</p>
              </div>
              <button
                type="button"
                onClick={() => onJoin(null)}
                className="w-full touch-manipulation rounded-2xl bg-white py-3 text-sm font-black uppercase tracking-widest text-black transition-[transform,background-color] duration-150 hover:bg-gray-200 active:scale-[0.97] sm:py-3.5 sm:text-base"
              >
                ðŸ‘ï¸ Regarder le Beef
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full w-full touch-manipulation items-center justify-center overflow-y-auto overflow-x-hidden bg-transparent p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pl-4">
      {ambientLayer}
      <div className="relative z-10 w-full max-w-2xl max-h-[90dvh] overflow-y-auto">
        <div className="relative space-y-3 rounded-[2.5rem] border border-white/10 bg-slate-950/75 p-3 shadow-2xl backdrop-blur-md sm:space-y-4 sm:p-5 md:p-6">
        <button
          type="button"
          onClick={() => {
            window.location.href = '/feed';
          }}
          className="absolute top-4 left-4 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white backdrop-blur-md transition-colors hover:bg-white/10"
        >
          <span aria-hidden>â†</span>
        </button>
        {/* Title */}
        <div className="px-0.5 pt-8 text-center sm:pt-6">
          <h2 className="text-xl font-black tracking-tight text-white sm:text-2xl">PrÃªt Ã  rejoindre ?</h2>
          <p className="mt-0.5 text-sm leading-relaxed text-white/50">Teste ta camÃ©ra et ton micro avant d&apos;entrer dans le beef</p>
        </div>

        {/* Camera preview */}
        <div className="relative aspect-video max-h-[min(42vh,22rem)] overflow-hidden rounded-2xl border border-white/10 bg-slate-950/80 backdrop-blur-md shadow-inner sm:max-h-none sm:rounded-3xl">
          {camEnabled ? (
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="h-full w-full object-cover scale-x-[-1]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <div className="text-center">
                <div className="mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-gray-700/90 sm:h-20 sm:w-20">
                  <span className="text-2xl font-bold text-white sm:text-3xl">
                    {userName ? userName[0].toUpperCase() : '?'}
                  </span>
                </div>
                <p className="text-sm text-white/45">CamÃ©ra dÃ©sactivÃ©e</p>
              </div>
            </div>
          )}

          {/* Name badge â€” ne pas intercepter les taps (contrÃ´les sous-jacents si besoin) */}
          <div className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-0.5 backdrop-blur-sm sm:bottom-3 sm:left-3 sm:px-2.5 sm:py-1">
            <span className="text-xs font-semibold text-white sm:text-sm">{userName} (Vous)</span>
          </div>

          {/* Error */}
          {camError && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80">
              <div className="text-center p-4">
                <VideoOff className="w-10 h-10 text-red-400 mx-auto mb-2" />
                <p className="text-sm text-red-300">{camError}</p>
                <button
                  type="button"
                  onClick={() => startPreview()}
                  className="mt-2 touch-manipulation text-sm text-orange-400 underline"
                >
                  RÃ©essayer
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Controls â€” cartes glass, cÃ´te Ã  cÃ´te */}
        <div className="flex w-full min-w-0 flex-row items-stretch justify-center gap-2 sm:gap-3">
          <div className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-slate-900/40 p-2 backdrop-blur-sm shadow-lg sm:rounded-[2rem] sm:p-3">
            <p className="mb-1.5 text-center font-mono text-[8px] font-bold uppercase tracking-[0.2em] text-white/40 sm:mb-2 sm:text-[9px]">
              Montrer mon visage
            </p>
            <button
              type="button"
              onClick={toggleCam}
              className={`flex w-full touch-manipulation items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-xs font-semibold transition-all sm:gap-2 sm:rounded-2xl sm:px-3 sm:py-2.5 sm:text-sm ${
                camEnabled
                  ? 'bg-white/[0.06] text-white ring-1 ring-cyan-500/25 hover:bg-white/[0.1]'
                  : 'border border-violet-500/40 bg-violet-500/15 text-violet-200 hover:bg-violet-500/25'
              }`}
            >
              {camEnabled ? <Video className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" /> : <VideoOff className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />}
              {camEnabled ? 'CamÃ©ra ON' : 'CamÃ©ra OFF'}
            </button>
          </div>

          <div className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-slate-900/40 p-2 backdrop-blur-sm shadow-lg sm:rounded-[2rem] sm:p-3">
            <p className="mb-1.5 text-center font-mono text-[8px] font-bold uppercase tracking-[0.2em] text-white/40 sm:mb-2 sm:text-[9px]">
              Micro
            </p>
            <button
              type="button"
              onClick={toggleMic}
              className={`mb-1.5 flex w-full touch-manipulation items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-xs font-semibold transition-all sm:mb-2 sm:gap-2 sm:rounded-2xl sm:px-3 sm:py-2.5 sm:text-sm ${
                micEnabled
                  ? 'bg-white/[0.06] text-white ring-1 ring-cyan-500/25 hover:bg-white/[0.1]'
                  : 'border border-red-500/40 bg-red-500/15 text-red-200 hover:bg-red-500/25'
              }`}
            >
              {micEnabled ? <Mic className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" /> : <MicOff className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />}
              {micEnabled ? 'ON' : 'OFF'}
            </button>
            {micEnabled && (
              <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06] sm:h-2">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-cyan-300 transition-all duration-75"
                  style={{ width: `${audioLevel}%` }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Device selectors */}
        {(devices.cameras.length > 1 || devices.mics.length > 1) && (
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:gap-3">
            {devices.cameras.length > 1 && (
              <div className="relative min-w-0 flex-1 rounded-2xl border border-white/10 bg-slate-900/40 p-0.5 backdrop-blur-sm shadow-lg sm:rounded-[1.75rem]">
                <select
                  value={selectedCam}
                  onChange={e => { setSelectedCam(e.target.value); startPreview(e.target.value, selectedMic); }}
                  className="w-full cursor-pointer appearance-none rounded-[1.5rem] bg-white/[0.04] px-3 py-2 pr-9 text-xs text-white ring-0 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 sm:rounded-[1.75rem] sm:px-4 sm:py-2.5 sm:text-sm"
                >
                  {devices.cameras.map(d => (
                    <option key={d.deviceId} value={d.deviceId}>{d.label || 'CamÃ©ra'}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40 sm:right-4 sm:h-4 sm:w-4" />
              </div>
            )}
            {devices.mics.length > 1 && (
              <div className="relative min-w-0 flex-1 rounded-2xl border border-white/10 bg-slate-900/40 p-0.5 backdrop-blur-sm shadow-lg sm:rounded-[1.75rem]">
                <select
                  value={selectedMic}
                  onChange={e => { setSelectedMic(e.target.value); startPreview(selectedCam, e.target.value); }}
                  className="w-full cursor-pointer appearance-none rounded-[1.5rem] bg-white/[0.04] px-3 py-2 pr-9 text-xs text-white ring-0 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 sm:rounded-[1.75rem] sm:px-4 sm:py-2.5 sm:text-sm"
                >
                  {devices.mics.map(d => (
                    <option key={d.deviceId} value={d.deviceId}>{d.label || 'Micro'}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40 sm:right-4 sm:h-4 sm:w-4" />
              </div>
            )}
          </div>
        )}

        {/* Mutiny Protocol â€” challengers only, pre-live */}
        {mediatorName && currentUserSlot && onMutinyInitiate && onMutinyConfirm && onMutinyRefuse && (
          <div className="flex items-center justify-between gap-2 rounded-2xl border border-white/10 bg-slate-900/40 px-3 py-2.5 backdrop-blur-sm shadow-lg sm:gap-3 sm:px-4 sm:py-3">
            <div className="min-w-0 flex-1">
              <p className="font-sans text-xs text-white/40">
                Ref : <span className="font-bold text-white/60">{mediatorName}</span>
              </p>
            </div>
            <MutinyProtocol
              mediatorName={mediatorName}
              currentUserSlot={currentUserSlot}
              otherPartyInitiated={otherPartyInitiatedMutiny}
              onInitiate={onMutinyInitiate}
              onConfirm={onMutinyConfirm}
              onRefuse={onMutinyRefuse}
            />
          </div>
        )}

        {/* Join */}
        <button
          type="button"
          onClick={handleJoin}
          className="w-full touch-manipulation rounded-2xl bg-white py-3 text-sm font-black uppercase tracking-widest text-black transition-[transform,background-color] duration-200 hover:bg-gray-200 active:scale-[0.96] sm:py-3.5 sm:text-base md:py-4"
        >
          Rejoindre le direct
        </button>
        </div>
      </div>
    </div>
  );
}
```

## `components/Arena/shared/MediatorOrb.tsx` (178 lignes)

```typescript
'use client';

import type React from 'react';
import { motion } from 'framer-motion';
import { Pause, Sliders, Timer } from 'lucide-react';
import { ParticipantVideo } from '@/components/ParticipantVideo';
import type { CallParticipant } from '@/hooks/useDailyCall';
import type { ArenaSupportSlotId } from '@/lib/arena-slots';

export interface MediatorOrbProps {
  mediatorParticipant: CallParticipant | null;
  mediatorIsLocal: boolean;
  mediatorName: string;
  auraMed: number;
  isWaitingForMediator: boolean;
  isCameraInterrupted: boolean;
  isViewer: boolean;
  isHost: boolean;
  mediatorGraceActive: boolean;
  mediatorGraceSeconds: number;
  isJoined: boolean;
  timerActive: boolean;
  timerPaused: boolean;
  beefTimeRemaining: number;
  formatBeefTime: (seconds: number) => string;
  mediatorHostId: string;
  getMediatorDynamicColor: (val: number) => string;
  onTapSupport: (slot: ArenaSupportSlotId) => void;
  onPreferSide: (side: ArenaSupportSlotId) => void;
  onOpenProfile: (username: string, knownUserId?: string | null) => void | Promise<void>;
  onRecoverMediaDevices: () => void | Promise<void>;
  onToggleMediatorSidebar: () => void;
  isConstellation?: boolean;
  constellationHaloVw?: number;
}

export function MediatorOrb({
  mediatorParticipant,
  mediatorIsLocal,
  mediatorName,
  auraMed,
  isWaitingForMediator,
  isCameraInterrupted,
  isViewer,
  isHost,
  mediatorGraceActive,
  mediatorGraceSeconds,
  isJoined,
  timerActive,
  timerPaused,
  beefTimeRemaining,
  formatBeefTime,
  mediatorHostId,
  getMediatorDynamicColor,
  onTapSupport,
  onPreferSide,
  onOpenProfile,
  onRecoverMediaDevices,
  onToggleMediatorSidebar,
  isConstellation = false,
  constellationHaloVw,
}: MediatorOrbProps) {
  const MIN_PX = 64;
  const MAX_REM = 22;
  const orbSizeStyle: React.CSSProperties =
    isConstellation && constellationHaloVw
      ? {
          width: `clamp(${MIN_PX}px, ${constellationHaloVw}vmin, ${MAX_REM}rem)`,
          height: `clamp(${MIN_PX}px, ${constellationHaloVw}vmin, ${MAX_REM}rem)`,
        }
      : { width: `clamp(110px, 30vmin, ${MAX_REM}rem)`, height: `clamp(110px, 30vmin, ${MAX_REM}rem)` };

  return (
    <div
      data-cinema-stay
      className={`pointer-events-none absolute left-1/2 z-[100] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center ${
        isConstellation ? 'top-[50%]' : 'top-1/2'
      }`}
    >
      <motion.div
        animate={{
          boxShadow:
            auraMed > 0
              ? `0 0 50px ${getMediatorDynamicColor(auraMed)}, inset 0 0 20px rgba(212,175,55,0.3)`
              : 'inset 0 0 20px rgba(255,255,255,0.05), 0 0 0 1px rgba(255,255,255,0.1)',
        }}
        style={{
          filter: `brightness(${1 + (auraMed / 300) * 0.6}) saturate(${1 + (auraMed / 300) * 0.4})`,
          ...orbSizeStyle,
        }}
        className={`pointer-events-auto relative overflow-hidden rounded-full ${
          !isConstellation ? 'sm:h-[220px] sm:w-[220px]' : ''
        }`}
      >
        {mediatorIsLocal && isCameraInterrupted && !isViewer && (
          <div className="absolute inset-0 z-[150] flex items-center justify-center bg-slate-950/55 p-2 backdrop-blur-md">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void onRecoverMediaDevices();
              }}
              className="rounded-full bg-white px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-black shadow-[0_0_15px_rgba(255,255,255,0.25)] hover:bg-gray-200"
            >
              ðŸ“¡ RÃ‰ACTIVER
            </button>
          </div>
        )}

        <button
          type="button"
          onPointerDown={(e) => {
            e.stopPropagation();
            if (isWaitingForMediator) return;
            onTapSupport('M');
            onPreferSide('M');
          }}
          onDoubleClick={(e) => e.stopPropagation()}
          className="flex h-full w-full touch-manipulation overflow-hidden rounded-full border-none bg-transparent outline-none active:scale-95"
        >
          {isWaitingForMediator ? (
            <div className="m-auto flex h-full w-full flex-col items-center justify-center bg-slate-950/55 p-4">
              <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-cyan-400 border-t-transparent sm:h-10 sm:w-10" />
            </div>
          ) : mediatorParticipant?.videoTrack ? (
            <ParticipantVideo
              videoTrack={mediatorParticipant.videoTrack}
              muted={mediatorIsLocal}
              className="h-full w-full object-cover"
            />
          ) : mediatorGraceActive ? (
            <div className="m-auto flex h-full w-full flex-col items-center justify-center bg-slate-900/65 p-4">
              <span className="text-[12px] font-black text-rose-500 sm:text-[14px]">
                {mediatorGraceSeconds}s
              </span>
            </div>
          ) : (
            <span className="m-auto text-4xl opacity-30 sm:text-5xl">âš–ï¸</span>
          )}
        </button>
      </motion.div>

      {/* BADGE SORTI DU CERCLE */}
      <div className="pointer-events-auto absolute top-[calc(100%+8px)] left-1/2 z-[160] flex w-max max-w-[200px] -translate-x-1/2 flex-col items-center gap-1">
        <div className="flex items-center rounded-full border border-white/[0.08] bg-slate-900/40 p-1 shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_1px_rgba(255,255,255,0.1)] backdrop-blur-[40px] transition-all duration-300 hover:bg-black/60 sm:px-2 sm:py-1">
          <button
            type="button"
            onClick={() => void onOpenProfile(mediatorName, mediatorHostId)}
            className="truncate max-w-[80px] sm:max-w-[130px] px-3 py-0.5 text-[11px] font-black text-prestige-gold transition-colors hover:text-white drop-shadow-md sm:text-[12px]"
          >
            @{mediatorName}
          </button>
          {isHost && (
            <button
              type="button"
              data-mediator-sidebar-toggle
              onClick={(e) => {
                e.stopPropagation();
                onToggleMediatorSidebar();
              }}
              className="relative after:absolute after:-inset-2 ml-1 flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full bg-white/5 text-prestige-gold shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] transition-colors hover:bg-white/15 hover:text-white active:scale-95"
              title="Command Deck"
            >
              <Sliders className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </button>
          )}
        </div>

        {isJoined && timerActive && (
          <div className="flex items-center gap-1.5 rounded-full border border-rose-500/20 bg-rose-600/10 px-3 py-1 text-[10px] font-black text-rose-500 backdrop-blur-md tabular-nums shadow-[0_4px_16px_rgba(0,0,0,0.3)]">
            {timerPaused ? <Pause className="h-3 w-3 text-amber-200" /> : <Timer className="h-3 w-3" />}
            {formatBeefTime(beefTimeRemaining)}
          </div>
        )}
      </div>
    </div>
  );
}
```

## `hooks/usePiP.ts` (55 lignes)

```typescript
'use client';

import { useState, useEffect, RefObject, useCallback } from 'react';

export function usePiP(videoRef: RefObject<HTMLVideoElement | null>) {
  const [isPiPSupported, setIsPiPSupported] = useState(false);
  const [isPiPActive, setIsPiPActive] = useState(false);

  useEffect(() => {
    // 1. VÃ©rification du support PiP natif
    const supported = typeof document !== 'undefined' && 'pictureInPictureEnabled' in document && document.pictureInPictureEnabled;
    setIsPiPSupported(supported);

    // 2. Activation du mode Auto-PiP (Magie Tier-1)
    // Cela permet Ã  iOS Safari et Android Chrome de dÃ©tacher automatiquement la vidÃ©o
    // lorsque l'utilisateur retourne sur l'Ã©cran d'accueil de son tÃ©lÃ©phone.
    if (videoRef.current && 'autoPictureInPicture' in videoRef.current) {
      (videoRef.current as any).autoPictureInPicture = true;
    }
  }, [videoRef]);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    const handleEnterPiP = () => setIsPiPActive(true);
    const handleLeavePiP = () => setIsPiPActive(false);

    videoElement.addEventListener('enterpictureinpicture', handleEnterPiP);
    videoElement.addEventListener('leavepictureinpicture', handleLeavePiP);

    return () => {
      videoElement.removeEventListener('enterpictureinpicture', handleEnterPiP);
      videoElement.removeEventListener('leavepictureinpicture', handleLeavePiP);
    };
  }, [videoRef]);

  const togglePiP = useCallback(async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    try {
      if (videoRef.current && videoRef.current !== document.pictureInPictureElement) {
        await videoRef.current.requestPictureInPicture();
      } else if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      }
    } catch (error) {
      console.warn('[PiP] Le navigateur a rejetÃ© le Picture-in-Picture :', error);
    }
  }, [videoRef]);

  return { isPiPSupported, isPiPActive, togglePiP };
}
```

## Extrait `components/TikTokStyleArena.tsx` — câblage Daily + réseau

```typescript
// L423-435 — détection offline navigateur
const [isOffline, setIsOffline] = useState(false);

useEffect(() => {
  const goOffline = () => { setIsOffline(true); toast('Connexion perdue — reconnexion...', 'error'); };
  const goOnline = () => { setIsOffline(false); toast('Connexion rétablie', 'success'); };
  window.addEventListener('offline', goOffline);
  window.addEventListener('online', goOnline);
  return () => {
    window.removeEventListener('offline', goOffline);
    window.removeEventListener('online', goOnline);
  };
}, [toast]);

// L1403-1423 — useDailyCall (toggleMic, toggleCam, connectionStatus implicite)
const {
  join,
  leave,
  stopCamera,
  toggleMic,
  toggleCam,
  setLocalAudioEnabled,
  hardMuteParticipant,
  ejectRemoteParticipant,
  isJoined,
  isJoining,
  micEnabled,
  camEnabled,
  physicalPeers,
  localParticipant,
  remoteParticipants,
  activeSpeakerPeerId,
  error: callError,
  isCameraInterrupted,
  recoverMediaDevices,
} = useDailyCall(effectiveDailyRoomUrl, userName, isViewer, userId, meetingTokenForDaily);

// L3322-3333 — overlay reconnexion réseau
{isOffline && !beefEnded && (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    className="absolute inset-0 z-[90] bg-black/40 backdrop-blur-sm flex flex-col items-center justify-center"
  >
    <div className="w-12 h-12 border-3 border-cyan-400 border-t-transparent rounded-full animate-spin mb-4" />
    <p className="text-white font-semibold text-lg">Reconnexion en cours...</p>
    <p className="text-gray-400 text-sm mt-1">Vérifie ta connexion internet</p>
  </motion.div>
)}

// L3496-3537 — passage toggleMic/Cam vers ArenaLayoutManager
<ArenaLayoutManager
  ...
  micEnabled={micEnabled}
  camEnabled={camEnabled}
  onToggleMic={toggleMic}
  onToggleCam={toggleCam}
  isCameraInterrupted={isCameraInterrupted}
  onRecoverMediaDevices={recoverMediaDevices}
  localCamEnabled={preJoinCamEnabled}
/>

// L3674-3677 — MediatorSidebar (note: networkHealthy NON passé)
mediatorMicEnabled={micEnabled}
mediatorCamEnabled={camEnabled}
onMediatorToggleMic={() => void toggleMic()}
onMediatorToggleCam={() => void toggleCam()}
```

## Extrait `components/MediatorSidebar.tsx` — networkHealthy + micro/cam médiateur

```typescript
// L192-204 — indicateur réseau (prop optionnelle, jamais alimentée depuis TikTokStyleArena)
{networkHealthy !== undefined && (
  <div
    className="flex w-fit shrink-0 items-center gap-2 rounded-full border border-white/10 bg-slate-950/50 px-2.5 py-1"
    title={networkHealthy ? 'Signal realtime OK' : 'Signal faible ou perdu'}
  >
    <div
      className={`h-2 w-2 rounded-full ${networkHealthy ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.85)]' : 'animate-pulse bg-rose-500 shadow-[0_0_10px_rgba(225,29,72,0.85)]'}`}
    />
    <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-blue-200/70">
      {networkHealthy ? 'Live sync' : 'Hors ligne'}
    </span>
  </div>
)}

// L508-545 — toggles micro/cam médiateur (Command Deck)
<div className="mb-5 grid grid-cols-2 gap-2">
  <button type="button" onClick={() => void onMediatorToggleMic?.()} ...>
    {mediatorMicEnabled ? <Mic ... /> : <MicOff ... />}
    Mon micro
  </button>
  <button type="button" onClick={() => void onMediatorToggleCam?.()} ...>
    {mediatorCamEnabled ? <Video ... /> : <VideoOff ... />}
    Ma caméra
  </button>
</div>
```

## Recommandations Tier-1 (hors scope audit)

1. **Network Health** — écouter `network-quality-change` ou `getNetworkStats()` sur `DailyCall` dans `useDailyMeetingEngine`, exposer via hook dédié, brancher `networkHealthy` + badge tuile dans `pseudoBadge`.
2. **Camera Flip** — ajouter `call.cycleCamera()` (Daily) ou contrainte `facingMode` dans bouton adjacent caméra sur `ArenaVideoSurface.localControls` (mobile only).
3. **PiP + Network** — placer icône signal à côté du bouton PiP (`ParticipantVideo` top-right) ou dans `pseudoBadge` flex row.

