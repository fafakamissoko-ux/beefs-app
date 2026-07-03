# Rapport d'audit — Phase M.1

**Date d'extraction :** 2026-07-03  
**Branche :** `main` (post L.1 — commit `d7215cd`)  
**Objectifs M.1 :** Corriger quinconce grilles 5/6 (halos hors écran), refonte Splash Premium Glass, logos OAuth.  
**Contrainte :** Zéro modification du code source.

---

## 1. Grille Nexus

### 1a. `components/Arena/nexus/nexusGridTemplates.ts` (intégralité)

**État post-L.1 :** `tileCount >= 5` → chrome centré (`left-1/2 -translate-x-1/2`).  
**Cible M.1 :** disposition quinconce 5/6 — `getNexusCellClass` pour 5 tuiles uniquement, **aucune règle pour 6**.

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
  if (tileCount >= 5) {
    // Pour 5 ou 6 joueurs, les tuiles sont trop étroites. On centre le chrome en haut.
    return 'top-2 left-1/2 -translate-x-1/2 flex-col items-center max-w-[90%]';
  }
  return 'top-2 left-2 sm:top-4 sm:left-4 flex-row items-start max-w-[90%]';
}
```

### 1b. `components/Arena/nexus/NexusGrid.tsx` (intégralité)

**Conteneur grille :** `relative h-full w-full grid gap-1 sm:gap-2 ${gridClass}` — pas de `min-w-0` / `overflow-hidden` sur la grille.

```tsx
'use client';

import type { ChallengerSlotId } from '@/lib/arena-slots';
import type { ArenaTileVM } from '../types';
import { ArenaVideoSurface, type ArenaVideoSurfaceProps } from '../shared/ArenaVideoSurface';
import { getNexusGridClass } from './nexusGridTemplates';

export type NexusGridProps = Omit<
  ArenaVideoSurfaceProps,
  'tile' | 'tileCount' | 'tileIndex' | 'variant' | 'isSpeaking' | 'isMutedByFocus' | 'isActiveSpeaker'
> & {
  tiles: ArenaTileVM[];
  speakingTurnActive: boolean;
  effectiveHotMicSpeakerSlot: ChallengerSlotId | null;
  activeSpeakerPeerId: string | null;
};

export function NexusGrid({
  tiles,
  speakingTurnActive,
  effectiveHotMicSpeakerSlot,
  activeSpeakerPeerId,
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
        const isActiveSpeaker =
          !!activeSpeakerPeerId && tile.panel?.sessionId === activeSpeakerPeerId;

        return (
          <ArenaVideoSurface
            key={tile.id}
            tile={tile}
            tileCount={tileCount}
            tileIndex={idx}
            variant="nexus"
            isSpeaking={isSpeaking}
            isMutedByFocus={isMutedByFocus}
            isActiveSpeaker={isActiveSpeaker}
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

### Annexe — Coquille parente (`ArenaLayoutManager.tsx`, l.176)

**Padding externe :** `absolute inset-0 z-0 bg-transparent p-1 sm:p-2`  
→ Réduit la zone utile ; halos (`box-shadow` sur tuile) peuvent dépasser sans `overflow-hidden` sur la grille.

---

## 2. Splash Screen

**Fichier identifié :** `app/page.tsx` — composant exporté `SplashScreen` (pas de `components/SplashScreen.tsx` actif).  
**Archive :** `components/_archive/LoadingScreen.tsx` (non utilisé en prod).

**Tagline :** `L'Agora des règlements de comptes` (l.62).

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { BeefLogo } from '@/components/BeefLogo';

export default function SplashScreen() {
  const router = useRouter();
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setProgress((p) => (p >= 100 ? 100 : p + 2)), 20);
    const timer = setTimeout(async () => {
      const { supabase } = await import('@/lib/supabase/client');
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) {
        const { data } = await supabase
          .from('users')
          .select('needs_arena_username')
          .eq('id', session.user.id)
          .maybeSingle();
        if (data?.needs_arena_username) router.push('/onboarding');
        else router.push('/feed');
      } else {
        router.push('/feed');
      }
    }, 1500);
    return () => {
      clearInterval(interval);
      clearTimeout(timer);
    };
  }, [router]);

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden bg-transparent">
      <div className="absolute inset-0 animate-pulse bg-[radial-gradient(circle_at_center,rgba(0,240,255,0.1)_0%,transparent_60%)]" />
      <div className="relative z-10 flex flex-col items-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.8 }}
          className="relative mb-6"
        >
          <div className="absolute inset-0 animate-pulse rounded-full bg-cyan-500/20 blur-2xl" />
          <BeefLogo size={100} />
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-2 pr-2 text-5xl font-black uppercase italic tracking-tighter text-white drop-shadow-md md:text-7xl"
        >
          Beefs
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-cyan-400 text-[11px] md:text-sm font-black uppercase tracking-[0.2em] shadow-glow-brand mb-12 text-center px-4"
        >
          L&apos;Agora des règlements de comptes
        </motion.p>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-1 w-48 overflow-hidden rounded-full bg-white/10">
          <motion.div
            className="h-full bg-gradient-to-r from-cyan-600 to-cyan-400"
            style={{ width: `${progress}%` }}
          />
        </motion.div>
      </div>
    </div>
  );
}
```

**Design actuel vs Premium Glass :** fond transparent + gradient radial cyan ; pas de `backdrop-blur`, pas de carte verre, barre de progression simple.

---

## 3. Circuit OAuth — Bouton Google

**Fichier :** `app/login/page.tsx`  
**Pas de `AuthModal.tsx` / `LoginDialog.tsx` dans le repo actif.**

**Icône actuelle :** composant inline `GoogleIcon` (SVG multicolore, l.30–38) — **pas d'image fichier**.

**Assets OAuth présents sur disque (non référencés dans le JSX login) :**
- `public/google-oauth-logo-120.png`
- `public/google-oauth-logo-512.png`

### Composant `GoogleIcon` (l.30–38)

```tsx
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}
```

### Bouton Google (JSX, l.196–212)

```tsx
          <button
            type="button"
            onClick={() => void handleGoogle()}
            disabled={googleLoading}
            aria-busy={googleLoading}
            aria-label="Continuer avec Google"
            className="mb-5 flex w-full items-center justify-center gap-3 rounded-full border border-white/10 bg-white/95 py-3.5 text-sm font-semibold text-gray-800 transition-all hover:bg-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {googleLoading ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-gray-400 border-t-gray-800" />
            ) : (
              <>
                <GoogleIcon className="h-5 w-5" />
                <span>Continuer avec Google</span>
              </>
            )}
          </button>
```

### Handler OAuth (contexte, l.90–101)

```tsx
  const handleGoogle = async () => {
    setGoogleLoading(true);
    setOauthError(null);
    const { error } = await signInWithGoogle();
    if (error) {
      const msg =
        typeof error === 'object' && error !== null && 'message' in error
          ? String((error as { message?: string }).message)
          : 'Erreur lors de la connexion avec Google.';
      setOauthError(msg);
      setGoogleLoading(false);
    }
  };
```

**Backend :** `contexts/AuthContext.tsx` — `signInWithGoogle()` (Supabase OAuth).

---

*Fin du rapport — extraction Phase M.1 (zéro modification).*
