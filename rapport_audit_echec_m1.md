# Rapport d'audit — Échec perçu Phase M.1

**Date d'extraction :** 2026-07-03  
**Branche :** `main` (HEAD `2ac3cba`)  
**Contexte :** Radiographie post-déploiement — géométrie Nexus 5/6, Splash Premium Glass, logo OAuth Google.  
**Contrainte :** Zéro modification du code source.

---

## Synthèse exécutive (état repo vs symptômes)

| Cible M.1 | Présent dans `main` ? | Observation |
|-----------|----------------------|-------------|
| Grille 5/6 symétrique | ⚠️ Partiel | `getNexusGridClass` / `getNexusCellClass` : **logique identique à L.1**, seuls commentaires ajoutés en M.1 |
| `min-w-0 overflow-hidden` NexusGrid | ✅ Oui | L.29 `NexusGrid.tsx` |
| Splash Premium Glass | ✅ Oui | `app/page.tsx` — ancien gradient + barre progress **absents** |
| `<Image>` Google OAuth | ✅ Oui | `app/login/page.tsx` l.198–204 |
| Asset PNG Google | ✅ Tracké | `public/google-oauth-logo-120.png` dans git |

**Hypothèses d'échec visuel (hors code manquant) :**
1. **Grille :** halos = `box-shadow` sur `ArenaVideoSurface` ; `overflow-hidden` sur la grille ne clippe pas toujours les ombres des tuiles voisines ; coquille `ArenaLayoutManager` (`p-1 sm:p-2`) sans overflow.
2. **Splash :** visible ~1,5 s puis redirect `/feed` — difficile à valider en prod ; `StarField` / layout root peut masquer le contraste attendu.
3. **OAuth :** PNG 20×20 peut paraître identique au SVG ; cache CDN / navigateur ; auth modal ailleurs (`AuthHook` ?) non audité ici.

---

## 1. Matrice Nexus — `components/Arena/nexus/nexusGridTemplates.ts`

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
      return 'grid-cols-6 grid-rows-2'; // 6 colonnes virtuelles pour centrer la ligne du bas
    case 6:
      return 'grid-cols-3 grid-rows-2'; // 3 colonnes symétriques
    default:
      return 'grid-cols-1 grid-rows-1';
  }
}

/** Placement d'une cellule dans la grille Nexus. */
export function getNexusCellClass(index: number, tileCount: number): string {
  if (tileCount === 3 && index === 2) return 'col-span-2';
  // Disposition 5 joueurs : 3 en haut, 2 centrés en bas (utilise 6 colonnes virtuelles)
  if (tileCount === 5) {
    if (index <= 2) return 'col-span-2'; // Ligne 1 : Les 3 tuiles prennent 2 cols chacune
    if (index === 3) return 'col-span-2 col-start-2'; // Ligne 2 : Tuile 4 centrée gauche
    if (index === 4) return 'col-span-2 col-start-4'; // Ligne 2 : Tuile 5 centrée droite
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

**Chaîne d'application :** `useArenaLayoutTiles.ts` → `tile.cellClass` / `tile.uiPosClass` → `ArenaVideoSurface` (`motion.div` + chrome `nexusChromeClass`).

**Point critique 6 joueurs :** `getNexusCellClass` ne définit **aucune** règle pour `tileCount === 6` (cellules égales 3×2).

---

## 2. Grille Nexus — `components/Arena/nexus/NexusGrid.tsx`

**Fonction complète :**

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
    <div className={`relative h-full w-full grid gap-1 sm:gap-2 min-w-0 overflow-hidden ${gridClass}`}>
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

**Vérification M.1 :** `min-w-0 overflow-hidden` **présents** sur la div parente (l.29).

---

## 3. Splash Screen — `app/page.tsx` (intégralité)

**Verdict :** design **Premium Glass Lourd** actif — pas de survivant de l'ancien code (`bg-transparent` racine, barre `progress` UI, `text-5xl italic`).

**Code mort :** `progress` / `setInterval` toujours actifs (l.10–13) mais **aucun rendu** de la barre.

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
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden bg-slate-950/90 backdrop-blur-3xl">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,240,255,0.05)_0%,transparent_70%)]" />

      {/* Conteneur Premium Glass Lourd */}
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="relative z-10 flex flex-col items-center justify-center p-8 sm:p-12 rounded-3xl bg-slate-950/75 backdrop-blur-md border border-white/10 shadow-[0_0_40px_rgba(0,0,0,0.8)]"
      >
        <div className="relative mb-6 flex items-center justify-center">
          {/* Anneau de chargement Pulsar */}
          <div className="absolute inset-0 rounded-[2.5rem] border-2 border-cyan-500/20 shadow-[0_0_15px_rgba(0,240,255,0.2)] animate-ping" />
          <div className="relative z-10 rounded-[2.5rem] bg-slate-900/50 p-2 border border-white/5 shadow-inner">
            <BeefLogo size={80} />
          </div>
        </div>

        <motion.h1
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-1 text-4xl font-black uppercase tracking-widest text-white drop-shadow-lg"
        >
          Beefs
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-cyan-400/80 text-[10px] sm:text-xs font-bold uppercase tracking-[0.25em] text-center"
        >
          L&apos;Agora des Règlements de Comptes
        </motion.p>
      </motion.div>
    </div>
  );
}
```

---

## 4. Circuit OAuth — Bouton Google (`app/login/page.tsx`)

**Import Image :** l.6 — `import Image from 'next/image';`  
**GoogleIcon :** **supprimé** (absent du fichier).

### Bouton Google complet (l.186–208)

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
                <Image
                  alt="Google Logo"
                  className="object-contain"
                  height={20}
                  src="/google-oauth-logo-120.png"
                  width={20}
                />
                <span>Continuer avec Google</span>
              </>
            )}
          </button>
```

**Asset :** `/google-oauth-logo-120.png` — présent et versionné (`git ls-files` OK).

---

## Commits M.1 pertinents sur `main`

| Commit | Contenu |
|--------|---------|
| `5dfb7f4` | feat(ui): splash glass, NexusGrid overflow, login Image Google, commentaires grille |
| `2ac3cba` | fix(branding): icon-512.svg (hors scope M.1 fonctionnel) |

---

*Fin du rapport — radiographie échec M.1 (zéro modification).*
