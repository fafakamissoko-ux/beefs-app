# Rapport Phase B4 — État global (Zustand MessagesDrawer + Auth mémoïsé)

**Date :** 31 mai 2026  
**Phase :** Frappe B.4 — Contextes → Zustand / optimisation Auth  
**Statut :** ✅ Terminé

---

## Objectif

- Remplacer `MessagesDrawerContext` (React Context) par un **store Zustand** drop-in (`useMessagesDrawer` inchangé côté consommateurs).
- **Mémoïser** l'objet `value` de `AuthContext` pour limiter les re-renders en cascade.
- Retirer le Provider drawer de l'arbre React (`layout.tsx`).

---

## Fichiers modifiés

| Fichier | Changement |
|---------|------------|
| `contexts/MessagesDrawerContext.tsx` | Context → `create()` Zustand + coquille `MessagesDrawerProvider` |
| `contexts/AuthContext.tsx` | `useMemo` sur `value` |
| `app/layout.tsx` | Suppression import + balises `MessagesDrawerProvider` |

---

## B4.1 — MessagesDrawer → Zustand

### Avant
- `createContext` + `useState` + `Provider`
- `useMessagesDrawer()` via `useContext`
- Provider requis dans `layout.tsx`

### Après

```typescript
export const useMessagesDrawer = create<MessagesDrawerContextValue>((set) => ({
  isDrawerOpen: false,
  targetUserId: undefined,
  openDrawer: (userId) => set({ isDrawerOpen: true, targetUserId: userId }),
  closeDrawer: () => {
    set({ isDrawerOpen: false });
    setTimeout(() => set({ targetUserId: undefined }), 300);
  },
}));
```

### Contrat préservé

| API | Statut |
|-----|--------|
| `useMessagesDrawer()` | ✅ même nom exporté |
| `isDrawerOpen`, `targetUserId` | ✅ |
| `openDrawer(userId?)`, `closeDrawer()` | ✅ |
| Délai 300 ms avant reset `targetUserId` | ✅ |

### Consommateurs (inchangés)

- `components/GlobalMessagesDrawer.tsx`
- `components/MessagesUI.tsx`
- `components/Header.tsx`
- `components/TikTokStyleArena.tsx`

**Note :** `MessagesDrawerProvider` reste exporté comme fragment pass-through pour compat imports legacy ; **plus utilisé** dans `layout.tsx`.

---

## B4.2 — AuthContext mémoïsé

### Modification

```typescript
const value = useMemo(
  () => ({ user, session, loading, userRole, signUp, signIn, ... }),
  [user, session, loading, userRole],
);
```

- Import `useMemo` ajouté ( `useCallback` conservé pour `loadUserRole` ).
- `eslint-disable-next-line react-hooks/exhaustive-deps` sur les deps — méthodes auth non wrappées `useCallback` (comme avant).

### Effet attendu

- `value` ne change de référence que si `user`, `session`, `loading` ou `userRole` changent.
- Réduction des re-renders des ~40 consommateurs `useAuth()` lors de re-renders internes du Provider sans mutation de session.

### Limite connue

Les fonctions auth (`signUp`, `signIn`, …) sont **toujours recréées** à chaque render du Provider ; elles ne déclenchent un nouveau `value` que via les 4 deps d'état. Phase ultérieure possible : `useCallback` sur actions ou migration partielle Zustand auth.

---

## B4.3 — Arbre `app/layout.tsx`

### Retiré

```tsx
import { MessagesDrawerProvider } from "@/contexts/MessagesDrawerContext";
// ...
<MessagesDrawerProvider>...</MessagesDrawerProvider>
```

### Chaîne providers actuelle

```
QueryProvider
  └ AuthProvider
      └ ThemeProvider
          └ ToastProvider
              └ GlobalSearchProvider
                  └ BetaGate → AppShell + drawers globaux
```

Zustand MessagesDrawer : **hors arbre React**.

---

## Validation TypeScript

```bash
npx tsc --noEmit
```

**Résultat :** exit code **0** ✅

---

## Bilan Phase B (état global)

| Composant état | Avant B4 | Après B4 |
|----------------|----------|----------|
| Messages drawer | React Context + Provider | Zustand store |
| Auth session | Context value non mémoïsé | `useMemo` sur value |
| Settings forms | Monolithe | RHF + zod (B3) |
| Data fetching | useEffect | react-query (B2) |

---

*Fin du rapport Phase B4.*
