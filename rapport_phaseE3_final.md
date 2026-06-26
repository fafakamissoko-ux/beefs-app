# Rapport Phase E.3 — DOM Audio System Takeover + Fix Auto-Join

**Date :** 31 mai 2026  
**Phase :** E.3 finale — `<audio>` physique + PreJoin obligatoire  
**Statut :** ✅ Terminé  
**Validation :** `npx tsc --noEmit` — exit 0

---

## Objectifs

1. **Fix auto-join** — challengers/médiateurs ne bypassent plus le PreJoin
2. **E.3 DOM audio** — balise `<audio>` à la racine arène, `play()` synchrone via prop PreJoin

---

## Fichiers modifiés

| Fichier | Changement |
|---------|------------|
| `hooks/useMediaSession.ts` | Metadata only (suppression `new Audio()` E.1) |
| `components/TikTokStyleArena.tsx` | Fix hasJoined, audio racine, `takeSystemFocusSync` |
| `components/PreJoinScreen.tsx` | Prop `onTakeSystemFocus` + onClick sync |

---

## E.0 — Verrouillage Auto-Join

### Causes identifiées

| Bug | Avant | Après |
|-----|-------|-------|
| Session restore | `hasJoined` init depuis `sessionStorage` | `useState(false)` strict |
| Viewer skip | `useEffect` → `setHasJoined(true)` si `isViewer` | **Supprimé** |
| PreJoin | Bypass challengers au reload | Toujours affiché jusqu'au clic |

### Comportement join Daily (inchangé)

L'effet L1612+ déclenche `join()` uniquement quand `hasJoined === true` (post-clic PreJoin).

---

## E.3.1 — `useMediaSession.ts`

- Métadonnées `MediaMetadata` uniquement
- Cleanup : `metadata = null`, `playbackState = 'none'`
- **Plus de** `takeSystemFocus`, `dummyAudio`, handlers play/pause

---

## E.3.2 — Audio racine (`TikTokStyleArena`)

```typescript
useMediaSession(debateTitle || 'Live Agora', host?.name || 'Ref');
const systemAudioRef = useRef<HTMLAudioElement | null>(null);

const takeSystemFocusSync = useCallback(() => {
  if (systemAudioRef.current) {
    systemAudioRef.current.volume = 0.01;
    systemAudioRef.current.play().then(() => {
      navigator.mediaSession.playbackState = 'playing';
    });
  }
}, []);
```

```tsx
<audio ref={systemAudioRef} src="data:audio/mpeg;base64,..." loop playsInline hidden aria-hidden />
```

- Monté **hors** du bloc `showPreJoin` → persiste après join
- `takeSystemFocus()` retiré de `handleJoin`

---

## E.3.3 — PreJoin synchrone

```tsx
onTakeSystemFocus?: () => void;

// Spectateur
onClick={() => {
  if (onTakeSystemFocus) onTakeSystemFocus();
  onJoin(null);
}}

// Participant
onClick={() => {
  if (onTakeSystemFocus) onTakeSystemFocus();
  handleJoin();
}}
```

**Ordre critique :** `onTakeSystemFocus()` **avant** tout `await` / handoff Daily.

---

## Chaîne geste utilisateur E.3

```
Clic bouton PreJoin (sync)
  → takeSystemFocusSync() → systemAudioRef.play()
  → playbackState = 'playing'
  → handleJoin / onJoin(null)
  → setShowPreJoin(false) — PreJoin démonte, <audio> racine reste
```

---

## Test plan

- [ ] Challenger/médiateur : PreJoin **toujours** visible au chargement (pas d'auto-join)
- [ ] Spectateur : PreJoin visible, clic « Regarder le Beef » requis
- [ ] iOS Safari : widget lock screen après clic join
- [ ] Refresh page : PreJoin réapparaît (hasJoined non restauré)
- [ ] sessionStorage `arena_joined_*` écrit au join mais non lu au init
- [ ] Audio dummy continue en arrière-plan pendant le live
- [ ] Leave arène : cleanup MediaSession au unmount hook

---

## Régression E.1

Le singleton `new Audio()` mémoire est **retiré** — remplacé par nœud DOM persistant (recommandation audit `rapport_audit_dom_audio.md`).
