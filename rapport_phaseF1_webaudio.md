# Rapport Phase F.1 — Web Audio Engine

**Date :** 2026-06-28  
**Branche :** `main`  
**Validation :** `npx tsc --noEmit` — exit 0

---

## Contexte

Les heuristiques WebKit iOS ont rejeté l'approche Phase E.4 :
- balise DOM `<audio id="arena-system-audio">` avec flux Base64 MPEG
- camouflage CSS (`opacity-[0.01]`, `w-px h-px`)
- override Vanilla JS en capture sur les boutons PreJoin

**Objectif F.1 :** remplacer ce hack par un **AudioContext persistant** avec **OscillatorNode silencieux** (gain = 0), activé via props React sur geste utilisateur.

---

## Architecture F.1

```
PreJoin (onClick bouton join)
  → onTakeSystemFocus?.()          [prop React]
  → startSystemAudio()             [useMediaSession]
  → webAudioCtx.resume()           [singleton module]
  → OscillatorNode → Gain(0) → destination
  → navigator.mediaSession.playbackState = 'playing'
  → onJoin / handleJoin            [Daily]
```

Le singleton `webAudioCtx` / `silenceNode` vit **hors** du cycle React pour survivre aux re-renders de l'arène.

---

## Fichiers modifiés

| Fichier | Action |
|---------|--------|
| `hooks/useMediaSession.ts` | Réécriture complète — moteur Web Audio + metadata MediaSession |
| `components/TikTokStyleArena.tsx` | `startSystemAudio` extrait ; prop `onTakeSystemFocus` ; suppression `<audio>` |
| `components/PreJoinScreen.tsx` | Purge `useEffect` natif E.4 ; prop `onTakeSystemFocus` sur les 2 boutons join |

---

## Détail — `hooks/useMediaSession.ts`

**Singletons module :**
- `webAudioCtx: AudioContext | null`
- `silenceNode: OscillatorNode | null`

**API exportée :**
```typescript
return { startSystemAudio };
```

**`startSystemAudio()` (geste utilisateur requis) :**
1. Instancie `AudioContext` (fallback `webkitAudioContext`)
2. `resume()` si `suspended`
3. Crée `OscillatorNode` → `GainNode(gain=0)` → `destination`, puis `start()`
4. `navigator.mediaSession.playbackState = 'playing'`

**`useEffect` metadata :**
- `MediaMetadata` (title, artist, album, artwork)
- Handlers lock screen : `play` → `resume()` ; `pause` → no-op
- Cleanup : metadata + playbackState à `none` (contexte audio **non** fermé)

---

## Détail — purge E.4

### Supprimé de `TikTokStyleArena.tsx`
```tsx
<audio id="arena-system-audio" src="data:audio/mpeg;base64,..." ... />
```

### Supprimé de `PreJoinScreen.tsx`
- Bloc `useEffect` `[NATIVE OVERRIDE]` (l.140–163 E.4)
- Dépendance DOM `#arena-system-audio`

### Conservé (IDs boutons, sans listener natif)
- `id="arena-join-viewer"`
- `id="arena-join-participant"`

---

## Câblage React

**TikTokStyleArena :**
```typescript
const { startSystemAudio } = useMediaSession(debateTitle || 'Live Agora', host?.name || 'Ref');

<PreJoinScreen
  ...
  onTakeSystemFocus={startSystemAudio}
/>
```

**PreJoinScreen :**
```typescript
onClick={() => {
  onTakeSystemFocus?.();
  onJoin(null); // ou handleJoin()
}}
```

---

## Différences vs E.4

| Aspect | E.4 | F.1 |
|--------|-----|-----|
| Moteur audio | `<audio>` Base64 DOM | Web Audio API singleton |
| Activation | `addEventListener` capture | Prop React `onTakeSystemFocus` |
| Détection Apple | Rejeté (heuristiques) | Flux oscillator légitime |
| MediaSession | Post-`play()` async | Sync post-`resume()` + oscillator |

---

## Points d'attention QA iOS

1. Tap « Regarder le Beef » / « Rejoindre le direct » → pas de `[WebKit Override] Audio rejeté`
2. Widget lock screen : titre beef + artiste médiateur
3. Auto-PiP : inchangé (`ParticipantVideo` + `usePiP`) — phase séparée
4. PreJoin preview : `AudioContext` local vu-mètre **distinct** du singleton système (deux contextes possibles au join — acceptable pour F.1)

---

## Prochaines étapes possibles (hors F.1)

- Fusionner le `AudioContext` PreJoin (analyser) avec le singleton système
- Brancher le flux Daily/WebRTC sur le graphe Web Audio pour PiP lock screen
- Phase E.2 flipCamera : `updateInputSettings({ video: { facingMode } })`

---

*Fin du rapport Phase F.1.*
