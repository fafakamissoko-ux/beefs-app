# Rapport Phase C2.2 — Migration chat & réactions vers store volatil

**Date :** 31 mai 2026  
**Phase :** C.2.2 — Extraction rendu + purge états locaux TikTokStyleArena  
**Statut :** ✅ Terminé

---

## Objectif

Remplacer les états locaux `visibleMessages` et `flyingReactions` par `useArenaVolatileStore`, et **isoler le rendu** dans des sous-composants qui écoutent le store — pour **stopper les re-renders** du monolithe `TikTokStyleArena` à chaque message ou particule.

---

## Fichiers modifiés

| Fichier | Changement |
|---------|------------|
| `components/TikTokStyleArena.tsx` | Purge useState, mutations store, sous-composants `ArenaChatMessages` / `ArenaFlyingReactions` |

**Dépendance :** `lib/stores/arenaVolatileStore.ts` (C2.1)

---

## Architecture avant / après

### Avant

```
TikTokStyleArena
├── useState(visibleMessages)  → re-render parent à chaque msg
├── useState(flyingReactions)  → re-render parent à chaque particule
├── reactionBufferRef + setInterval(250ms) flush
└── JSX .map inline dans le monolithe
```

### Après

```
TikTokStyleArena
├── useArenaVolatileStore (actions only — pas de state lu)
│   addMessage, deleteMessage, clearMessages
│   addReaction, clearReactions
│
├── ArenaChatMessages          → subscribe messages
│   └── scroll auto (useLayoutEffect local)
│
└── ArenaFlyingReactions       → subscribe reactions
    └── adaptateur → FlyingReactionsLayer
```

---

## C2.2.1 — Sous-composants volatils

### `ArenaChatMessages`

- Selector : `useArenaVolatileStore(s => s.messages)`
- Props : `scrollRef`, `endRef`, `isMobile`
- Recopie exacte des styles desktop / mobile (`getUsernameColor`, bulles Tailwind)
- Scroll auto déplacé depuis le parent (`useLayoutEffect` sur `messages`)

### `ArenaFlyingReactions`

- Selectors : `reactions`, `removeReaction`
- Adaptateur store → `FlyingReactionEntry` :
  - `id` numérique store → `String(id)` pour `FlyingReactionsLayer`
  - `orbitStartAngle` / `orbitDir` dérivés de `id` (store C2.1 ne les stocke pas)

---

## C2.2.2 — Purge états locaux

| Supprimé | Remplacé par |
|----------|--------------|
| `useState<VisibleMessage[]>` | store `messages` |
| `useState<FlyingReactionEntry[]>` | store `reactions` |
| `reactionBufferRef` + `setInterval` flush | `addReaction()` direct |
| `interface VisibleMessage` locale | type exporté du store |
| import `pushFlyingReaction` | cap géré par le store (`slice(-40)`) |

**Parent :** ne lit que les **actions** du store (pas de re-render sur messages/reactions).

---

## C2.2.3 — Mutations remplacées

| Zone | Changement |
|------|------------|
| `addRemoteMessage` | `addMessage({ id, user_name, content, initial })` |
| `handleSendMessage` | optimistic `addMessage` → confirm `deleteMessage(pending)` + `addMessage(realId)` |
| `handleDeleteMessage` | `deleteMessage(messageId)` |
| `onMessageDeleted` (realtime) | `deleteMessage(messageId)` |
| `addRemoteReaction` | `addReaction({ emoji, x, opacityMul, scaleMul })` |
| `handleReaction` | idem (3 branches intégrées / standard) |
| Reset `roomId` | `clearMessages()` + `clearReactions()` |

---

## C2.2.4 — Stats sans re-render parent

`statsRef.messagesCount` :

- Sync via `useArenaVolatileStore.getState().messages.length` dans l'effet beefTimeRemaining / liveViewerCount
- Subscription Zustand dédiée pour mise à jour du compteur sans selector dans le JSX parent

---

## C2.2.5 — JSX

| Emplacement | Avant | Après |
|-------------|-------|-------|
| Chat desktop | `.map(visibleMessages)` inline | `<ArenaChatMessages isMobile={false} … />` |
| Chat mobile | `.map(visibleMessages)` inline | `<ArenaChatMessages isMobile … />` |
| Réactions volantes | `<FlyingReactionsLayer reactions={flyingReactions} … />` | `<ArenaFlyingReactions />` |

---

## Validation TypeScript

```bash
npx tsc --noEmit
```

**Résultat :** ✅ exit code 0

---

## Points d'attention

1. **Adaptateur orbite** — `orbitStartAngle` / `orbitDir` sont déterministes depuis `id` numérique ; une évolution C2.3 pourrait les stocker dans le store à l'`addReaction`.
2. **Optimistic send** — remplacement pending → UUID DB via `deleteMessage` + `addMessage` (pas de `updateMessage` dans le store).
3. **Cap particules** — store limite à 40 ; ancien code utilisait `pushFlyingReaction` (28) + slice(-30) ; léger relâchement acceptable.
4. **Tests manuels recommandés** — spam chat mobile, réactions broadcast, changement de room, scroll clavier mobile.

---

## Prochaines étapes (hors scope C2.2)

- C2.3 : enrichir `FlyingReaction` store avec `orbitStartAngle` / `orbitDir` à la création
- C2.4 : selectors granulaires + `React.memo` sur sous-composants si profiling le justifie
- Reset global arena (`beef_ended`) : `clearMessages` + `clearReactions` au unmount
