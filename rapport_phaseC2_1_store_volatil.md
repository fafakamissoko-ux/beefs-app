# Rapport Phase C2.1 — Store volatil Agora (Zustand)

**Date :** 31 mai 2026  
**Phase :** C.2.1 — Extraction chat + réactions volantes hors cycle TikTokStyleArena  
**Statut :** ✅ Terminé

---

## Objectif

Créer un store Zustand **ultra-rapide** pour gérer les états à haute fréquence de l'Agora (messages chat visibles et réactions volantes) **en dehors** du cycle de rendu du composant monolithique `TikTokStyleArena`.

---

## Fichier créé

| Fichier | Rôle |
|---------|------|
| `lib/stores/arenaVolatileStore.ts` | Store Zustand chat + réactions volantes |

---

## Contrat du store

### Hook exporté

```typescript
export const useArenaVolatileStore = create<ArenaVolatileStore>(...)
```

### Types publics

| Type | Champs |
|------|--------|
| `VisibleMessage` | `id`, `user_name`, `content`, `timestamp`, `initial` |
| `FlyingReaction` | `id`, `emoji`, `x`, `opacityMul`, `scaleMul` |

---

## Moteur de chat

| État / action | Comportement |
|---------------|--------------|
| `messages` | Tableau de `VisibleMessage` (max **40**) |
| `addMessage` | Déduplication stricte par `id` ; timestamp auto (`Date.now()`) ; `slice(-40)` |
| `deleteMessage` | Filtre par `messageId` |
| `clearMessages` | Reset `[]` |

**Garde-fous :** pas de doublons fantômes ; fenêtre glissante de 40 messages pour limiter la RAM.

---

## Moteur de réactions volantes

| État / action | Comportement |
|---------------|--------------|
| `reactions` | Tableau de `FlyingReaction` (max **40**) |
| `addReaction` | ID séquentiel module-level (`reactionIdSeq++`) ; `slice(-40)` |
| `removeReaction` | Filtre par `id` numérique |
| `clearReactions` | Reset `[]` |

**Garde-fous :** plafond 40 particules simultanées pour éviter surcharge GPU.

---

## Architecture cible (intégration future)

```
TikTokStyleArena (monolithe)
        │
        │  Realtime / handlers
        ▼
useArenaVolatileStore  ←── mutations directes (hors setState React)
        │
        ├── sous-composants chat (selectors Zustand)
        └── couche réactions volantes (canvas / motion)
```

**Phase C2.1 :** store seul — **aucun câblage** dans `TikTokStyleArena` à cette étape.

---

## Cohérence avec l'existant

Le projet utilise déjà Zustand pour l'état arena périphérique :

- `lib/stores/arenaPulseVoicesStore.ts`
- `lib/stores/arenaVerdictStore.ts`
- `contexts/MessagesDrawerContext.tsx` (drawer global)

`arenaVolatileStore` suit le même pattern (`create` + hook nommé `use*`).

---

## Validation TypeScript

```bash
npx tsc --noEmit
```

**Résultat :** ✅ exit code 0 — aucune erreur.

---

## Prochaines étapes suggérées (hors scope C2.1)

1. **C2.2** — Brancher `useArenaRealtime` / handlers chat sur `addMessage` / `deleteMessage`.
2. **C2.3** — Extraire l'UI chat en composant consommateur avec selectors Zustand (`messages` only).
3. **C2.4** — Migrer les réactions volantes vers `addReaction` / `removeReaction` + cleanup à la fin d'animation.
4. **Reset session** — appeler `clearMessages` + `clearReactions` au unmount arena ou `beef_ended`.

---

## Risques / points d'attention

1. **`reactionIdSeq` module-level** — persiste entre navigations ; acceptable si `clearReactions` est appelé au changement de room.
2. **Pas de persistance** — volatil par design ; pas de sync Supabase dans ce store.
3. **Selectors** — lors de l'intégration, préférer des selectors fins pour éviter re-renders inutiles des sous-arbres.
