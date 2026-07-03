# Rapport d'audit source — Picture-in-Picture (PiP) Agora

**Date :** 31 mai 2026  
**Périmètre :** extraction intégrale, zéro modification du code source  
**Objectif :** comprendre le rendu des flux vidéo Daily/WebRTC et localiser les contrôles régie pour préparer l'intégration PiP native.

---

## Synthèse architecturale

### Chaîne de rendu vidéo (live arène)

```
TikTokStyleArena (~L3514)
  └─ ArenaLayoutManager
        ├─ mode nexus → NexusGrid → ArenaVideoSurface → ParticipantVideo → <video>
        └─ mode constellation → ConstellationOrbit → ArenaVideoSurface → ParticipantVideo → <video>
        └─ MediatorOrb → ParticipantVideo → <video>  (médiateur central)
```

- **Pas de composant `DailyVideo` actif** en production : l'ancien wrapper iframe Daily est archivé dans `components/_archive/DailyVideo.tsx`.
- **Point d'ancrage PiP critique :** `components/ParticipantVideo.tsx` — seule couche qui matérialise une balise `<video>` avec `MediaStreamTrack` Daily (`videoTrack` sur `CallParticipant`).
- **Audio distant :** rendu séparément via `MeetingAudioOutlet` (`<audio>` cachés), pas dans les tuiles vidéo.

### Contrôles régie (pas de `ArenaControls.tsx`)

| Emplacement | Rôle |
|-------------|------|
| `ArenaVideoSurface` | Micro / caméra locaux sur tuile challenger (`onToggleMic`, `onToggleCam`) |
| `MediatorOrb` | Bouton Command Deck, réactivation caméra, tap support médiateur |
| `MediatorSidebar` | Régie complète médiateur (chrono, hot mic, mute all, verdict, micro/cam médiateur) |
| `TikTokStyleArena` | Quitter le direct, mode cinéma, dock chat (non extrait — monolithe) |

### Implications PiP

1. **`documentPictureInPicture.requestWindow()`** ou **`HTMLVideoElement.requestPictureInPicture()`** ciblent idéalement l'élément `<video>` de `ParticipantVideo` (ref accessible).
2. **Multi-tuiles :** plusieurs `<video>` simultanés (jusqu'à 6 challengers + médiateur) — choix UX requis (PiP du speaker actif / médiateur / composite).
3. **Layout modes** Nexus vs Constellation ne changent pas le pipeline média, seulement le positionnement CSS.

---

## Fichiers extraits

| Fichier | Lignes | Rôle |
|---------|--------|------|
| `components/ParticipantVideo.tsx` | 60 | **Couche `<video>` native** — attach `MediaStreamTrack` Daily |
| `components/Arena/ArenaLayoutManager.tsx` | 212 | Orchestrateur layout Nexus / Constellation |
| `components/Arena/shared/ArenaVideoSurface.tsx` | 223 | Tuile vidéo + contrôles micro/cam locaux |
| `components/Arena/shared/MediatorOrb.tsx` | 179 | Orbite médiateur + vidéo centrale |
| `components/Arena/nexus/NexusGrid.tsx` | 54 | Grille Nexus |
| `components/Arena/constellation/ConstellationOrbit.tsx` | 90 | Orbite constellation |
| `components/Arena/useArenaLayoutTiles.ts` | 118 | VM tuiles (`videoTrack`, `hasActiveVideo`) |
| `components/Arena/types.ts` | 85 | Types props layout |
| `components/Arena/nexus/nexusGridTemplates.ts` | 56 | Templates grille + chrome UI |
| `components/Arena/constellation/orbitGeometry.ts` | 85 | Géométrie orbite |
| `components/MeetingAudioOutlet.tsx` | 64 | Audio distant (`<audio>`, hors PiP vidéo) |
| `components/MediatorSidebar.tsx` | 751 | Command Deck régie médiateur |
| `components/_archive/DailyVideo.tsx` | 35 | Ancien iframe Daily (archivé) |

---

## `components/ParticipantVideo.tsx` (60 lignes)

```typescript
'use client';
import { useEffect, useRef } from 'react';

interface ParticipantVideoProps {
  videoTrack: MediaStreamTrack | null;
  audioTrack?: MediaStreamTrack | null;
  muted?: boolean;
  className?: string;
  mirror?: boolean;
}

export function ParticipantVideo({ videoTrack, audioTrack, muted = false, className = '', mirror = false }: ParticipantVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

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
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted={muted}
      className={`${className} ${mirror ? '[transform:scaleX(-1)]' : ''} bg-transparent object-cover`}
    />
  );
}
```

## `components/Arena/ArenaLayoutManager.tsx` (211 lignes)

```typescript
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { ChallengerSlotId } from '@/lib/arena-slots';
import { resolveArenaLayoutMode } from '@/lib/arena-layout-mode';
import { ConstellationOrbit } from './constellation/ConstellationOrbit';
import { NexusGrid } from './nexus/NexusGrid';
import { MediatorOrb } from './shared/MediatorOrb';
import type { ArenaLayoutManagerProps } from './types';
import { useArenaLayoutTiles } from './useArenaLayoutTiles';

const LAYOUT_GRACE_MS = 1500;

export function ArenaLayoutManager(props: ArenaLayoutManagerProps) {
  const {
    expectedUids,
    challengerRemoteSlots,
    reconciledPeers,
    participantRoles,
    auras,
    localUserId,
    localSessionId,
    isViewer,
    isHost,
    speakingTurnActive,
    effectiveHotMicSpeakerSlot,
    structuredDebateEnabled,
    micMutedByMediator,
    mediatorHoldingFloor,
    micEnabled,
    camEnabled,
    localCamEnabled = true,
    onTapSupport,
    onPreferSide,
    onOpenProfile,
    onToggleMic,
    onToggleCam,
    onToast,
    mediatorParticipant,
    mediatorIsLocal,
    mediatorName,
    auraMed,
    isWaitingForMediator,
    isCameraInterrupted,
    onRecoverMediaDevices,
    mediatorGraceActive,
    mediatorGraceSeconds,
    mediatorHostId,
    isJoined,
    timerActive,
    timerPaused,
    beefTimeRemaining,
    formatBeefTime,
    onToggleMediatorSidebar,
    getMediatorDynamicColor,
  } = props;

  const tiles = useArenaLayoutTiles({
    expectedUids,
    challengerRemoteSlots,
    reconciledPeers,
    participantRoles,
    auras,
    localUserId,
    localSessionId,
    isViewer,
  });

  const graceUntilRef = useRef<Partial<Record<ChallengerSlotId, number>>>({});
  const [graceTick, setGraceTick] = useState(0);

  useEffect(() => {
    const now = Date.now();
    let nextExpiry: number | null = null;

    for (const tile of tiles) {
      if (!tile.panel) {
        delete graceUntilRef.current[tile.slot];
        continue;
      }

      if (tile.hasActiveVideo) {
        delete graceUntilRef.current[tile.slot];
        continue;
      }

      const intentionalCamOff =
        tile.isLocal && (!camEnabled || !localCamEnabled);
      if (intentionalCamOff) {
        delete graceUntilRef.current[tile.slot];
        continue;
      }

      if (graceUntilRef.current[tile.slot] == null) {
        graceUntilRef.current[tile.slot] = now + LAYOUT_GRACE_MS;
      }

      const until = graceUntilRef.current[tile.slot];
      if (until && until > now) {
        nextExpiry = nextExpiry == null ? until : Math.min(nextExpiry, until);
      }
    }

    if (nextExpiry == null) return;

    const delay = Math.max(0, nextExpiry - now + 50);
    const timerId = window.setTimeout(() => setGraceTick((t) => t + 1), delay);
    return () => window.clearTimeout(timerId);
  }, [tiles, camEnabled, localCamEnabled]);

  const expectedCount = expectedUids.length;

  const effectiveVideoCount = useMemo(() => {
    void graceTick;
    const now = Date.now();
    const realActive = tiles.filter((t) => t.hasActiveVideo).length;
    if (realActive === 0 && !localCamEnabled) {
      return 0;
    }
    return tiles.filter((tile) => {
      if (tile.hasActiveVideo) return true;
      const until = graceUntilRef.current[tile.slot];
      return until != null && until > now;
    }).length;
  }, [tiles, graceTick, localCamEnabled]);

  const mode = resolveArenaLayoutMode(expectedCount, effectiveVideoCount);

  const surfaceProps = {
    isViewer,
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
  };

  const mediatorProps = {
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
  };

  return (
    <div className="absolute inset-0 z-0 bg-transparent p-1 sm:p-2">
      <AnimatePresence mode="wait">
        {mode === 'nexus' ? (
          <motion.div
            key="nexus"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="relative h-full w-full"
          >
            <NexusGrid
              tiles={tiles}
              speakingTurnActive={speakingTurnActive}
              effectiveHotMicSpeakerSlot={effectiveHotMicSpeakerSlot}
              {...surfaceProps}
            />
            <MediatorOrb {...mediatorProps} />
          </motion.div>
        ) : (
          <motion.div
            key="constellation"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="relative h-full w-full"
          >
            <ConstellationOrbit
              tiles={tiles}
              speakingTurnActive={speakingTurnActive}
              effectiveHotMicSpeakerSlot={effectiveHotMicSpeakerSlot}
              mediator={mediatorProps}
              {...surfaceProps}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

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

## `components/Arena/nexus/NexusGrid.tsx` (53 lignes)

```typescript
'use client';

import type { ChallengerSlotId } from '@/lib/arena-slots';
import type { ArenaTileVM } from '../types';
import { ArenaVideoSurface, type ArenaVideoSurfaceProps } from '../shared/ArenaVideoSurface';
import { getNexusGridClass } from './nexusGridTemplates';

export type NexusGridProps = Omit<
  ArenaVideoSurfaceProps,
  'tile' | 'tileCount' | 'tileIndex' | 'variant' | 'isSpeaking' | 'isMutedByFocus'
> & {
  tiles: ArenaTileVM[];
  speakingTurnActive: boolean;
  effectiveHotMicSpeakerSlot: ChallengerSlotId | null;
};

export function NexusGrid({
  tiles,
  speakingTurnActive,
  effectiveHotMicSpeakerSlot,
  ...surfaceProps
}: NexusGridProps) {
  const tileCount = tiles.length;
  const gridClass = getNexusGridClass(tileCount);

  return (
    <div className={`relative h-full w-full grid gap-1 sm:gap-2 ${gridClass}`}>
      {tiles.map((tile, idx) => {
        const isSpeaking =
          speakingTurnActive && effectiveHotMicSpeakerSlot === tile.slot;
        const isMutedByFocus =
          speakingTurnActive &&
          Boolean(effectiveHotMicSpeakerSlot) &&
          effectiveHotMicSpeakerSlot !== tile.slot;

        return (
          <ArenaVideoSurface
            key={tile.id}
            tile={tile}
            tileCount={tileCount}
            tileIndex={idx}
            variant="nexus"
            isSpeaking={isSpeaking}
            isMutedByFocus={isMutedByFocus}
            speakingTurnActive={speakingTurnActive}
            effectiveHotMicSpeakerSlot={effectiveHotMicSpeakerSlot}
            {...surfaceProps}
          />
        );
      })}
    </div>
  );
}
```

## `components/Arena/constellation/ConstellationOrbit.tsx` (89 lignes)

```typescript
'use client';

import { useState, useEffect } from 'react';
import type { ChallengerSlotId } from '@/lib/arena-slots';
import type { ArenaTileVM } from '../types';
import { ArenaVideoSurface, type ArenaVideoSurfaceProps } from '../shared/ArenaVideoSurface';
import { MediatorOrb, type MediatorOrbProps } from '../shared/MediatorOrb';
import { computeConstellationLayout, getOrbitPositionPercent } from './orbitGeometry';

export type ConstellationOrbitProps = Omit<
  ArenaVideoSurfaceProps,
  'tile' | 'tileCount' | 'tileIndex' | 'variant' | 'isSpeaking' | 'isMutedByFocus'
> & {
  tiles: ArenaTileVM[];
  speakingTurnActive: boolean;
  effectiveHotMicSpeakerSlot: ChallengerSlotId | null;
  mediator: MediatorOrbProps;
};

export function ConstellationOrbit({
  tiles,
  speakingTurnActive,
  effectiveHotMicSpeakerSlot,
  mediator,
  ...surfaceProps
}: ConstellationOrbitProps) {
  const tileCount = tiles.length;

  // 1. DÃ©tection dynamique de l'Ã©cran
  const [vp, setVp] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const handleResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 2. Hydratation sÃ©curisÃ©e
  if (vp.w === 0 || vp.h === 0) {
    return <div className="relative h-full w-full overflow-visible" />;
  }

  // 3. Calcul Dynamique
  const layout = computeConstellationLayout(tileCount, vp.w, vp.h);

  const MIN_PX = 64;
  const MAX_REM = 22;
  const haloStyle: React.CSSProperties = {
    width: `clamp(${MIN_PX}px, ${layout.haloVw}vmin, ${MAX_REM}rem)`,
    height: `clamp(${MIN_PX}px, ${layout.haloVw}vmin, ${MAX_REM}rem)`,
  };

  return (
    <div className="relative h-full w-full overflow-visible">
      <MediatorOrb {...mediator} isConstellation constellationHaloVw={layout.haloVw} />

      {tiles.map((tile, idx) => {
        const pos = getOrbitPositionPercent(idx, tileCount, layout.rx, layout.ry, layout.centerY);
        const isSpeaking =
          speakingTurnActive && effectiveHotMicSpeakerSlot === tile.slot;
        const isMutedByFocus =
          speakingTurnActive &&
          Boolean(effectiveHotMicSpeakerSlot) &&
          effectiveHotMicSpeakerSlot !== tile.slot;

        return (
          <div
            key={tile.id}
            className="absolute z-[80] -translate-x-1/2 -translate-y-1/2 overflow-visible"
            style={{ left: pos.left, top: pos.top, ...haloStyle }}
          >
            <ArenaVideoSurface
              tile={tile}
              tileCount={tileCount}
              tileIndex={idx}
              variant="constellation"
              isSpeaking={isSpeaking}
              isMutedByFocus={isMutedByFocus}
              speakingTurnActive={speakingTurnActive}
              effectiveHotMicSpeakerSlot={effectiveHotMicSpeakerSlot}
              {...surfaceProps}
            />
          </div>
        );
      })}
    </div>
  );
}
```

## `components/Arena/useArenaLayoutTiles.ts` (117 lignes)

```typescript
'use client';

import { useMemo } from 'react';
import { userIdsEqual } from '@/lib/user-id-equal';
import {
  ARENA_CHALLENGER_SLOT_COUNT,
  indexToChallengerSlot,
} from '@/lib/arena-slots';
import { ORPHAN_GUEST_LABEL } from '@/lib/participant-identity';
import {
  CHALLENGER_SLOT_COLORS,
  type ArenaTileVM,
  type UseArenaLayoutTilesParams,
} from './types';
import {
  getNexusCellClass,
  getNexusChromeUiPos,
} from './nexus/nexusGridTemplates';

function resolveTileName(
  idx: number,
  uid: string | undefined,
  panel: UseArenaLayoutTilesParams['challengerRemoteSlots'][number],
  reconciledPeers: UseArenaLayoutTilesParams['reconciledPeers'],
  participantRoles: UseArenaLayoutTilesParams['participantRoles'],
): string {
  const r = reconciledPeers.find((x) => x.semantic.expectedSlotIndex === idx);
  if (r?.semantic.kind === 'orphan') {
    return `@${ORPHAN_GUEST_LABEL}`;
  }
  if (uid && participantRoles[uid]?.name) {
    return participantRoles[uid].name;
  }
  const trimmed = panel?.userName?.trim();
  if (trimmed) return trimmed;
  return `Participant ${idx + 1}`;
}

function hasActiveVideo(
  panel: UseArenaLayoutTilesParams['challengerRemoteSlots'][number],
): boolean {
  return panel?.videoOn === true;
}

function resolveIsLocal(
  uid: string | undefined,
  panel: UseArenaLayoutTilesParams['challengerRemoteSlots'][number],
  localUserId: string,
  localSessionId: string | null | undefined,
  isViewer: boolean,
): boolean {
  if (isViewer) return false;
  if (uid && userIdsEqual(uid, localUserId)) return true;
  return panel != null && panel.sessionId === localSessionId;
}

export function useArenaLayoutTiles(params: UseArenaLayoutTilesParams): ArenaTileVM[] {
  const {
    expectedUids,
    challengerRemoteSlots,
    reconciledPeers,
    participantRoles,
    auras,
    localUserId,
    localSessionId,
    isViewer,
  } = params;

  return useMemo(() => {
    const tileCount =
      expectedUids.length > 0
        ? Math.min(expectedUids.length, ARENA_CHALLENGER_SLOT_COUNT)
        : challengerRemoteSlots.reduce((max, p, i) => (p ? Math.max(max, i + 1) : max), 0);

    if (tileCount <= 0) return [];

    const tiles: ArenaTileVM[] = [];

    for (let idx = 0; idx < tileCount; idx++) {
      const uid = expectedUids[idx];
      const panel = challengerRemoteSlots[idx] ?? null;
      const slot = indexToChallengerSlot(idx);
      const name = resolveTileName(idx, uid, panel, reconciledPeers, participantRoles);
      const arenaUserId = uid ?? panel?.arenaUserId ?? null;
      const avatarUrl =
        (uid && participantRoles[uid]?.avatarUrl) ||
        (arenaUserId && participantRoles[arenaUserId]?.avatarUrl) ||
        null;

      tiles.push({
        id: `arena-tile-${slot}`,
        slot,
        name,
        arenaUserId,
        panel,
        aura: auras[slot],
        colorRgb: CHALLENGER_SLOT_COLORS[slot],
        hasActiveVideo: hasActiveVideo(panel),
        isLocal: resolveIsLocal(uid, panel, localUserId, localSessionId, isViewer),
        avatarUrl,
        cellClass: getNexusCellClass(idx, tileCount),
        uiPosClass: getNexusChromeUiPos(idx, tileCount),
      });
    }

    return tiles;
  }, [
    expectedUids,
    challengerRemoteSlots,
    reconciledPeers,
    participantRoles,
    auras,
    localUserId,
    localSessionId,
    isViewer,
  ]);
}
```

## `components/Arena/types.ts` (84 lignes)

```typescript
import type { CallParticipant } from '@/hooks/useDailyCall';
import type { BeefParticipantRowMeta, ReconciledPeer } from '@/lib/participant-identity';
import type { ArenaSupportSlotId, ChallengerSlotId } from '@/lib/arena-slots';

export type { ArenaLayoutMode } from '@/lib/arena-layout-mode';

export const CHALLENGER_SLOT_COLORS: Record<ChallengerSlotId, string> = {
  A: '225,29,72',
  B: '16,185,129',
  C: '234,179,8',
  D: '59,130,246',
  E: '168,85,247',
  F: '244,114,182',
};

export interface ArenaTileVM {
  id: string;
  slot: ChallengerSlotId;
  name: string;
  arenaUserId: string | null;
  panel: CallParticipant | null;
  aura: number;
  colorRgb: string;
  hasActiveVideo: boolean;
  isLocal: boolean;
  avatarUrl: string | null;
  cellClass: string;
  uiPosClass: string;
}

export interface UseArenaLayoutTilesParams {
  expectedUids: string[];
  challengerRemoteSlots: Array<CallParticipant | null>;
  reconciledPeers: ReconciledPeer[];
  participantRoles: Record<string, BeefParticipantRowMeta>;
  auras: Record<ChallengerSlotId, number>;
  localUserId: string;
  localSessionId: string | null | undefined;
  isViewer: boolean;
}

export interface ArenaLayoutManagerProps {
  expectedUids: string[];
  challengerRemoteSlots: Array<CallParticipant | null>;
  reconciledPeers: ReconciledPeer[];
  participantRoles: Record<string, BeefParticipantRowMeta>;
  auras: Record<ChallengerSlotId, number>;
  localUserId: string;
  localSessionId: string | null | undefined;
  isViewer: boolean;
  isHost: boolean;
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
  mediatorParticipant: CallParticipant | null;
  mediatorIsLocal: boolean;
  mediatorName: string;
  auraMed: number;
  isWaitingForMediator: boolean;
  isCameraInterrupted: boolean;
  onRecoverMediaDevices: () => void | Promise<void>;
  mediatorGraceActive: boolean;
  mediatorGraceSeconds: number;
  mediatorHostId: string;
  isJoined: boolean;
  timerActive: boolean;
  timerPaused: boolean;
  beefTimeRemaining: number;
  formatBeefTime: (seconds: number) => string;
  onToggleMediatorSidebar: () => void;
  getMediatorDynamicColor: (val: number) => string;
  /** Intention camÃ©ra au PreJoin â€” court-circuite la grÃ¢ce bootstrap si false. */
  localCamEnabled?: boolean;
}
```

## `components/Arena/nexus/nexusGridTemplates.ts` (55 lignes)

```typescript
/** Classes Tailwind du conteneur grille selon le nombre de tuiles (1â€“6). */
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

/** Position du chrome (nom, DIRECT, contrÃ´les) sur une tuile Nexus. */
export function getNexusChromeUiPos(index: number, tileCount: number): string {
  if (tileCount === 2 && index === 1) {
    return 'top-[3.5rem] right-2 sm:top-[4.5rem] sm:right-4 flex-row-reverse items-start';
  }
  if (tileCount === 3 && index === 0) {
    // Haut-Gauche : Pseudo Haut-Droite (self-end), ContrÃ´les Bas-Gauche (self-start)
    return 'inset-2 sm:inset-3 flex-col justify-between !pointer-events-none [&>*:first-child]:self-end [&>*:first-child]:!pointer-events-auto [&>*:last-child]:self-start [&>*:last-child]:!pointer-events-auto';
  }
  if (tileCount === 3 && index === 1) {
    // Haut-Droite : Pseudo Haut-Gauche (self-start), ContrÃ´les Bas-Droite (self-end). pt-12 pour Ã©viter les icÃ´nes Live/Share.
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

## `components/Arena/constellation/orbitGeometry.ts` (84 lignes)

```typescript
export type ConstellationLayout = { rx: number; ry: number; centerY: number; haloVw: number };

export function computeConstellationLayout(tileCount: number, vpW: number, vpH: number): ConstellationLayout {
  if (tileCount <= 1 || vpW === 0 || vpH === 0) {
    return { rx: 0, ry: 0, centerY: 50, haloVw: 42 };
  }

  const vmin_px = Math.min(vpW, vpH);
  const isDesktop = vpW >= 1024;
  const cW = isDesktop ? vpW - 350 : vpW;
  // 220px amputÃ©s sur Mobile pour sÃ©curiser la zone de chat (bas) et le header (haut)
  const cH = isDesktop ? vpH - 80 : vpH - 220;

  const badge_vmin = (44 * 100) / vmin_px;
  const V_avail = ((cH / 2) - 44) * 100 / vmin_px;
  const H_avail = ((cW / 2) - 10) * 100 / vmin_px;

  const hasStacker = tileCount === 3 || tileCount === 5 || tileCount === 6;
  const sin_min = 0.7071;
  const sin_max = hasStacker ? 1.0 : 0.7071;
  const cos_max = 0.7071;

  let haloVw = 8;
  let ry = 0;

  if (isDesktop) {
    // --- DOCTRINE DESKTOP : Contrainte diagonale inutile, optimisation max ---
    if (hasStacker) {
      const cH_safe = ((cH / 2) / vmin_px) * 100 - 2;
      haloVw = Math.floor((cH_safe - badge_vmin) / 1.5);
      ry = Math.floor(cH_safe - (haloVw / 2));
    } else {
      haloVw = 28;
      ry = Math.floor((V_avail - (haloVw / 2)) / sin_min);
    }
  } else {
    // --- DOCTRINE MOBILE : Contrainte verticale 1D stricte conservÃ©e ---
    const num = (V_avail * sin_min) - (badge_vmin * sin_max);
    const den = sin_max + (sin_min / 2);
    let haloVw_V = Math.max(8, Math.floor(num / den));

    // BOUCLIER HORIZONTAL : EmpÃªche l'explosion de largeur sur N=4
    const haloVw_H_max = Math.floor(H_avail - 0.5);
    haloVw = Math.min(haloVw_V, haloVw_H_max);

    ry = Math.floor((V_avail - (haloVw / 2)) / sin_max);

    while (haloVw > 8 && (ry * sin_min < haloVw + badge_vmin + 0.5)) {
      haloVw -= 1;
      ry = Math.floor((V_avail - (haloVw / 2)) / sin_max);
    }
  }

  // Calcul du rayon horizontal (Bridage Ã  1.2 pour empÃªcher l'aplatissement)
  const rx_vert = Math.floor((H_avail - (haloVw / 2)) / cos_max);
  const rx = Math.floor(Math.min(rx_vert, ry * 1.2));

  return { rx, ry, centerY: 50, haloVw };
}

export function getOrbitPositionPercent(
  index: number,
  total: number,
  rx: number,
  ry: number,
  cy: number,
): { left: string; top: string } {
  let angle = 0;
  if (total === 2)
    angle = index === 0 ? (-3 * Math.PI) / 4 : Math.PI / 4;
  else if (total === 3)
    angle = ([-Math.PI / 2, (3 * Math.PI) / 4, Math.PI / 4] as number[])[index] ?? 0;
  else if (total === 4)
    angle = ([(-3 * Math.PI) / 4, -Math.PI / 4, Math.PI / 4, (3 * Math.PI) / 4] as number[])[index] ?? 0;
  else if (total === 5)
    angle = ([(-3 * Math.PI) / 4, -Math.PI / 4, Math.PI / 4, (3 * Math.PI) / 4, -Math.PI / 2] as number[])[index] ?? 0;
  else if (total === 6)
    angle = ([(-3 * Math.PI) / 4, -Math.PI / 4, Math.PI / 4, (3 * Math.PI) / 4, -Math.PI / 2, Math.PI / 2] as number[])[index] ?? 0;

  return {
    left: `calc(50% + ${rx * Math.cos(angle)}vmin)`,
    top: `calc(${cy}% + ${ry * Math.sin(angle)}vmin)`,
  };
}
```

## `components/MeetingAudioOutlet.tsx` (63 lignes)

```typescript
'use client';

import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import type { PhysicalPeer } from '@/lib/participant-identity';

const hiddenAudioStyle: CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  opacity: 0,
  pointerEvents: 'none',
  overflow: 'hidden',
};

function SingleRemoteAudio({ track }: { track: MediaStreamTrack }) {
  const ref = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const stream = new MediaStream([track]);
    el.srcObject = stream;
    void el.play().catch(() => {});
    return () => {
      el.srcObject = null;
    };
  }, [track]);

  return (
    <audio
      ref={ref}
      autoPlay
      playsInline
      style={hiddenAudioStyle}
      aria-hidden
    />
  );
}

export interface MeetingAudioOutletProps {
  peers: readonly PhysicalPeer[];
  localSessionId?: string | null;
}

/**
 * Rendu centralisÃ© du son distant Daily : une balise audio par flux entrant ayant une piste audio.
 */
export function MeetingAudioOutlet({ peers, localSessionId }: MeetingAudioOutletProps) {
  const local = localSessionId ?? '';

  const remotesWithAudio = peers.filter(
    (p) => p.audioTrack !== null && (!local || p.sessionId !== local),
  );

  return (
    <div aria-hidden className="pointer-events-none">
      {remotesWithAudio.map((p) => (
        <SingleRemoteAudio key={p.sessionId} track={p.audioTrack!} />
      ))}
    </div>
  );
}
```

## `components/MediatorSidebar.tsx` (750 lignes)

```typescript
'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  MicOff,
  Mic,
  Timer,
  Play,
  Video,
  VideoOff,
  UserX,
  Pause,
  RotateCcw,
  Radio,
} from 'lucide-react';
import { TimeWheelPicker } from '@/components/TimeWheelPicker';
import { MediatorInviteInline } from '@/components/MediatorInviteInline';

export type MediatorRemoteRow = {
  sessionId: string;
  label: string;
  slot: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  debaterId: string | null;
  audioOn: boolean;
};

type MediatorSidebarProps = {
  open: boolean;
  onClose: () => void;
  timerActive: boolean;
  beefTimerPaused: boolean;
  onPauseBeefTimer: () => void;
  onResumeBeefTimer: () => void;
  onResetBeefTimer: () => void;
  startingBeef: boolean;
  onStartBeef: (durationSec: number) => void | Promise<void>;
  onMuteAll: () => void;
  onVerdict: (kind: 'resolved' | 'closed' | 'rematch') => void;
  remoteRows: MediatorRemoteRow[];
  speakingTurnActive: boolean;
  speakingTurnPaused: boolean;
  hotMicSpeakerSlot: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | null;
  onHotMic: (slot: 'A' | 'B' | 'C' | 'D' | 'E' | 'F', durationSec: number, opts?: { force?: boolean }) => void;
  onStopSpeakingTurn: () => void;
  onPauseSpeakingTurn: () => void;
  onResumeSpeakingTurn: () => void;
  onRestartSpeakingTurn: () => void;
  beefTimeFormatted: string;
  onSetChallengerMuted: (sessionId: string, debaterId: string | null, muted: boolean) => void;
  onEjectParticipant: (sessionId: string) => void | Promise<void>;
  onAdjustTime: (deltaSec: number) => void;
  mediatorMicEnabled?: boolean;
  mediatorCamEnabled?: boolean;
  onMediatorToggleMic?: () => void | Promise<void>;
  onMediatorToggleCam?: () => void | Promise<void>;
  beefRemainingSec: number;
  maxBeefDurationSec: number;
  parolePresetSec: number;
  onParolePresetSecChange: (sec: number) => void;
  announcementText: string;
  onPublishAnnouncement: (text: string, durationSec: number) => void;
  onClearAnnouncement: () => void;
  pendingInvites: Array<{ userId: string; label: string }>;
  onAcceptPendingInvite?: (userId: string) => void;
  onRejectPendingInvite?: (userId: string) => void;
  onInviteParticipant?: (userId: string) => void | Promise<void>;
  inviteExcludeParticipantIds?: string[];
  inviteCurrentUserId?: string | null;
  networkHealthy?: boolean;
};

const SECTION_SHELL =
  'rounded-3xl border border-white/[0.08] bg-white/[0.02] p-4 shadow-[0_8px_32px_rgba(0,0,0,0.3),inset_0_1px_1px_rgba(255,255,255,0.1)] backdrop-blur-[60px]';

export function MediatorSidebar({
  open,
  onClose,
  timerActive,
  beefTimerPaused,
  onPauseBeefTimer,
  onResumeBeefTimer,
  onResetBeefTimer,
  startingBeef,
  onStartBeef,
  onMuteAll,
  onVerdict,
  remoteRows,
  speakingTurnActive,
  speakingTurnPaused,
  hotMicSpeakerSlot,
  onHotMic,
  onStopSpeakingTurn,
  onPauseSpeakingTurn,
  onResumeSpeakingTurn,
  onRestartSpeakingTurn,
  beefTimeFormatted,
  onSetChallengerMuted,
  onEjectParticipant,
  onAdjustTime: _onAdjustTime,
  mediatorMicEnabled,
  mediatorCamEnabled,
  onMediatorToggleMic,
  onMediatorToggleCam,
  beefRemainingSec,
  maxBeefDurationSec,
  parolePresetSec,
  onParolePresetSecChange,
  announcementText,
  onPublishAnnouncement,
  onClearAnnouncement,
  pendingInvites,
  onAcceptPendingInvite,
  onRejectPendingInvite,
  onInviteParticipant,
  inviteExcludeParticipantIds = [],
  inviteCurrentUserId = null,
  networkHealthy,
}: MediatorSidebarProps) {
  void _onAdjustTime;
  const [confirmVerdict, setConfirmVerdict] = useState<'resolved' | 'closed' | 'rematch' | null>(
    null,
  );
  useEffect(() => {
    if (!open) setConfirmVerdict(null);
  }, [open]);

  const [announceDraft, setAnnounceDraft] = useState('');
  const [announceDurationSec, setAnnounceDurationSec] = useState(120);
  const [speakingTurnSec, setSpeakingTurnSec] = useState(60);
  const [matchDurationMin, setMatchDurationMin] = useState(30);
  const [isSmPanel, setIsSmPanel] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 640px)');
    const apply = () => setIsSmPanel(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    setAnnounceDraft(announcementText);
    setSpeakingTurnSec(parolePresetSec);
  }, [open, announcementText, parolePresetSec]);

  const globalChronoDisplay =
    beefTimeFormatted ||
    `${Math.floor(beefRemainingSec / 60)}:${(beefRemainingSec % 60).toString().padStart(2, '0')}`;

  const deck =
    typeof document !== 'undefined'
      ? createPortal(
          <AnimatePresence>
            {open && (
              <>
                <motion.button
                  type="button"
                  aria-label="Fermer le tableau de bord"
                  className="fixed inset-0 z-[9998] cursor-default bg-black/55 backdrop-blur-[3px]"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => onClose()}
                />

                <motion.aside
                  data-mediator-regie-sheet
                  role="dialog"
                  aria-label="Command Deck"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  initial={isSmPanel ? { x: '100%', y: 0 } : { y: '100%', x: 0 }}
                  animate={{ x: 0, y: 0 }}
                  exit={isSmPanel ? { x: '100%', y: 0 } : { y: '100%', x: 0 }}
                  transition={{ type: 'spring', damping: 34, stiffness: 400 }}
                  className="fixed inset-x-0 bottom-0 z-[9999] flex h-[85dvh] flex-col overflow-hidden rounded-t-[2.5rem] border border-white/10 bg-black/50 shadow-[0_-20px_80px_rgba(0,0,0,0.6)] backdrop-blur-[80px] sm:inset-x-auto sm:inset-y-0 sm:right-0 sm:left-auto sm:ml-0 sm:h-dvh sm:w-[400px] sm:rounded-none sm:border-l sm:border-t-0"
                >
                  <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-white/25 sm:hidden" />

                  <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                    <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                      <h2 className="truncate font-mono text-sm font-black uppercase tracking-[0.2em] text-white">
                        Command Deck
                      </h2>
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
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onClose();
                      }}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/[0.08] text-white transition hover:bg-white/[0.14]"
                      aria-label="Fermer"
                    >
                      <X className="h-5 w-5" strokeWidth={1.75} />
                    </button>
                  </header>

                  <div className="hide-scrollbar flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain p-4">
                    {/* Bloc 1 â€” Urgence */}
                    <section className={`${SECTION_SHELL} border-rose-500/25 bg-gradient-to-b from-rose-950/40 to-transparent`}>
                      <p className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-rose-400/90">
                        ContrÃ´le urgence
                      </p>
                      <button
                        type="button"
                        onClick={onMuteAll}
                        className="flex min-h-[3.5rem] w-full items-center justify-center gap-3 rounded-2xl border border-rose-500/50 bg-rose-950/40 px-4 py-4 text-sm font-black uppercase tracking-widest text-rose-400 shadow-[0_4px_16px_rgba(225,29,72,0.3),inset_0_1px_1px_rgba(255,255,255,0.15)] backdrop-blur-md transition hover:bg-rose-900/50 active:scale-[0.98]"
                      >
                        <MicOff className="h-6 w-6 shrink-0" strokeWidth={2} />
                        Silence total â€” couper tous les micros
                      </button>
                    </section>

                    {/* Bloc 2 â€” Participants */}
                    <section className={SECTION_SHELL}>
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <h3 className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-blue-200/65">
                          Ring â€” participants
                        </h3>
                        <span className="rounded-full border border-white/10 bg-slate-950/40 px-2 py-0.5 font-mono text-[9px] text-blue-200/50">
                          {remoteRows.length} lien(s)
                        </span>
                      </div>
                      {remoteRows.length > 0 ? (
                        <ul className="flex flex-col gap-3">
                          {remoteRows.map((row) => {
                            const muted = !row.audioOn;
                            const hotThis = speakingTurnActive && hotMicSpeakerSlot === row.slot;
                            return (
                              <li
                                key={row.sessionId || row.slot}
                                className="flex flex-col gap-3 rounded-2xl border border-white/[0.05] bg-black/20 p-3 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)] sm:flex-row sm:items-center sm:justify-between"
                              >
                                <div className="min-w-0">
                                  <p className="truncate font-semibold text-white">
                                    @{row.label}{' '}
                                    <span className="font-mono text-[11px] font-bold text-brand-400">
                                      ({row.slot})
                                    </span>
                                  </p>
                                  {hotThis && (
                                    <p className="mt-1 font-mono text-[10px] font-bold uppercase tracking-wider text-emerald-400/90">
                                      â— Hot mic actif
                                    </p>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center justify-end gap-2">
                                  <button
                                    type="button"
                                    disabled={!row.sessionId}
                                    onClick={() => {
                                      if (!row.sessionId) return;
                                      onSetChallengerMuted(row.sessionId, row.debaterId, row.audioOn);
                                    }}
                                    className={`flex min-h-[44px] min-w-[5.5rem] items-center justify-center rounded-xl border px-3 font-mono text-[10px] font-black uppercase tracking-wide transition disabled:cursor-not-allowed disabled:opacity-35 ${
                                      muted
                                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.2),inset_0_1px_1px_rgba(255,255,255,0.1)] hover:bg-emerald-500/20'
                                        : 'border-rose-500/40 bg-rose-950/40 text-rose-400 shadow-[0_0_10px_rgba(225,29,72,0.3),inset_0_1px_1px_rgba(255,255,255,0.1)] hover:bg-rose-900/50'
                                    }`}
                                  >
                                    {muted ? (
                                      <>
                                        <Mic className="mr-1.5 h-3.5 w-3.5" />
                                        ON â€” ouvrir
                                      </>
                                    ) : (
                                      <>
                                        <MicOff className="mr-1.5 h-3.5 w-3.5" />
                                        OFF â€” couper
                                      </>
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={!row.sessionId}
                                    onClick={() => {
                                      if (!row.sessionId) return;
                                      onHotMic(row.slot, speakingTurnSec);
                                    }}
                                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 font-mono text-[10px] font-black uppercase tracking-wide text-cyan-300 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-35"
                                  >
                                    <Radio className="h-3.5 w-3.5" />
                                    Hot mic
                                  </button>
                                  <button
                                    type="button"
                                    disabled={!row.sessionId}
                                    onClick={() => void onEjectParticipant(row.sessionId)}
                                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-blue-200/55 transition hover:border-rose-500/40 hover:bg-rose-950/40 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-35"
                                    aria-label="Expulser le participant"
                                    title="Expulser"
                                  >
                                    <UserX className="h-4 w-4" />
                                  </button>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <div className="rounded-xl border border-dashed border-white/10 py-10 text-center font-mono text-[11px] uppercase tracking-widest text-blue-200/45">
                          Aucun challenger connectÃ© sur la grille
                        </div>
                      )}
                    </section>

                    {/* Bloc 3 â€” Chronos & parole */}
                    <section className={SECTION_SHELL}>
                      <h3 className="mb-4 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-blue-200/65">
                        ChronomÃ¨tres &amp; parole
                      </h3>

                      <div className="mb-6 rounded-xl border border-white/10 bg-slate-950/50 p-4">
                        <div className="mb-3 flex items-center gap-2 text-blue-200/55">
                          <Timer className="h-4 w-4 text-sky-400" strokeWidth={1.5} />
                          <span className="font-mono text-[10px] font-bold uppercase tracking-wider">
                            ChronomÃ¨tre global â€” beef
                          </span>
                        </div>
                        {!timerActive ? (
                          <>
                            <p className="mb-3 text-center text-[11px] text-blue-200/50">
                              DÃ©finissez la durÃ©e puis lancez le direct.
                            </p>
                            <div className="mb-4 flex justify-center gap-3">
                              <div className="flex flex-col items-center">
                                <input
                                  type="number"
                                  min="0"
                                  max="4"
                                  value={Math.floor(matchDurationMin / 60)}
                                  onChange={(e) => {
                                    const h = Math.max(0, Math.min(4, Number(e.target.value) || 0));
                                    const m = matchDurationMin % 60;
                                    setMatchDurationMin(h * 60 + m);
                                  }}
                                  className="w-16 rounded-xl border border-white/10 bg-black/40 py-2 text-center text-lg font-black text-white focus:border-sky-400 focus:outline-none"
                                />
                                <span className="mt-1 font-mono text-[9px] uppercase tracking-wider text-white/50">Heures</span>
                              </div>
                              <span className="self-start pt-2 text-xl font-black text-white/30">:</span>
                              <div className="flex flex-col items-center">
                                <input
                                  type="number"
                                  min="0"
                                  max="59"
                                  value={matchDurationMin % 60}
                                  onChange={(e) => {
                                    const h = Math.floor(matchDurationMin / 60);
                                    const m = Math.max(0, Math.min(59, Number(e.target.value) || 0));
                                    setMatchDurationMin(Math.max(1, h * 60 + m));
                                  }}
                                  className="w-16 rounded-xl border border-white/10 bg-black/40 py-2 text-center text-lg font-black text-white focus:border-sky-400 focus:outline-none"
                                />
                                <span className="mt-1 font-mono text-[9px] uppercase tracking-wider text-white/50">Minutes</span>
                              </div>
                            </div>
                            <button
                              type="button"
                              disabled={startingBeef}
                              onClick={() => void onStartBeef(matchDurationMin * 60)}
                              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-4 text-xs font-black uppercase tracking-widest text-black shadow-[0_8px_32px_rgba(255,255,255,0.12),inset_0_1px_1px_rgba(255,255,255,0.2)] backdrop-blur-md transition hover:bg-gray-200 active:scale-[0.99] disabled:opacity-45"
                            >
                              <Play className="h-4 w-4 fill-current" />
                              {startingBeef ? 'Ouvertureâ€¦' : 'DÃ©marrer le chrono LIVE'}
                            </button>
                          </>
                        ) : (
                          <>
                            <div
                              className={`font-mono text-center text-[2.85rem] font-black tabular-nums leading-none tracking-tighter ${beefTimerPaused ? 'animate-pulse text-amber-400' : 'text-white'}`}
                            >
                              {globalChronoDisplay}
                            </div>
                            <div className="mt-4 grid grid-cols-2 gap-2">
                              {beefTimerPaused ? (
                                <button
                                  type="button"
                                  onClick={onResumeBeefTimer}
                                  className="flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 py-3 font-mono text-[10px] font-bold uppercase text-white hover:bg-white/15"
                                >
                                  <Play className="h-3.5 w-3.5" />
                                  Reprendre
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={onPauseBeefTimer}
                                  className="flex items-center justify-center gap-2 rounded-xl border border-amber-500/40 bg-amber-600/15 py-3 font-mono text-[10px] font-bold uppercase text-amber-200 hover:bg-amber-600/25"
                                >
                                  <Pause className="h-3.5 w-3.5" />
                                  Pause
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={onResetBeefTimer}
                                className="flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] py-3 font-mono text-[10px] font-bold uppercase text-white/85 hover:bg-white/[0.1]"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                                Reset
                              </button>
                            </div>
                          </>
                        )}
                      </div>

                      <div className="rounded-xl border border-white/10 bg-slate-950/50 p-4">
                        <p className="mb-3 text-center font-mono text-[10px] font-bold uppercase tracking-widest text-blue-200/50">
                          DurÃ©e allouÃ©e au tour / Hot mic
                        </p>
                        <div className="mx-auto mb-5 flex justify-center gap-3">
                          <div className="flex flex-col items-center">
                            <input
                              type="number"
                              min="0"
                              max="10"
                              value={Math.floor(speakingTurnSec / 60)}
                              onChange={(e) => {
                                const m = Math.max(0, Math.min(10, Number(e.target.value) || 0));
                                const s = speakingTurnSec % 60;
                                const total = m * 60 + s;
                                setSpeakingTurnSec(Math.max(15, total));
                                onParolePresetSecChange(Math.max(15, total));
                              }}
                              className="w-16 rounded-xl border border-white/10 bg-black/40 py-2 text-center text-lg font-black text-cyan-400 focus:border-cyan-300 focus:outline-none"
                            />
                            <span className="mt-1 font-mono text-[9px] uppercase tracking-wider text-blue-200/50">Minutes</span>
                          </div>
                          <span className="self-start pt-2 text-xl font-black text-blue-200/30">:</span>
                          <div className="flex flex-col items-center">
                            <input
                              type="number"
                              min="0"
                              max="59"
                              step="15"
                              value={speakingTurnSec % 60}
                              onChange={(e) => {
                                const m = Math.floor(speakingTurnSec / 60);
                                const s = Math.max(0, Math.min(59, Number(e.target.value) || 0));
                                const total = m * 60 + s;
                                setSpeakingTurnSec(Math.max(15, total));
                                onParolePresetSecChange(Math.max(15, total));
                              }}
                              className="w-16 rounded-xl border border-white/10 bg-black/40 py-2 text-center text-lg font-black text-cyan-400 focus:border-cyan-300 focus:outline-none"
                            />
                            <span className="mt-1 font-mono text-[9px] uppercase tracking-wider text-blue-200/50">Secondes</span>
                          </div>
                        </div>

                        {speakingTurnActive && (
                          <div className="space-y-3">
                            <button
                              type="button"
                              onClick={onStopSpeakingTurn}
                              className="w-full rounded-2xl border-2 border-rose-500/60 bg-rose-600 py-4 font-mono text-xs font-black uppercase tracking-[0.15em] text-white shadow-[0_0_24px_rgba(225,29,72,0.35)] transition hover:bg-rose-500 active:scale-[0.99]"
                            >
                              Couper le tour de parole immÃ©diatement
                            </button>
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={speakingTurnPaused ? onResumeSpeakingTurn : onPauseSpeakingTurn}
                                className="rounded-xl border border-white/15 bg-white/[0.08] py-2.5 font-mono text-[10px] font-bold uppercase tracking-wide text-white/90 hover:bg-white/[0.12]"
                              >
                                {speakingTurnPaused ? 'Reprendre timer' : 'Pause timer'}
                              </button>
                              <button
                                type="button"
                                onClick={onRestartSpeakingTurn}
                                className="rounded-xl border border-sky-500/35 bg-sky-600/15 py-2.5 font-mono text-[10px] font-bold uppercase tracking-wide text-sky-200 hover:bg-sky-600/25"
                              >
                                RedÃ©marrer le tour
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </section>

                    {/* Bloc 4 â€” Production */}
                    <section className={SECTION_SHELL}>
                      <h3 className="mb-4 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-blue-200/65">
                        Outils de production
                      </h3>

                      <div className="mb-5 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => void onMediatorToggleMic?.()}
                          className={`flex flex-col items-center gap-1.5 rounded-2xl border px-3 py-3 transition ${
                            mediatorMicEnabled
                              ? 'border-white/12 bg-white/[0.07]'
                              : 'border-rose-500/35 bg-rose-950/30'
                          }`}
                        >
                          {mediatorMicEnabled ? (
                            <Mic className="h-5 w-5 text-white" strokeWidth={1.5} />
                          ) : (
                            <MicOff className="h-5 w-5 text-rose-400" strokeWidth={1.5} />
                          )}
                          <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-blue-200/60">
                            Mon micro
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void onMediatorToggleCam?.()}
                          className={`flex flex-col items-center gap-1.5 rounded-2xl border px-3 py-3 transition ${
                            mediatorCamEnabled
                              ? 'border-white/12 bg-white/[0.07]'
                              : 'border-rose-500/35 bg-rose-950/30'
                          }`}
                        >
                          {mediatorCamEnabled ? (
                            <Video className="h-5 w-5 text-white" strokeWidth={1.5} />
                          ) : (
                            <VideoOff className="h-5 w-5 text-rose-400" strokeWidth={1.5} />
                          )}
                          <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-blue-200/60">
                            Ma camÃ©ra
                          </span>
                        </button>
                      </div>

                      <div className="rounded-xl border border-white/10 bg-slate-950/50 p-3">
                        <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-wider text-blue-200/55">
                          BanniÃ¨re â€” message public
                        </p>
                        <label htmlFor="mediator-announce-input" className="sr-only">
                          Texte de la banniÃ¨re
                        </label>
                        <textarea
                          id="mediator-announce-input"
                          value={announceDraft}
                          onChange={(e) => setAnnounceDraft(e.target.value)}
                          rows={3}
                          placeholder="Message affichÃ© sur lâ€™arÃ¨neâ€¦"
                          className="mb-3 w-full resize-none rounded-2xl border border-white/[0.08] bg-black/40 px-4 py-3 font-sans text-sm text-white placeholder-white/30 shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)] focus:border-white/20 focus:bg-black/60 focus:outline-none"
                        />
                        <p className="mb-2 font-mono text-[9px] font-bold uppercase tracking-wider text-blue-200/45">
                          DurÃ©e dâ€™affichage
                        </p>
                        <div className="mb-3 flex flex-wrap gap-1.5">
                          {([60, 120, 300, 600] as const).map((sec) => (
                            <button
                              key={sec}
                              type="button"
                              onClick={() => setAnnounceDurationSec(sec)}
                              className={`rounded-full px-3 py-1.5 font-mono text-[9px] font-black uppercase ${
                                announceDurationSec === sec
                                  ? 'bg-amber-500/45 text-black'
                                  : 'border border-white/12 bg-white/[0.06] text-white/70 hover:bg-white/[0.1]'
                              }`}
                            >
                              {sec >= 60 ? `${sec / 60} min` : `${sec}s`}
                            </button>
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              onPublishAnnouncement(announceDraft.trim(), announceDurationSec);
                              onClose();
                            }}
                            className="rounded-full bg-amber-500 px-5 py-2.5 font-mono text-[10px] font-black uppercase tracking-wider text-black hover:bg-amber-400"
                          >
                            Publier la banniÃ¨re
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onClearAnnouncement();
                              setAnnounceDraft('');
                              onClose();
                            }}
                            className="rounded-full border border-white/15 px-5 py-2.5 font-mono text-[10px] font-black uppercase tracking-wider text-white/75 hover:bg-white/[0.08]"
                          >
                            Effacer banniÃ¨re
                          </button>
                        </div>
                      </div>

                      <div className="my-6 border-t border-white/10 pt-5">
                        <div className="mb-3 flex items-center justify-between">
                          <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-blue-200/60">
                            InvitÃ©s en attente
                          </span>
                          <span className="rounded-full border border-white/10 bg-slate-950/45 px-2 py-0.5 font-mono text-[9px] text-blue-200/65">
                            {pendingInvites.length}
                          </span>
                        </div>
                        {onInviteParticipant && (
                          <MediatorInviteInline
                            excludeParticipantIds={inviteExcludeParticipantIds}
                            currentUserId={inviteCurrentUserId}
                            onInvite={onInviteParticipant}
                          />
                        )}
                        <ul className="mt-4 space-y-2">
                          {pendingInvites.length === 0 ? (
                            <li className="rounded-xl border border-dashed border-white/10 py-6 text-center font-mono text-[10px] text-blue-200/45">
                              Aucune invitation en attente
                            </li>
                          ) : (
                            pendingInvites.map((inv) => (
                              <li
                                key={inv.userId}
                                className="flex flex-col gap-2 rounded-xl border border-white/10 bg-slate-950/50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                              >
                                <span className="min-w-0 break-words text-sm font-medium text-white/90">
                                  {inv.label}
                                </span>
                                <div className="flex shrink-0 gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onRejectPendingInvite?.(inv.userId);
                                      onClose();
                                    }}
                                    className="flex-1 min-h-[44px] rounded-xl border border-rose-500/45 bg-rose-600/85 py-2.5 font-mono text-[10px] font-black uppercase tracking-wide text-white hover:bg-rose-500 sm:flex-initial sm:px-6"
                                  >
                                    Refuser
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onAcceptPendingInvite?.(inv.userId);
                                      onClose();
                                    }}
                                    className="flex-1 min-h-[44px] rounded-xl bg-white py-2.5 font-mono text-[10px] font-black uppercase tracking-wide text-black hover:bg-gray-200 sm:flex-initial sm:px-6"
                                  >
                                    Accepter
                                  </button>
                                </div>
                              </li>
                            ))
                          )}
                        </ul>
                      </div>
                    </section>

                    {/* Bloc 5 â€” Verdict (danger) */}
                    <section
                      className={`${SECTION_SHELL} border-rose-500/30 bg-gradient-to-b from-rose-950/25 to-transparent pb-8`}
                    >
                      <div className="mb-4 flex items-center gap-2">
                        <span className="rounded bg-rose-600/85 px-2 py-0.5 font-mono text-[9px] font-black uppercase text-white">
                          Zone critique
                        </span>
                        <h3 className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-rose-400/95">
                          Verdict &amp; clÃ´ture
                        </h3>
                      </div>

                      {confirmVerdict ? (
                        <div
                          role="alert"
                          className="space-y-4 rounded-xl border-2 border-rose-500 bg-rose-950/65 p-4 shadow-[inset_0_0_0_1px_rgba(225,29,72,0.35)]"
                        >
                          <p className="text-center font-mono text-[10px] font-black uppercase tracking-widest text-rose-200">
                            Confirmation requise
                          </p>
                          <p className="text-center text-[13px] leading-snug text-rose-50/95">
                            {confirmVerdict === 'resolved'
                              ? 'Proclamer la paix terminera ou marquera le dÃ©nouement officiel.'
                              : confirmVerdict === 'rematch'
                                ? 'Une revanche restructure le flux â€” vÃ©rifiez avant dâ€™ordonner.'
                                : 'Sceller dÃ©finitivement met fin au broadcast pour tous les participants.'}
                          </p>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setConfirmVerdict(null)}
                              className="flex-1 rounded-xl border border-white/20 bg-white/10 py-3 font-mono text-[11px] font-bold uppercase text-white hover:bg-white/15"
                            >
                              Annuler
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                onVerdict(confirmVerdict);
                                setConfirmVerdict(null);
                                onClose();
                              }}
                              className="flex-[1.2] rounded-xl bg-rose-600 py-3 font-mono text-[11px] font-black uppercase text-white shadow-[0_0_20px_rgba(225,29,72,0.55)] hover:bg-rose-500"
                            >
                              ExÃ©cuter le verdict
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2.5">
                          <button
                            type="button"
                            onClick={() => setConfirmVerdict('resolved')}
                            className="w-full rounded-2xl bg-white py-3.5 font-mono text-[12px] font-black uppercase tracking-widest text-black transition hover:bg-gray-200"
                          >
                            Proclamer la paix
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmVerdict('rematch')}
                            className="w-full rounded-2xl border border-amber-500/50 bg-amber-600/18 py-3.5 font-mono text-[12px] font-black uppercase tracking-widest text-amber-200 transition hover:bg-amber-600/32"
                          >
                            Ordonner une revanche
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmVerdict('closed')}
                            className="w-full rounded-2xl border border-rose-400/55 bg-rose-950/55 py-3.5 font-mono text-[12px] font-black uppercase tracking-widest text-rose-100 transition hover:bg-rose-900/65"
                          >
                            Sceller lâ€™arÃ¨ne
                          </button>
                        </div>
                      )}
                    </section>
                  </div>
                </motion.aside>
              </>
            )}
          </AnimatePresence>,
          document.body,
        )
      : null;

  return <>{deck}</>;
}
```

## `components/_archive/DailyVideo.tsx` (34 lignes)

```typescript
'use client';

import { useRef, useState } from 'react';
import { PreJoinScreen } from '../PreJoinScreen';

interface DailyVideoProps {
  roomUrl: string;
  userName?: string;
}

export function DailyVideo({ roomUrl, userName = 'User' }: DailyVideoProps) {
  const [phase, setPhase] = useState<'prejoin' | 'joined'>('prejoin');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const dailyUrl = `${roomUrl}?name=${encodeURIComponent(userName)}&showLeaveButton=true&showFullscreenButton=true`;

  if (phase === 'prejoin') {
    return (
      <PreJoinScreen userName={userName} onJoin={(_cam, _mic) => setPhase('joined')} />
    );
  }

  return (
    <div className="w-full h-full relative">
      <iframe
        ref={iframeRef}
        src={dailyUrl}
        allow="camera *; microphone *; fullscreen *; speaker *; display-capture *; autoplay *"
        className="absolute inset-0 w-full h-full border-0 rounded-xl"
        title="Daily.co Video Call"
      />
    </div>
  );
}
```

