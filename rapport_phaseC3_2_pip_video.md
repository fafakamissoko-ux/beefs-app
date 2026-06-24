# Rapport Phase C3.2 — Picture-in-Picture vidéo arrière-plan

**Date :** 31 mai 2026  
**Phase :** C.3.2 — Hook `usePiP` + intégration `ParticipantVideo`  
**Statut :** ✅ Terminé

---

## Objectif

Intégrer le **Picture-in-Picture (PiP) natif** pour le mode « arrière-plan vidéo » :

- Hook réutilisable `requestPictureInPicture` / `exitPictureInPicture`
- Activation **`autoPictureInPicture`** sur la balise `<video>`
- Bouton manuel sur l'overlay de chaque tuile `ParticipantVideo`

---

## Fichiers créés / modifiés

| Fichier | Changement |
|---------|------------|
| `hooks/usePiP.ts` | Hook PiP (support, état actif, toggle, auto-PiP) |
| `components/ParticipantVideo.tsx` | Branchement hook + bouton overlay |

---

## C3.2.1 — Hook `usePiP`

### API

```typescript
usePiP(videoRef: RefObject<HTMLVideoElement | null>)
→ { isPiPSupported, isPiPActive, togglePiP }
```

### Comportement

| Fonction | Détail |
|----------|--------|
| Support | `document.pictureInPictureEnabled` |
| Auto-PiP | `video.autoPictureInPicture = true` si propriété présente |
| Événements | `enterpictureinpicture` / `leavepictureinpicture` |
| `togglePiP` | `requestPictureInPicture()` ou `exitPictureInPicture()` ; stopPropagation sur clic |

---

## C3.2.2 — `ParticipantVideo`

### Modifications

- Import `usePiP`, `PictureInPicture2` (lucide-react)
- `videoRef` existant réutilisé pour le hook
- `<video disablePictureInPicture={false}>` — PiP non bloqué par le navigateur
- Conteneur wrapper `relative` / `className` hérité des parents (Arena + MediatorOrb)
- Bouton PiP **top-right** visible si `isPiPSupported && !isPiPActive`

### Propagation

`ParticipantVideo` est consommé par :

- `ArenaVideoSurface` (tuiles challengers Nexus / Constellation)
- `MediatorOrb` (flux médiateur central)

→ **Chaque tuile vidéo active** dispose de son propre bouton PiP.

---

## Architecture PiP

```
ParticipantVideo
├── videoRef → <video> (MediaStreamTrack Daily)
├── usePiP(videoRef)
│     ├── autoPictureInPicture = true
│     └── togglePiP → requestPictureInPicture()
└── Bouton PictureInPicture2 (overlay z-20)
```

**Complément C3.1 :** `useMediaSession` (TikTokStyleArena) gère les métadonnées lock screen ; C3.2 gère le détachement visuel PiP par tuile.

---

## Validation TypeScript

```bash
npx tsc --noEmit
```

**Résultat :** ✅ exit code 0

---

## Points d'attention

1. **Multi-tuiles** — jusqu'à 7 boutons PiP simultanés ; l'utilisateur choisit quelle tuile détacher.
2. **Auto-PiP timing** — le premier `useEffect` de `usePiP` peut s'exécuter avant que `videoRef.current` soit monté ; évolution possible : ré-appliquer `autoPictureInPicture` après attach track.
3. **iOS Safari** — support PiP variable selon version / PWA standalone ; tester terrain obligatoire.
4. **Bouton masqué en PiP actif** — `!isPiPActive` évite le doublon UI ; sortie PiP via OS ou `exitPictureInPicture`.
5. **Clic tuile support** — `togglePiP` appelle `stopPropagation` pour ne pas déclencher `onTapSupport` parent.

---

## Prochaines étapes suggérées (hors scope C3.2)

- PiP « intelligent » : détacher automatiquement le speaker actif (`effectiveHotMicSpeakerSlot`)
- Bouton PiP global unique dans la barre système (vs par tuile)
- Tests E2E : Chrome Android, iOS Safari, retour home screen
