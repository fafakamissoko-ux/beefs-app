# Rapport Phase D.2 — Smart Flipper, PiP tuiles visibles, UI anti-débordement

**Date :** 31 mai 2026  
**Phase :** D.2 — Pivot stratégique post-D.1  
**Statut :** ✅ Terminé  
**Validation :** `npx tsc --noEmit` — exit 0

---

## Objectif

1. **Détruire `SmartPiPManager`** — ignoré par iOS, remplacé par auto-PiP sur tuiles visibles
2. **Smart Flipper** — bascule front/back déterministe, évite macro/téléobjectif
3. **Blindage UI** — flex-wrap constellation + truncate pseudo

---

## Fichiers modifiés / supprimés

| Fichier | Action |
|---------|--------|
| `hooks/usePiP.ts` | `autoPictureInPicture = enableAutoPiP` dynamique |
| `components/ParticipantVideo.tsx` | `isSmartPiPUI` → `enableAutoPiP` |
| `components/Arena/ArenaLayoutManager.tsx` | Suppression import + instanciation SmartPiPManager |
| `components/Arena/SmartPiPManager.tsx` | **Supprimé** |
| `hooks/useDailyMeetingEngine.ts` | Smart Flipper (enumerateDevices + setInputDevicesAsync) |
| `components/Arena/shared/ArenaVideoSurface.tsx` | PiP tuile + truncate + flex-wrap |

---

## D.2.1 — Pivot PiP (tuiles visibles)

### Avant (C5 → D.1)

```
ArenaLayoutManager → SmartPiPManager (fantôme) → ParticipantVideo(isSmartPiPUI)
Tuiles visibles → ParticipantVideo (auto-PiP off)
```

### Après (D.2)

```
Tuile visible → ParticipantVideo(enableAutoPiP={isActiveSpeaker || tile.isLocal})
usePiP → autoPictureInPicture = enableAutoPiP (true/false dynamique)
```

### `usePiP.ts`

- Effet dédié `[enableAutoPiP, videoRef]` assigne **booléen** (pas seulement `true`)
- Désactive auto-PiP sur tuiles non ciblées quand le parleur change

### `ParticipantVideo.tsx`

- Prop `enableAutoPiP?: boolean`
- Bouton manuel PiP masqué si `enableAutoPiP` (desktop garde PiP manuel sur tuiles non-auto)

---

## D.2.2 — Smart Flipper

### Algorithme (`flipCamera`)

| Étape | Comportement |
|-------|--------------|
| ≤ 2 caméras | Fallback `cycleCamera()` |
| > 2 caméras | `getInputDevices()` + filtre front/back par label |
| Front actif | Bascule vers `backDevices[0]` |
| Back actif | Bascule vers `frontDevices[0]` |
| Labels ambigus | Toggle index 0 ↔ dernier |
| Échec cible | Fallback `cycleCamera()` |

Labels reconnus : `front`, `avant`, `back`, `arrière` (case insensitive).

### Typage Daily

```typescript
const camera = currentInput?.camera;
const currentDeviceId =
  camera && 'deviceId' in camera ? camera.deviceId : undefined;
```

(`camera` typé `{} | DailyMediaDeviceInfo` côté Daily SDK)

---

## D.2.3 — Blindage UI

### PiP dynamique (L185 ArenaVideoSurface)

```tsx
enableAutoPiP={isActiveSpeaker || tile.isLocal}
```

### Pseudo truncate

```tsx
className="max-w-[70px] sm:max-w-[120px] truncate inline-block ..."
```

### Constellation localControls — flex-wrap

```tsx
className={`... flex w-full max-w-[90px] sm:max-w-none flex-wrap justify-center ...`}
```

Empêche le débordement horizontal des 3 boutons sur orbites latérales mobile.

---

## Test plan

- [ ] iOS Safari : arrière-plan → auto-PiP sur tuile local ou active speaker (pas de fantôme)
- [ ] Changement active speaker → auto-PiP migre vers nouvelle tuile
- [ ] Tuiles non-local / non-speaker : `autoPictureInPicture = false`
- [ ] Flip caméra iPhone multi-objectifs : bascule front ↔ back principal (pas macro)
- [ ] Grille constellation 3/5/6 tuiles mobile : contrôles wrap sans déborder
- [ ] Pseudo long : ellipsis `@username...` sur mobile
- [ ] Desktop : bouton PiP manuel sur tuiles sans `enableAutoPiP`

---

## Risque connu

Si **local** et **active speaker** sont des tuiles différentes, deux vidéos peuvent avoir `enableAutoPiP=true`. iOS ne retient qu'une source PiP — comportement OS à valider en QA. Affinement possible D.2.1 : priorité `isActiveSpeaker` seul, fallback local si null.
