# Rapport Phase I.1 — Chat Performance (sans virtualisation)

**Date :** 2026-07-01  
**Branche :** `main`  
**Validation :** `npx tsc --noEmit` — exit 0

---

## Objectifs

1. Extraire `ArenaChatMessages` du monolithe `TikTokStyleArena.tsx`
2. Cap messages Zustand : **40 → 80**
3. Purger scroll manuel parent/enfant (double rAF, `scrollChatToEnd`, visualViewport)
4. Scroll-to-bottom moderne : refs internes + `content-visibility:auto`
5. **Pas** de librairie de virtualisation (liste plafonnée)

---

## Fichiers modifiés

| Fichier | Action |
|---------|--------|
| `lib/stores/arenaVolatileStore.ts` | `slice(-80)` dans `addMessage` |
| `components/ArenaChatMessages.tsx` | **Créé** — composant isolé |
| `components/TikTokStyleArena.tsx` | Import, purge scroll, suppression export inline |

---

## Détail — Store

```typescript
return { messages: [...state.messages, { ...msg, timestamp: Date.now() }].slice(-80) };
```

Réactions inchangées : `.slice(-40)`.

---

## Détail — `ArenaChatMessages.tsx`

- Refs **internes** : `scrollRef` (conteneur), `endRef` (ancre)
- `useLayoutEffect([messages])` → `endRef.scrollIntoView({ behavior: 'smooth', block: 'end' })`
- `[content-visibility:auto]` sur chaque bulle
- Glass desktop : `bg-slate-900/40 backdrop-blur-sm border border-white/10 shadow-lg`
- `getUsernameColor` déplacé dans le fichier isolé

---

## Purge `TikTokStyleArena.tsx`

**Supprimé :**
- `getUsernameColor` (dupliqué → composant chat)
- `chatMessagesScrollRef`, `chatMessagesEndRef`, `chatMessagesMobile*`
- `scrollChatToEnd()` (double rAF)
- `useEffect` visualViewport → scroll
- `queueMicrotask` + timeouts scroll après envoi message
- Export inline `ArenaChatMessages` (~65 lignes)

**JSX :**
```tsx
<ArenaChatMessages isMobile={false} />
<ArenaChatMessages isMobile />
```

---

## Architecture post-I.1

```
addMessage (cap 80)
  → useArenaVolatileStore.messages
  → ArenaChatMessages (refs internes)
  → scrollIntoView(endRef) on [messages]
```

---

## QA recommandée

1. Chat desktop + mobile : auto-scroll bas à l’arrivée de messages
2. Envoi message local : scroll sans lag (plus de triple timeout)
3. Clavier mobile : vérifier visibilité dernière bulle (visualViewport listener retiré — surveiller régression)
4. 80+ messages realtime : cap RAM respecté

---

*Fin du rapport Phase I.1.*
