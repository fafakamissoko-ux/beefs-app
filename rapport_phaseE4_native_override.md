# Rapport Phase E.4 — Native WebKit Override (User Gesture)

**Date :** 31 mai 2026  
**Phase :** E.4 — Contournement perte jeton User Gesture iOS Safari  
**Statut :** ✅ Terminé  
**Validation :** `npx tsc --noEmit` — exit 0

---

## Objectif

Remplacer la chaîne E.3 (`onTakeSystemFocus` via React Synthetic Events) par :
1. Balise `<audio>` **physique** compositée (sans `hidden`)
2. Listeners **`addEventListener('click', { capture: true })`** natifs sur boutons PreJoin

---

## Fichiers modifiés

| Fichier | Changement |
|---------|------------|
| `components/TikTokStyleArena.tsx` | Suppression ref/callback E.3 ; audio camouflé + `id` |
| `components/PreJoinScreen.tsx` | IDs boutons + useEffect native override |

---

## E.4.1 — Audio camouflé (TikTokStyleArena)

### Supprimé (E.3)
- `systemAudioRef`
- `takeSystemFocusSync`
- Prop `onTakeSystemFocus` sur PreJoinScreen

### Balise audio E.4

```tsx
<audio
  id="arena-system-audio"
  src="data:audio/mpeg;base64,..."
  loop
  playsInline
  aria-hidden
  className="fixed top-0 left-0 w-px h-px opacity-[0.01] pointer-events-none -z-50"
/>
```

| Avant | Après |
|-------|-------|
| `hidden` + `ref` | `id` + Tailwind 1px compositée |
| Play via React callback | Play via DOM native listener |

---

## E.4.2 — Native override (PreJoinScreen)

### IDs boutons

| Bouton | ID |
|--------|-----|
| 👁️ Regarder le Beef | `arena-join-viewer` |
| Rejoindre le direct | `arena-join-participant` |

### useEffect capture phase

```typescript
useEffect(() => {
  const handleNativeClick = () => {
    const audioEl = document.getElementById('arena-system-audio') as HTMLAudioElement;
    if (audioEl) {
      audioEl.volume = 0.01;
      audioEl.play().then(() => {
        navigator.mediaSession.playbackState = 'playing';
      });
    }
  };
  btnViewer?.addEventListener('click', handleNativeClick, { capture: true });
  btnParticipant?.addEventListener('click', handleNativeClick, { capture: true });
  // cleanup...
}, []);
```

**Ordre d'exécution au tap :**
1. Capture native → `audio.play()` (user gesture préservé)
2. Bubble → React `onClick` → join Daily

### Prop supprimée
- `onTakeSystemFocus` retirée de `PreJoinScreenProps`

---

## useMediaSession (inchangé E.3)

Métadonnées lock screen uniquement — pas de conflit avec E.4.

---

## Test plan

- [ ] iOS Safari participant : clic « Rejoindre le direct » → widget lock screen
- [ ] iOS Safari spectateur : clic « Regarder le Beef » → idem
- [ ] Console : pas de `[WebKit Override] Audio rejeté`
- [ ] Join Daily fonctionne après override (React onClick inchangé)
- [ ] Audio dummy persiste en arrière-plan pendant le live
- [ ] Leave arène : cleanup MediaSession

---

## Risque résiduel

Si `play().then()` pose encore problème pour `playbackState`, E.4.1 pourrait tenter `playbackState = 'playing'` **synchrone** juste après l'appel à `play()` (sans attendre la Promise) — à valider en QA iOS.
