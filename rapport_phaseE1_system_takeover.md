# Rapport Phase E.1 — System Takeover (Dummy Audio WebKit)

**Date :** 31 mai 2026  
**Phase :** E.1 — Hack iOS Safari lock screen + focus audio  
**Statut :** ✅ Terminé  
**Validation :** `npx tsc --noEmit` — exit 0

---

## Objectif

Contourner les restrictions WebKit iOS :
- Widget Média sur l'écran de verrouillage absent sans flux HTML actif
- Auto-PiP / background audio bloqués sans « user gesture » audio

**Solution :** singleton `HTMLAudioElement` + MP3 silencieux base64 + `takeSystemFocus()` appelé **synchroniquement** au join.

---

## Fichiers modifiés

| Fichier | Changement |
|---------|------------|
| `hooks/useMediaSession.ts` | Réécriture — dummy audio + `takeSystemFocus` |
| `components/TikTokStyleArena.tsx` | Destructure hook + appel 1ère ligne `handleJoin` |

---

## E.1.1 — `useMediaSession.ts` (Arme fantôme)

### Singleton dummy audio

```typescript
const SILENT_MP3 = 'data:audio/mpeg;base64,...';
let dummyAudio: HTMLAudioElement | null = null;
```

| Propriété | Valeur | Raison |
|-----------|--------|--------|
| `loop` | `true` | Maintien session audio OS |
| `volume` | `0.01` | Évite ignore OS sur volume 0 |
| `play()` | Promise | Déclenche `playbackState = 'playing'` au resolve |

### `takeSystemFocus()`

- Crée `new Audio(SILENT_MP3)` une seule fois
- Appelle `dummyAudio.play()` **sans await** dans l'appelant (Promise interne)
- Pose `navigator.mediaSession.playbackState = 'playing'`

### Handlers Media Session

- `play` → relance `dummyAudio.play()` si lock screen play tap
- `pause` → no-op (empêche pause globale involontaire)

### Cleanup (unmount)

- `metadata = null`, `playbackState = 'none'`
- `dummyAudio.pause()` + singleton reset

---

## E.1.2 — `TikTokStyleArena.tsx` (Déclenchement)

### Hook

```typescript
const { takeSystemFocus } = useMediaSession(
  debateTitle || 'Live Agora',
  host?.name || 'Ref',
);
```

### `handleJoin` — ordre critique

```typescript
const handleJoin = (preAcquired, opts) => {
  takeSystemFocus(); // ← 1ère ligne, sync, dans la stack du clic PreJoin
  setPreJoinMediaStream(preAcquired);
  // ...
};
```

**Chaîne geste utilisateur :**
```
Clic « Rejoindre le direct » (PreJoinScreen L386)
  → PreJoinScreen.handleJoin (sync)
    → onJoin → TikTokStyleArena.handleJoin
      → takeSystemFocus() ✅ même tick utilisateur
```

Spectateur : clic « Regarder le Beef » → `onJoin(null)` → même `handleJoin`.

---

## Non traité en E.1

- PiP auto sur tuile unique (D.2 reste en place)
- Smart Flipper `updateInputSettings({ facingMode })` (Phase E.2)
- `takeSystemFocus` dans PreJoinScreen directement (centralisé arène via `handleJoin`)

---

## Test plan

- [ ] iOS Safari : clic join → widget lock screen avec titre beef + ref
- [ ] Arrière-plan : audio WebRTC + dummy maintiennent la session
- [ ] Lock screen play → dummy reprend (handler)
- [ ] Leave arène : dummy stoppé au unmount hook
- [ ] Desktop Chrome : pas de régression audio meeting
- [ ] Console : pas de `[System Takeover] Dummy audio bloqué` après join normal
