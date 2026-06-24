# Rapport Phase C4 — Hardware & Network Health (Tier-1)

**Date :** 31 mai 2026  
**Phase :** C.4 — Camera Flip mobile + indicateur réseau WebRTC + PiP desktop-only  
**Statut :** ✅ Terminé

---

## Objectif

Mise à niveau matérielle de l'Agora avec ergonomie stricte :

- **PiP manuel** masqué sur mobile (`hidden md:flex`) — auto-PiP C3.1 reste actif
- **Camera Flip** (`cycleCamera`) sur contrôles flottants extérieurs, mobile only (`md:hidden`)
- **Indicateur réseau** Daily dans le badge `@username` (tuile locale)

---

## Fichiers modifiés

| Fichier | Changement |
|---------|------------|
| `components/ParticipantVideo.tsx` | PiP bouton desktop-only |
| `hooks/useDailyMeetingEngine.ts` | `networkQuality`, `network-quality-change`, `flipCamera` |
| `hooks/useDailyCall.ts` | Expose `networkQuality`, `flipCamera`, type `WebRtcNetworkQuality` |
| `components/Arena/shared/ArenaVideoSurface.tsx` | SwitchCamera + pastille réseau |
| `components/Arena/types.ts` | Props layout étendues |
| `components/Arena/ArenaLayoutManager.tsx` | Propagation surfaceProps |
| `components/TikTokStyleArena.tsx` | Câblage depuis `useDailyCall` |

---

## C4.1 — PiP mobile masqué

```tsx
className="... hidden md:flex ..."
```

Le bouton `PictureInPicture2` n'apparaît qu'à partir du breakpoint `md`. Sur mobile, seul `autoPictureInPicture` (C3.1) s'applique.

---

## C4.2 — Moteur WebRTC

### `networkQuality`

```typescript
type WebRtcNetworkQuality = 'good' | 'low' | 'very-low' | 'offline';
```

- Écoute Daily : `network-quality-change` → `event.threshold`
- Reset `'good'` sur `left-meeting`

### `flipCamera`

```typescript
await callRef.current.cycleCamera();
```

No-op si `viewerMode` ou pas de call actif.

---

## C4.3 — UI ArenaVideoSurface

### Camera Flip (localControls)

- Icône `SwitchCamera` (lucide)
- Visible **mobile only** : `md:hidden`
- Adjacent aux boutons Mic / Video sur tuile locale
- `onFlipCamera` optionnel (undefined pour spectateurs)

### Indicateur réseau (pseudoBadge)

- Pastille animée avant `@username`
- Affichée si `tile.isLocal && webrtcNetworkQuality !== 'good'`
- Orange (`low`) / Rouge (`very-low` | `offline`)

---

## C4.4 — Propagation props

```
useDailyCall
  └─ TikTokStyleArena
        networkQuality → webrtcNetworkQuality
        flipCamera → onFlipCamera (non-viewer)
        └─ ArenaLayoutManager (surfaceProps)
              └─ NexusGrid / ConstellationOrbit
                    └─ ArenaVideoSurface (par tuile)
```

---

## Matrice ergonomie

| Feature | Mobile | Desktop |
|---------|--------|---------|
| PiP manuel | ❌ masqué | ✅ visible |
| PiP auto | ✅ C3.1 | ✅ C3.1 |
| Camera Flip | ✅ contrôles flottants | ❌ masqué |
| Pastille réseau | ✅ badge local | ✅ badge local |

---

## Validation TypeScript

```bash
npx tsc --noEmit
```

**Résultat :** ✅ exit code 0

---

## Points d'attention

1. **`network-quality-change`** — événement Daily peut varier selon version SDK ; tester en conditions 3G / throttling.
2. **`cycleCamera`** — nécessite caméra front/back ; no-op sur desktop sans dual camera.
3. **Pastille locale only** — la qualité réseau Daily reflète la connexion du participant local, pas celle des remote peers.
4. **MediatorOrb** — pas de flip/réseau sur l'orbite médiateur dans C4 ; extension possible C4.1 si le host est aussi sur tuile orb.

---

## Prochaines étapes suggérées (hors scope C4)

- Brancher `networkHealthy` MediatorSidebar depuis `networkQuality !== 'good'`
- Flip caméra sur MediatorOrb pour le host en mode constellation
- Tooltip textuel réseau (low / very-low / offline)
