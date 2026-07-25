# Rapport d'audit — Phase D (Grille vidéo UI + filtre challengers is_main)

**Date d'extraction :** 2026-07-20  
**Commit de référence :** `f24ef96 feat(arena): wire viewer HUD and modal to Supabase Presence (Phase B.2)`  
**Contrainte :** Zéro modification du code source.

---

## Synthèse diagnostic Phase D

### A. Layout Manager & nœuds vidéo

| Fichier | Lignes | Rôle |
|---------|--------|------|
| `components/Arena/ArenaLayoutManager.tsx` | 218 | Orchestrateur `nexus` / `constellation`, délègue tuiles à `NexusGrid` / `ConstellationOrbit` |
| `components/Arena/shared/ArenaVideoSurface.tsx` | 240 | **Nœud individuel** (pas de `ArenaNode.tsx`) — chrome mic/cam + badge pseudo |
| `components/Arena/useArenaLayoutTiles.ts` | 118 | VM tuiles depuis `expectedUids` — hors scope extraction mais alimente la grille |

**Verdict UI (boutons empilés slot supérieur) :** le conteneur flex mic/cam est dans `ArenaVideoSurface.tsx` :

| Zone | Ligne | Comportement actuel | Cible patch |
|------|-------|---------------------|-------------|
| `localControls` wrapper | L.80–83 | `flex flex-wrap … gap-1` | Risque d'empilement vertical si largeur contrainte |
| Nexus 3 joueurs slots 0/1 | L.223–227 | `nexusChromeClass` : pseudo + controls en **colonne** (`flex` implicite block) | Réorganiser flex direction / gap |
| Nexus 3 joueurs slot 2 (haut) | L.74–78, L.229–236 | `tile.uiPosClass` positionne chrome ; `pointer-events-none` sur slots 0/1 | Slot 2 = slot **supérieur** — vérifier `uiPosClass` + empilement |
| Constellation slot 0 / index 4 | L.207–211 | Controls **au-dessus** de la tuile (`bottom-[calc(100%+12px)]`) | Patch positionnement si collision |

**`ArenaLayoutManager`** ne contient **pas** les boutons — il passe `onToggleMic` / `onToggleCam` via `surfaceProps` (L.133–148).

---

### B. Identité participants & filtre is_main

| Zone | Fichier | Ligne | État |
|------|---------|-------|------|
| `BeefParticipantRowMeta` | `lib/participant-identity.ts` | L.82–87 | **Pas** de champ `isMain` |
| Fetch DB `is_main` | `TikTokStyleArena.tsx` (hors extraction) | L.759 | Colonne lue |
| Mapping roles | `TikTokStyleArena.tsx` | L.814–819 | `is_main` **non propagé** dans `BeefParticipantRowMeta` |
| `expectedUids` | `TikTokStyleArena.tsx` | L.829–837 | Tous les `accepted` non-médiateur — **inclut raise-hand / non-main** |
| `reconcilePeers` | `participant-identity.ts` | L.208–298 | Orphelins → slots libres (`kind: 'orphan'`) |

**Verdict logique VS :** ajouter `isMain: boolean` à `BeefParticipantRowMeta`, le remplir dans `loadParticipants`, filtrer `expectedUids` / `validData` sur `is_main === true` pour l'écran VS.

---

## 1. Code source intégral — `components/Arena/ArenaLayoutManager.tsx`

```tsx
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
    onFlipCamera,
    webrtcNetworkQuality,
    activeSpeakerPeerId,
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
    onFlipCamera,
    webrtcNetworkQuality,
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
    <div className="absolute inset-0 z-0 bg-transparent p-1 sm:p-2 -translate-y-[10dvh] lg:translate-y-0">
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
              activeSpeakerPeerId={activeSpeakerPeerId ?? null}
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
              activeSpeakerPeerId={activeSpeakerPeerId ?? null}
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

---

## 2. Code source intégral — `components/Arena/shared/ArenaVideoSurface.tsx` (Nœud tuile — toggleMic / toggleCam)

```tsx
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
      className={`flex flex-wrap shrink-0 items-center gap-1 sm:gap-1.5 min-w-0 max-w-full ${tileCount === 3 && tileIndex === 2 && variant === 'nexus' ? 'pointer-events-auto' : ''}`}
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
        className={`flex h-8 w-8 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-full border backdrop-blur-[60px] transition-all duration-300 active:scale-95 ${micEnabled && !micMutedByMediator ? 'border-white/20 bg-white/10 text-white hover:bg-white/20 shadow-[0_4px_16px_rgba(255,255,255,0.1),inset_0_1px_1px_rgba(255,255,255,0.4)]' : 'border-rose-500/50 bg-rose-950/40 text-rose-400 shadow-[0_0_15px_rgba(225,29,72,0.4),inset_0_1px_1px_rgba(255,255,255,0.1)]'}`}
      >
        <Mic className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={1.75} />
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleCam();
        }}
        className={`flex h-8 w-8 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-full border backdrop-blur-[60px] transition-all duration-300 active:scale-95 ${camEnabled ? 'border-white/20 bg-white/10 text-white hover:bg-white/20 shadow-[0_4px_16px_rgba(255,255,255,0.1),inset_0_1px_1px_rgba(255,255,255,0.4)]' : 'border-rose-500/50 bg-rose-950/40 text-rose-400 shadow-[0_0_15px_rgba(225,29,72,0.4),inset_0_1px_1px_rgba(255,255,255,0.1)]'}`}
      >
        <Video className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={1.75} />
      </button>
    </div>
  ) : null;

  const pseudoBadge = (
    <div className="flex min-w-0 max-w-full flex-col items-center gap-1">
      <div className="flex min-w-0 max-w-full overflow-hidden items-center gap-2 rounded-full border border-white/[0.08] bg-slate-900/40 px-3 py-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_1px_rgba(255,255,255,0.1)] backdrop-blur-[40px] sm:px-4 sm:py-2">
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
          className={`relative min-w-0 flex items-center overflow-hidden w-fit max-w-[80px] sm:max-w-[120px] text-left text-[10px] font-black tracking-wide text-white hover:text-cyan-400 drop-shadow-md sm:text-[11px]`}
        >
          {/* Si grille 5/6 joueurs ET nom long (> 8 chars), activer marquee. Sinon, truncate simple */}
          <span className={`${tileCount >= 5 && tile.name.length > 8 ? 'animate-marquee-pseudo' : 'truncate w-full'}`}>
            @{tile.name}
          </span>
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
              className={`pointer-events-auto absolute left-1/2 z-[150] flex w-full max-w-[90px] sm:max-w-none -translate-x-1/2 flex-wrap justify-center items-center gap-1.5 sm:gap-2 ${
                (tileCount === 3 && tileIndex === 0) || ((tileCount === 5 || tileCount === 6) && tileIndex === 4)
                  ? 'bottom-[calc(100%+12px)] lg:bottom-[calc(100%+4px)]'
                  : 'top-[calc(100%+2.5rem)]'
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

## 3. Code source intégral — `lib/participant-identity.ts` (Types identité)

```ts
/**
 * Identité des participants Daily ↔ profils Supabase (beef_participants / users).
 * - userData.arenaUserId : alignement fort (UUID uniquement, côté client issu de la session).
 * - Noms : normalisation pour limiter les faux négatifs sans ouvrir des matchs arbitraires.
 */

export const ARENA_USER_DATA_KEY = 'arenaUserId' as const;

/** UUID RFC (versions 1–8), rejet des chaînes arbitraires dans userData. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidArenaUserId(value: string): boolean {
  return UUID_RE.test(value.trim());
}

/**
 * Identité arena : priorité au `user_id` Daily issu d’un meeting token serveur (UUID),
 * sinon userData client (rétrocompat / secours).
 */
export function extractArenaUserIdFromDailyParticipant(p: {
  user_id?: string;
  userData?: unknown;
}): string | null {
  const uidRaw = typeof p.user_id === 'string' ? p.user_id.trim() : '';
  if (uidRaw && isValidArenaUserId(uidRaw)) return uidRaw.toLowerCase();
  return parseTrustedArenaUserId(p.userData);
}

export function parseTrustedArenaUserId(userData: unknown): string | null {
  if (userData === null || userData === undefined || typeof userData !== 'object') return null;
  const raw = (userData as Record<string, unknown>)[ARENA_USER_DATA_KEY];
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!isValidArenaUserId(t)) return null;
  return t.toLowerCase();
}

export function normalizeParticipantLabel(raw: string): string {
  if (!raw) return '';
  return raw
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('und');
}

/**
 * Alias normalisés pour rapprocher user_name Daily de users.display_name / username.
 */
export function buildParticipantAliasSet(
  displayName: string | null | undefined,
  username: string | null | undefined,
  fallbackLabel: string,
): string[] {
  const dn = (displayName ?? '').trim();
  const un = (username ?? '').trim();
  const out = new Set<string>();
  const add = (s: string) => {
    const n = normalizeParticipantLabel(s);
    if (n) out.add(n);
  };
  add(dn);
  add(un);
  if (dn && un) {
    add(`${dn} ${un}`);
    add(`${un} ${dn}`);
  }
  const primary = dn || un;
  if (primary) add(primary);
  const genericParticipant = normalizeParticipantLabel('Participant');
  const fbNorm = normalizeParticipantLabel(fallbackLabel);
  if (dn || un) {
    add(fallbackLabel);
  } else if (fbNorm && fbNorm !== genericParticipant) {
    add(fallbackLabel);
  }
  return [...out];
}

/** Métadonnées beef_participants + alias pour rapprochement Daily. */
export interface BeefParticipantRowMeta {
  role: string;
  name: string;
  matchAliases: string[];
  avatarUrl: string | null;
}

/** Remote Daily correspond au médiateur (présence / grâce). */
export function remoteMatchesMediator(
  remote: { userName: string; arenaUserId: string | null },
  mediatorUserId: string,
  mediatorDisplayName: string,
): boolean {
  const mid = mediatorUserId.trim().toLowerCase();
  if (remote.arenaUserId && remote.arenaUserId === mid) return true;
  const nu = normalizeParticipantLabel(remote.userName);
  const mn = normalizeParticipantLabel(mediatorDisplayName);
  return nu.length > 0 && mn.length > 0 && nu === mn;
}

/**
 * Remote = challenger (ou témoin) attendu dans beef_participants, pas le médiateur.
 * Priorité : arenaUserId (UUID validé côté join) puis alias de profil uniquement pour les user_id connus.
 */
export function matchRemoteToExpectedBeefParticipant(
  remote: { userName: string; arenaUserId: string | null },
  mediatorUserId: string,
  mediatorDisplayName: string,
  roles: Record<string, BeefParticipantRowMeta>,
): { userId: string; role: string } | null {
  const mid = mediatorUserId.trim().toLowerCase();
  if (remote.arenaUserId && remote.arenaUserId === mid) return null;
  const nu = normalizeParticipantLabel(remote.userName);
  const mn = normalizeParticipantLabel(mediatorDisplayName);
  if (nu && mn && nu === mn) return null;

  if (remote.arenaUserId && remote.arenaUserId !== mid) {
    const row = roles[remote.arenaUserId];
    if (row) return { userId: remote.arenaUserId, role: row.role };
  }
  if (!nu) return null;
  for (const [uid, meta] of Object.entries(roles)) {
    if (uid === mid) continue;
    if (meta.matchAliases.includes(nu)) return { userId: uid, role: meta.role };
  }
  return null;
}

export function buildDailyJoinUserData(arenaUserId: string | null | undefined): Record<string, string> | undefined {
  if (!arenaUserId || !isValidArenaUserId(arenaUserId)) return undefined;
  return { [ARENA_USER_DATA_KEY]: arenaUserId.trim().toLowerCase() };
}

// ── PhysicalPeer + réconciliation « Tabula Rasa » (Phase 2 — aucun flux détruit) ──

/**
 * Représentation brute d’un pair WebRTC Daily (pistes + identité extraite).
 */
export interface PhysicalPeer {
  sessionId: string;
  /** `user_name` Daily */
  displayName: string;
  videoTrack: MediaStreamTrack | null;
  audioTrack: MediaStreamTrack | null;
  isLocal: boolean;
  arenaUserId: string | null;
  videoTrackState?: string;
  audioTrackState?: string;
}

export interface SemanticIdentity {
  arenaUserId: string | null;
  role: string;
  /** 0…5 grille challengers ; -1 médiateur ; orphelins remplissent les trous */
  expectedSlotIndex: number;
  kind: 'expected' | 'orphan';
}

export interface ReconciledPeer {
  physical: PhysicalPeer;
  semantic: SemanticIdentity;
}

export interface ReconcileExpectedRoles {
  mediatorUserId: string;
  mediatorDisplayName: string;
  challengerUidsOrdered: string[];
  roles: Record<string, BeefParticipantRowMeta>;
}

/** Étiquette UI lorsqu’aucun passeport DB ne matche (flux toujours conservé). */
export const ORPHAN_GUEST_ROLE = 'guest' as const;
export const ORPHAN_GUEST_LABEL = 'Invité';

function isMediatorPeerPhysical(
  p: PhysicalPeer,
  mediatorUserId: string,
  mediatorDisplayName: string,
): boolean {
  const mid = mediatorUserId.trim().toLowerCase();
  if (p.arenaUserId && p.arenaUserId === mid) return true;
  const nu = normalizeParticipantLabel(p.displayName);
  const mn = normalizeParticipantLabel(mediatorDisplayName);
  return nu.length > 0 && mn.length > 0 && nu === mn;
}

function matchNameToUidPhysical(
  displayName: string,
  mediatorUserId: string,
  roles: Record<string, BeefParticipantRowMeta>,
): string | null {
  const nu = normalizeParticipantLabel(displayName);
  if (!nu) return null;
  const mid = mediatorUserId.trim().toLowerCase();
  for (const [uid, meta] of Object.entries(roles)) {
    if (uid === mid) continue;
    if (meta.matchAliases.includes(nu)) return uid;
  }
  return null;
}

/**
 * Associe chaque flux physique à une identité sémantique.
 * **Règle absolue :** la sortie a **exactement** une entrée par `physicalPeers` (même ordre) —
 * un pair non reconnu n’est **jamais** filtré : il devient `kind: 'orphan'`, `role: 'guest'`, slot libre.
 */
export function reconcilePeers(
  physicalPeers: readonly PhysicalPeer[],
  expected: ReconcileExpectedRoles,
): ReconciledPeer[] {
  const { mediatorUserId, mediatorDisplayName, challengerUidsOrdered, roles } = expected;
  const nSlots = 6;
  const slotUsed: boolean[] = Array.from({ length: nSlots }, () => false);
  const assigned = new Map<string, SemanticIdentity>();
  const needPhysical = [...physicalPeers];

  const takeFirstEmptySlot = (): number => {
    for (let i = 0; i < nSlots; i++) {
      if (!slotUsed[i]) {
        slotUsed[i] = true;
        return i;
      }
    }
    return nSlots - 1;
  };

  const markSlot = (idx: number) => {
    if (idx >= 0 && idx < nSlots) slotUsed[idx] = true;
  };

  /** 1 — Médiateur */
  for (const p of needPhysical) {
    if (assigned.has(p.sessionId)) continue;
    if (isMediatorPeerPhysical(p, mediatorUserId, mediatorDisplayName)) {
      const meta = roles[mediatorUserId.trim().toLowerCase()];
      assigned.set(p.sessionId, {
        arenaUserId: mediatorUserId.trim().toLowerCase(),
        role: meta?.role ?? 'mediator',
        expectedSlotIndex: -1,
        kind: 'expected',
      });
    }
  }

  /** 2 — UUID challenger attendu */
  for (const p of needPhysical) {
    if (assigned.has(p.sessionId)) continue;
    if (!p.arenaUserId) continue;
    const uid = p.arenaUserId;
    const mid = mediatorUserId.trim().toLowerCase();
    if (uid === mid) continue;
    const idx = challengerUidsOrdered.indexOf(uid);
    if (idx >= 0 && idx < nSlots && roles[uid]) {
      markSlot(idx);
      assigned.set(p.sessionId, {
        arenaUserId: uid,
        role: roles[uid].role,
        expectedSlotIndex: idx,
        kind: 'expected',
      });
    }
  }

  /** 3 — Alias pseudo → UID */
  for (const p of needPhysical) {
    if (assigned.has(p.sessionId)) continue;
    const uid = matchNameToUidPhysical(p.displayName, mediatorUserId, roles);
    if (!uid || uid === mediatorUserId.trim().toLowerCase()) continue;
    const idx = challengerUidsOrdered.indexOf(uid);
    if (idx >= 0 && idx < nSlots && roles[uid]) {
      markSlot(idx);
      assigned.set(p.sessionId, {
        arenaUserId: uid,
        role: roles[uid].role,
        expectedSlotIndex: idx,
        kind: 'expected',
      });
    }
  }

  /** 4 — Orphelins : **conserver** le flux, slot vide, rôle invité (pas de suppression) */
  for (const p of physicalPeers) {
    if (assigned.has(p.sessionId)) continue;
    const slot = takeFirstEmptySlot();
    assigned.set(p.sessionId, {
      arenaUserId: p.arenaUserId,
      role: ORPHAN_GUEST_ROLE,
      expectedSlotIndex: slot,
      kind: 'orphan',
    });
  }

  return physicalPeers.map((p) => ({
    physical: p,
    semantic: assigned.get(p.sessionId)!,
  }));
}

```
