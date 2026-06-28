# Rapport Phase F.2 — Moteur Hybride Réseau

**Date :** 2026-06-28  
**Branche :** `main`  
**Validation :** `npx tsc --noEmit` — exit 0

---

## Contexte

La Phase F.1 (Web Audio `OscillatorNode`) a échoué sur iOS Safari :
- **Collision** entre `AudioContext` PreJoin (vu-mètre) et singleton système
- **Lock Screen** exige un flux **réseau réel**, pas un oscillateur synthétique

**Objectif F.2 :** architecture DOM hybride — singleton `HTMLAudioElement` + asset `/sounds/silence.mp3`, avec séquençage join inversé.

---

## Asset réseau (pré-requis)

| Chemin | Source | Taille |
|--------|--------|--------|
| `public/sounds/silence.mp3` | `Downloads/silence.mp3.mp3` | ~37 Ko |

Lecteur : `new Audio('/sounds/silence.mp3')` — loop, volume 0.01.

---

## Architecture F.2

```
Participant tap « Rejoindre le direct »
  → handleJoin() async
  → 1. closeAudioContext()           [libère thread iOS — vu-mètre]
  → 2. await onTakeSystemFocus()     [startSystemAudio — lecteur réseau]
  → 3. releasePreJoinResources()     [preview UI]
  → 4. onJoin(acquired)              [Daily]

Spectateur tap « Regarder le Beef »
  → await onTakeSystemFocus()
  → onJoin(null)
```

---

## Fichiers modifiés

| Fichier | Action |
|---------|--------|
| `public/sounds/silence.mp3` | **Ajout** — silence ~1 s en boucle |
| `hooks/useMediaSession.ts` | Purge Web Audio → singleton `HTMLAudioElement` |
| `components/PreJoinScreen.tsx` | Séquençage async inversé + viewer corrigé |

---

## Détail — `hooks/useMediaSession.ts`

**Supprimé (F.1) :**
- `webAudioCtx`, `silenceNode`, `OscillatorNode`, `GainNode`

**Ajouté (F.2) :**
```typescript
let systemNetworkAudio: HTMLAudioElement | null = null;

const startSystemAudio = useCallback(async () => {
  if (!systemNetworkAudio) {
    systemNetworkAudio = new Audio('/sounds/silence.mp3');
    systemNetworkAudio.loop = true;
    systemNetworkAudio.volume = 0.01;
  }
  await systemNetworkAudio.play();
  navigator.mediaSession.playbackState = 'playing';
}, []);
```

**Lock screen handlers :**
- `play` → `systemNetworkAudio.play()`
- `pause` → no-op (empêche coupure background)

---

## Détail — `PreJoinScreen.tsx`

**Prop :**
```typescript
onTakeSystemFocus?: () => Promise<void>;
```

**`handleJoin` — ordre chirurgical :**
1. `closeAudioContext()` — **avant** le moteur système
2. `await onTakeSystemFocus()` — lecteur réseau sans collision
3. `releasePreJoinResources({ stopTracks: false })` — note : appelle aussi `closeAudioContext()` (idempotent)
4. `onJoin(acquired, { camEnabled })`

**Viewer :** `onTakeSystemFocus` ajouté (asymétrie F.1 corrigée).

**Participant :** `void handleJoin()` — séquence centralisée.

---

## Différences F.1 → F.2

| Aspect | F.1 | F.2 |
|--------|-----|-----|
| Moteur | `AudioContext` + oscillator | `HTMLAudioElement` + MP3 réseau |
| Activation | Sync | `async` + `await play()` |
| PreJoin join | `onTakeSystemFocus` puis `releasePreJoinResources` | `closeAudioContext` → `onTakeSystemFocus` → `releasePreJoinResources` |
| Viewer | Pas de `onTakeSystemFocus` | `await onTakeSystemFocus()` avant join |

---

## QA iOS recommandée

1. Participant : vu-mètre actif → tap join → pas de collision, widget lock screen visible
2. Spectateur : tap « Regarder le Beef » → widget lock screen
3. Console : absence de `[Hybrid Engine] Audio rejeté par WebKit`
4. Vérifier chargement HTTP 200 de `/sounds/silence.mp3`

---

*Fin du rapport Phase F.2.*
