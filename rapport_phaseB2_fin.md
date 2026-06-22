# Rapport Phase B2 — Finalisation fetching secondaire

**Date :** 31 mai 2026  
**Phase :** Frappe B — Moteur de Données (B2 fin)  
**Statut :** ✅ Terminé

---

## Objectif

Supprimer **tous les `useEffect` de fetching** dans trois composants et les remplacer par **`useQuery`**, avec clés de cache strictes et mises à jour optimistes via **`queryClient.setQueryData`**.

---

## Fichiers modifiés

| Fichier | Query key | Changements |
|---------|-----------|-------------|
| `app/points/page.tsx` | `['wallet', user?.id]` | Suppression `useState` balance/transactions/loading + fetch `useEffect` |
| `components/FollowListModal.tsx` | `['follow-list', type, userId, user?.id]` | Fusion des 2 fetch `useEffect` ; optimistic follow via cache |
| `components/AuraGiversModal.tsx` | `['aura-givers', targetId, type]` | Fetch uniquement si `isOpen && !!targetId` |

---

## Étape 1 — Transactions (`app/points/page.tsx`)

### Avant
- `useState`: `balance`, `transactions`, `loading`
- `useEffect` + `Promise.all` (users.points + transactions limit 80)

### Après

```typescript
const { data, isLoading: loading } = useQuery({
  queryKey: ['wallet', user?.id],
  enabled: !!user?.id,
  queryFn: async () => ({
    points: pointsData?.points ?? 0,
    transactions: (txData ?? []) as Transaction[],
  }),
});

const points = data?.points ?? 0;
const transactions = data?.transactions ?? [];
```

### Conservé
- `useEffect` **auth redirect** uniquement (`/login?redirect=/points`) — hors fetching données

### Invalidation future
```typescript
queryClient.invalidateQueries({ queryKey: ['wallet', userId] });
```
Après achat Lingots, gift, retrait (aligner avec `app/settings/page.tsx`).

---

## Étape 2 — Réseau (`components/FollowListModal.tsx`)

### Avant
- `useEffect` → `loadList()` (followers IDs + `fetchUserPublicByIds`)
- 2e `useEffect` → statut follow du visiteur (`followingIds: Set<string>`)
- Optimistic : `setFollowingIds`

### Après

**Query fusionnée** — retour typé `FollowListQueryData` :
```typescript
{ users: ListedUser[]; isFollowingMap: Record<string, boolean> }
```

**Optimistic follow/unfollow** :
```typescript
queryClient.setQueryData<FollowListQueryData>(
  ['follow-list', type, userId, user.id],
  (old) => ({
    ...old,
    isFollowingMap: { ...old.isFollowingMap, [targetId]: !wasFollowing },
  }),
);
```
Rollback identique en cas d'erreur API.

### Conservé
- `actionId` (état UI bouton en cours)
- Helper `followListQueryKey()` pour cohérence clé setQueryData / useQuery

### Invalidation croisée future
- Follow/unfollow → `['public-profile', username, viewerId]`
- Compteurs followers sur profil public

---

## Étape 3 — Aura (`components/AuraGiversModal.tsx`)

### Avant
- `useEffect` sur `[isOpen, targetId, type, ownerId]`
- États : `givers`, `isLoading`, `currentUser`

### Après

```typescript
const { data, isLoading: loading } = useQuery({
  queryKey: ['aura-givers', targetId, type],
  enabled: isOpen && !!targetId,
  queryFn: async () => {
    // getSession → si anon : { givers: [], currentUserId: null }
    // type === 'views' → get_beef_viewers
    // sinon → get_universal_aura_givers (p_target_id, p_type, p_owner_id)
  },
});

const items = data?.givers ?? [];
const currentUser = data?.currentUserId ?? null;
```

**Note :** `ownerId` reste paramètre RPC mais **hors query key** (spec Architecte). Cache partagé entre viewers pour même `(targetId, type)`.

### UI préservée
- Loading spinner
- État anonyme (cadenas → `/signup`)
- Limite 7 givers pour non-propriétaire

---

## Validation TypeScript

```bash
npx tsc --noEmit
```

**Résultat :** exit code **0**

---

## Matrice des query keys (B2 complet)

| Query key | Composant | enabled |
|-----------|-----------|---------|
| `['public-profile', username, user?.id]` | Profil public | `!!username` |
| `['owner-profile', user?.id]` | ProfileContent | `!!user?.id` |
| `['wallet', user?.id]` | `/points` | `!!user?.id` |
| `['follow-list', type, userId, user?.id]` | FollowListModal | `!!userId` |
| `['aura-givers', targetId, type]` | AuraGiversModal | `isOpen && !!targetId` |

---

## Prochaines étapes (B3)

1. Migrer `app/settings/page.tsx` transactions → partager `['wallet', userId]`
2. `useMutation` follow avec invalidation centralisée
3. Formulaires → react-hook-form + zod (Frappe B formulaires)

---

*Phase B2 fetching secondaire validée.*
