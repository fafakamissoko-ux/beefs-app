# Rapport d'audit — Matrice de positionnement arène (Phase J.1 redux)

**Date d'extraction :** 2026-05-31  
**Branche :** `main` (post I.1)  
**Objectif :** Recalibrer l'ancrage du chat mobile sans bloquer les halos interactifs ; corriger l'algorithme `getUsernameColor`.  
**Contrainte :** Zéro modification du code source.

---

## 1. Templates de grille — `components/Arena/nexus/nexusGridTemplates.ts`

**Rôle :** Matrice de division d'écran Nexus (1–6 challengers) + placement du chrome (pseudo, DIRECT, contrôles) par tuile.

**Consommateurs :** `NexusGrid.tsx`, `useArenaLayoutTiles.ts` (via `tile.uiPosClass` / `tile.cellClass`).

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

### Synthèse matrice mobile (Nexus, 1–4 challengers)

| Tuiles | Grille conteneur | Cellules spéciales | Chrome par index |
|--------|------------------|--------------------|------------------|
| **1** | `1×1` plein écran | — | Tous : `top-2 left-2` |
| **2** | `2 cols × 1 row` (côte à côte) | — | idx 0 : `top-2 left-2` ; idx 1 : `top-[3.5rem] right-2 flex-row-reverse` |
| **3** | `2×2`, tuile 2 en `col-span-2` (bandeau bas) | index 2 = pleine largeur bas | idx 0 : coins opposés (pseudo HD, contrôles BG) ; idx 1 : idem + `pt-12` ; idx 2 : barre horizontale `justify-between` |
| **4** | `2×2` | — | idx 3 : `top-2 right-2 flex-col items-end` ; autres : défaut `top-2 left-2` |

---

## 2. Surface vidéo — Halos interactifs + contrôles locaux

**Fichier :** `components/Arena/shared/ArenaVideoSurface.tsx`  
*(Note : chemin `shared/`, pas `nexus/`)*

### 2a. Calcul visuel Aura/Halo (l.61–67, appliqué l.166–170)

```tsx
  const auraShadow =
    tile.aura > 0
      ? `0 0 ${20 + Math.min(tile.aura, 120) * 0.8}px rgba(${tile.colorRgb}, 0.4), inset 0 0 40px rgba(${tile.colorRgb}, 0.15)`
      : 'inset 0 0 20px rgba(255,255,255,0.02)';
  const filterVal = isMutedByFocus
    ? 'grayscale(0.6) blur(3px)'
    : `brightness(${1 + (tile.aura / 300) * 0.4})`;
```

```tsx
    <motion.div
      className={`relative h-full w-full bg-transparent backdrop-blur-2xl transition-all duration-300 ${roundedClass} ${variant === 'nexus' ? tile.cellClass : ''} ${variant === 'nexus' ? 'overflow-hidden' : ''}`}
      style={{
        boxShadow: auraShadow,
        zIndex: tile.aura > 0 ? 10 : 1,
        opacity: isMutedByFocus ? 0.4 : 1,
      }}
    >
```

### 2b. Zone interactive Halo (tap support) — l.172–212

**Point critique J.1 :** `<button className="absolute inset-0 z-[28] ...">` couvre toute la tuile. Les spectateurs tapent ici pour `onTapSupport` / `onPreferSide`. Tout overlay parent avec `pointer-events-auto` au-dessus de cette zone bloque les halos.

```tsx
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
            enableAutoPiP={isActiveSpeaker || tile.isLocal}
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
```

### 2c. `localControls` — l.81–127

```tsx
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
        className={`flex h-9 w-9 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-full border backdrop-blur-[60px] transition-all duration-300 active:scale-95 ${micEnabled && !micMutedByMediator ? 'border-white/20 bg-white/10 text-white hover:bg-white/20 shadow-[0_4px_16px_rgba(255,255,255,0.1),inset_0_1px_1px_rgba(255,255,255,0.4)]' : 'border-rose-500/50 bg-rose-950/40 text-rose-400 shadow-[0_0_15px_rgba(225,29,72,0.4),inset_0_1px_1px_rgba(255,255,255,0.1)]'}`}
      >
        <Mic className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={1.75} />
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleCam();
        }}
        className={`flex h-9 w-9 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-full border backdrop-blur-[60px] transition-all duration-300 active:scale-95 ${camEnabled ? 'border-white/20 bg-white/10 text-white hover:bg-white/20 shadow-[0_4px_16px_rgba(255,255,255,0.1),inset_0_1px_1px_rgba(255,255,255,0.4)]' : 'border-rose-500/50 bg-rose-950/40 text-rose-400 shadow-[0_0_15px_rgba(225,29,72,0.4),inset_0_1px_1px_rgba(255,255,255,0.1)]'}`}
      >
        <Video className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={1.75} />
      </button>
      {onFlipCamera && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onFlipCamera();
          }}
          className="flex h-9 w-9 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white backdrop-blur-[60px] transition-all hover:bg-white/20 active:scale-95 shadow-[0_4px_16px_rgba(255,255,255,0.1),inset_0_1px_1px_rgba(255,255,255,0.4)] md:hidden"
          title="Basculer la caméra"
        >
          <SwitchCamera className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={1.75} />
        </button>
      )}
    </div>
  ) : null;
```

### 2d. Montage chrome Nexus (contexte z-index) — l.72–79, l.235–248

**Chrome overlay :** `absolute z-[140]` — au-dessus du halo tap `z-[28]`.

```tsx
  const chromePointer =
    variant === 'nexus' && tileCount === 3 && tileIndex === 2 ? '' : 'pointer-events-auto';

  const nexusChromeClass = `absolute z-[140] flex gap-1.5 ${tile.uiPosClass} ${
    variant === 'nexus' && tileCount === 3 && (tileIndex === 0 || tileIndex === 1)
      ? 'pointer-events-none'
      : chromePointer
  }`;
```

```tsx
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
```

### Référence z-index (collision chat mobile)

| Couche | z-index | pointer-events |
|--------|---------|----------------|
| Halo tap (support) | `z-[28]` | auto sur tuiles distantes |
| Chrome pseudo/contrôles | `z-[140]` | sélectif (`pointer-events-none` + enfants auto en 3-tuiles) |
| Overlay chat mobile (`TikTokStyleArena`) | `z-[160]` | parent `none`, bulles/dock `auto` |
| Header Live/DM/Menu mobile | `z-[500]` | mixte |

---

## 3. Composant Chat — `components/ArenaChatMessages.tsx`

**Cible correction :** `getUsernameColor` — doublon `'text-cyan-400'` (indices 0 et 3), palette réduite à 6 entrées dont 2 identiques → collisions visuelles probables.

```tsx
'use client';

import { useLayoutEffect, useRef } from 'react';
import { useArenaVolatileStore } from '@/lib/stores/arenaVolatileStore';

const getUsernameColor = (username: string) => {
  const colors = [
    'text-cyan-400',
    'text-emerald-400',
    'text-amber-400',
    'text-cyan-400',
    'text-rose-400',
    'text-sky-400',
  ];
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

interface ArenaChatMessagesProps {
  isMobile?: boolean;
}

export function ArenaChatMessages({ isMobile }: ArenaChatMessagesProps) {
  const messages = useArenaVolatileStore((s) => s.messages);
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (endRef.current) {
      endRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages]);

  const containerClasses = isMobile
    ? 'pointer-events-none w-fit max-w-[85%] min-w-[50%] max-h-[30vh] overflow-y-auto overscroll-contain touch-pan-y px-3 mb-2 flex flex-col hide-scrollbar'
    : 'flex-1 overflow-y-auto pl-2 pr-4 py-2 hide-scrollbar';

  return (
    <div ref={scrollRef} className={containerClasses}>
      <div className="mt-auto flex flex-col justify-end">
        {messages.map((msg) =>
          isMobile ? (
            <div
              key={msg.id}
              className="mb-2 pointer-events-auto w-fit max-w-[70%] leading-tight [content-visibility:auto]"
            >
              <span className={`text-[11px] font-bold mr-2 drop-shadow-[0_1px_2px_rgba(0,0,0,1)] ${getUsernameColor(msg.user_name)}`}>
                {msg.user_name}
              </span>
              <span className="text-[13px] text-white font-medium break-all drop-shadow-md [text-shadow:0_1px_3px_rgba(0,0,0,1),0_0_8px_rgba(0,0,0,0.8)]">
                {msg.content}
              </span>
            </div>
          ) : (
            <div key={msg.id} className="mb-3 [content-visibility:auto]">
              <span className={`block mb-1 ml-2 text-[9px] font-black uppercase tracking-widest ${getUsernameColor(msg.user_name)}`}>
                {msg.user_name}
              </span>
              <div className="inline-block rounded-2xl rounded-tl-sm bg-slate-900/40 backdrop-blur-sm border border-white/10 shadow-lg px-3 py-2 text-[13px] leading-snug text-white/90">
                {msg.content}
              </div>
            </div>
          ),
        )}
        <div ref={endRef} className="h-px w-full shrink-0" />
      </div>
    </div>
  );
}
```

---

*Fin du rapport — extraction matrice layout redux (zéro modification).*
