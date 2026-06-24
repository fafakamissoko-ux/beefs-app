# Rapport Phase C5 — Smart PiP & Halos Vocaux (Active Speaker)

**Date :** 31 mai 2026  
**Phase :** C.5 — Picture-in-Picture intelligent + feedback visuel Active Speaker  
**Statut :** ✅ Terminé  
**Validation :** `npx tsc --noEmit` — exit 0

---

## Objectif

Brancher le signal Daily `activeSpeakerPeerId` (déjà capturé en C4) vers :

1. **Smart PiP** — auto-PiP exclusif via un composant fantôme masqué qui suit dynamiquement le parleur actif
2. **Halos vocaux** — bordure pulsante cyan sur la tuile correspondante, sans altérer les couleurs d'Aura

---

## Fichiers modifiés / créés

| Fichier | Changement |
|---------|------------|
| `hooks/usePiP.ts` | Paramètre `enableAutoPiP` (défaut `false`) |
| `components/ParticipantVideo.tsx` | Prop `isSmartPiPUI`, auto-PiP conditionnel, bouton manuel masqué si fantôme |
| `components/Arena/SmartPiPManager.tsx` | **Nouveau** — composant masqué, sélection tuile cible |
| `components/Arena/shared/ArenaVideoSurface.tsx` | Prop `isActiveSpeaker` + calque halo CSS |
| `components/Arena/nexus/NexusGrid.tsx` | Calcul `isActiveSpeaker` par tuile |
| `components/Arena/constellation/ConstellationOrbit.tsx` | Idem |
| `components/Arena/ArenaLayoutManager.tsx` | `SmartPiPManager` + propagation `activeSpeakerPeerId` |
| `components/Arena/types.ts` | `activeSpeakerPeerId` dans `ArenaLayoutManagerProps` |
| `components/TikTokStyleArena.tsx` | Câblage `activeSpeakerPeerId` → layout |

---

## C5.1 — Hook PiP (`usePiP`)

```typescript
export function usePiP(videoRef: RefObject<HTMLVideoElement | null>, enableAutoPiP = false)
```

- **Avant C5 :** `autoPictureInPicture = true` sur **toutes** les tuiles vidéo
- **Après C5 :** auto-PiP activé **uniquement** si `enableAutoPiP === true`
- Le bouton manuel PiP (desktop) reste disponible sur les tuiles normales

---

## C5.2 — ParticipantVideo (fantôme vs tuile)

| Prop | Effet |
|------|-------|
| `isSmartPiPUI={true}` | Active auto-PiP via `usePiP(ref, true)` |
| `!isSmartPiPUI` | Masque le bouton `PictureInPicture2` |

---

## C5.3 — SmartPiPManager

Composant invisible (`opacity-[0.01]`, `z-[-9999]`, `pointer-events-none`) monté dans `ArenaLayoutManager` où `tiles` est déjà disponible.

**Priorité de sélection de la tuile cible :**

1. `activeSpeakerPeerId` → `tiles.find(t => t.panel?.sessionId === activeSpeakerPeerId)`
2. Tuile locale (`t.isLocal`)
3. Première tuile avec vidéo active (`t.hasActiveVideo`)

Rendu : `<ParticipantVideo videoTrack={...} muted isSmartPiPUI />`

---

## C5.4 — Halos vocaux (ArenaVideoSurface)

```tsx
{isActiveSpeaker && (
  <div className="absolute inset-0 z-20 pointer-events-none rounded-[inherit] border-2 border-brand-400 shadow-[0_0_20px_rgba(0,240,255,0.4)] animate-pulse" />
)}
```

- Calque **à l'intérieur** du `<button>` vidéo, après le contenu ParticipantVideo / avatar
- `rounded-[inherit]` suit la forme Nexus (`rounded-[2rem]`) ou Constellation (`rounded-full`)
- **Indépendant** de `auraShadow` (box-shadow couleur slot) et du badge « DIRECT » (Hot Mic régie)

---

## C5.5 — Chaîne de propagation

```
useDailyMeetingEngine.activeSpeakerPeerId
  └─ useDailyCall.activeSpeakerPeerId
        └─ TikTokStyleArena
              └─ ArenaLayoutManager
                    ├─ SmartPiPManager (auto-PiP fantôme)
                    ├─ NexusGrid / ConstellationOrbit
                    │     └─ isActiveSpeaker = tile.panel?.sessionId === activeSpeakerPeerId
                    └─ ArenaVideoSurface (halo)
```

---

## Distinction Hot Mic vs Active Speaker

| Signal | Source | UI |
|--------|--------|-----|
| Hot Mic régie | `effectiveHotMicSpeakerSlot` | Badge « DIRECT » rose |
| Daily Active Speaker | `activeSpeakerPeerId` | Halo cyan pulsant + Smart PiP |

Les deux peuvent coexister sur des participants différents.

---

## Régression C4 corrigée

En C4, `autoPictureInPicture` était activé sur chaque `ParticipantVideo` de l'arène. C5 restreint l'auto-PiP au seul `SmartPiPManager`, évitant les conflits multi-vidéos lors du passage en arrière-plan.

---

## Test plan

- [ ] Rejoindre une arène à 2+ participants avec caméra
- [ ] Parler tour à tour : vérifier le halo cyan sur la tuile du parleur Daily
- [ ] Vérifier que le halo ne remplace pas la couleur d'Aura (box-shadow slot intact)
- [ ] Hot Mic activé : badge « DIRECT » distinct du halo Active Speaker
- [ ] Mobile Safari / Chrome : réduire l'app → PiP auto sur le parleur actif (ou fallback local / première vidéo)
- [ ] Desktop : bouton PiP manuel visible sur tuiles normales, absent du DOM fantôme
- [ ] Constellation + Nexus : halo suit la forme arrondie de la tuile

---

## Prochaines étapes possibles

- Smart PiP sur le médiateur (`MediatorOrb`) si le parleur actif est le ref
- Nettoyage du code legacy `leftNeonAudio` / `rightNeonAudio` dans `TikTokStyleArena` (non consommé)
