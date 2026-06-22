# Rapport Phase B2 — Profils → @tanstack/react-query

**Date :** 31 mai 2026  
**Phase :** Frappe B — Moteur de Données (migration fetching profils)  
**Statut :** ✅ Terminé

---

## Objectif

Remplacer le pattern `useEffect` + `loadProfile` + multiples `useState` par **`useQuery`**, en préservant strictement la logique Supabase existante. Conserver les états locaux modifiables (`isFollowing`, `mediaLikes`) synchronisés depuis le cache.

---

## Fichiers modifiés

| Fichier | Changement |
|---------|------------|
| `app/profile/[username]/page.tsx` | `useQuery` `['public-profile', username, user?.id]` |
| `app/profile/ProfileContent.tsx` | `useQuery` `['owner-profile', user?.id]` |

**Prérequis B1 (inchangé dans ce commit si déjà présent) :**
- `components/QueryProvider.tsx`
- `app/layout.tsx` — enveloppe `QueryProvider`

---

## Phase B2.1 — Profil public (`app/profile/[username]/page.tsx`)

### Supprimé
- `useState` : `profile`, `stats`, `beefs`, `participantBeefs`, `loading`
- `loadProfile` (`useCallback`) + `useEffect` de montage

### Conservé (états UI / optimistes)
- `isFollowing` — sync depuis `data.isFollowing` + mise à jour via `FollowButton.onSynced`
- `mediaLikes` — sync depuis `data.mediaLikes` + optimistic update dans `handleMediaAuraClick`

### Query

```typescript
queryKey: ['public-profile', username, user?.id]
enabled: !!username
```

**`queryFn`** — logique identique à l'ancien `loadProfile` :
- Branche **anon** : RPC `get_public_profile_by_username`, `get_public_follow_counts`, `get_public_profile_beefs_payload`
- Branche **auth** : `user_public_profile` / `users`, counts followers, beefs hosted/participated, check follow, `profile_media_likes`

**Retour typé `PublicProfileQueryData` :**
`profile`, `stats`, `beefs`, `participantBeefs`, `mediaLikes`, `isFollowing`

### Dérivation

```typescript
const profile = data?.profile ?? null;
const stats = data?.stats ?? EMPTY_STATS;
const beefs = data?.beefs ?? [];
const participantBeefs = data?.participantBeefs ?? [];
```

### Sync états modifiables

```typescript
useEffect(() => {
  if (data) {
    setIsFollowing(data.isFollowing);
    setMediaLikes(data.mediaLikes);
  }
}, [data]);
```

### FollowButton — cache update

`queryClient.setQueryData` met à jour `stats.followers` et `profile.lifetime_points` après follow/unfollow (remplace `setStats` / `setProfile`).

---

## Phase B2.2 — Profil propriétaire (`app/profile/ProfileContent.tsx`)

### Supprimé
- `useState` : `profile`, `stats`, `beefs`, `mediationBeefs`, `loading`
- `useEffect` contenant `loadProfile`

### Query

```typescript
queryKey: ['owner-profile', user?.id]
enabled: !!user?.id
```

**`queryFn`** — logique préservée :
1. `users.select` (+ insert si absent)
2. Counts followers/following
3. Beefs médiés + participations (merge + attachHost)
4. Noms médiateurs via `user_public_profile`

### Invalidation cache (upload avatar/bannière)

Après toast succès dans `handleProcessCroppedImage` :

```typescript
queryClient.invalidateQueries({ queryKey: ['owner-profile', user.id] });
```

### Optimistic update — médiation beef

`applyMediationBeefPatch` utilise `queryClient.setQueryData<OwnerProfileQueryData>` au lieu de `setBeefs` / `setMediationBeefs`.

---

## Validation TypeScript

```bash
npx tsc --noEmit
```

**Résultat :** exit code **0**

---

## Bénéfices immédiats

| Avant | Après |
|-------|-------|
| Re-fetch complet à chaque montage | Cache 60 s (`QueryProvider` staleTime) |
| 12+ requêtes séquentielles non partagées | Même logique, mais déduplication par clé |
| État fetch mélangé avec UI | Séparation query cache / états optimistes |

---

## Prochaines étapes (B2 suite)

- `FollowListModal` → `['followers', userId]` / `['following', userId]`
- `app/settings/page.tsx` + `app/points/page.tsx` → `['transactions', userId]`
- Invalidation croisée : follow → invalider `public-profile` + listes followers

---

*Phase B2 profils validée — commit avec B1 (QueryProvider).*
