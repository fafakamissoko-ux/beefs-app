# Rapport d'audit — Moteur de Données (Frappe B)

**Date :** 31 mai 2026  
**Périmètre :** analyse statique, zéro modification de code  
**Objectif :** préparer la migration vers **react-hook-form + zod**, **@tanstack/react-query**, et **zustand**

---

## Synthèse exécutive

| Axe | Verdict | État actuel |
|-----|---------|-------------|
| **1. Formulaires** | 🔴 Refonte requise | `useState` multiples, validation impérative inline ; aucune lib de formulaires |
| **2. Fetching / cache** | 🔴 Refonte requise | Pattern `useEffect` + Supabase direct ; aucune couche cache |
| **3. État global** | 🟡 Refonte partielle | 4 Context React à la racine ; zustand limité à l'Arena |

**Dépendances présentes (`package.json`) :** `zustand ^4.5.0` uniquement.  
**Absentes :** `react-hook-form`, `zod`, `@tanstack/react-query`.

---

## Axe 1 — Gestion des formulaires

### Verdict : 🔴 Bricolage — refonte recommandée

Le projet n'utilise ni react-hook-form ni zod. Tous les formulaires cibles reposent sur des blocs `useState` indépendants, une validation impérative dans les handlers (`if (!x) setError(...)`), et des libs métier maison (`lib/password-policy.ts`, `lib/email-signup-policy.ts`, `lib/arena-onboarding.ts`) qui **ne sont pas branchées sur un schéma déclaratif**.

### Inventaire des cibles

| Fichier | `useState` (approx.) | Validation | Notes |
|---------|---------------------|------------|-------|
| `app/login/page.tsx` | **11** | Inline (`trimmedIdentifier`, `password`) ; pas de zod | Portail unifié auth (OAuth, magic link, password) |
| `app/signup/page.tsx` | 0 | — | **Redirect** vers `/login` — pas de formulaire dédié |
| `app/forgot-password/page.tsx` | **5** | `validateSignupEmail()` au blur + submit | Pattern répétitif mais isolé |
| `app/onboarding/useOnboarding.ts` | **10** | `isValidArenaUsername()` + RPC debounced | Machine à étapes manuelle (`step`) |
| `app/settings/page.tsx` | **11+** | `validatePasswordPolicy()` ; if/else email | **~1377 lignes**, monolithe (profil, MDP, email, notifs, wallet, retrait) |
| `components/settings/WithdrawalWizard.tsx` | multiple | Validation inline par étape | Wizard multi-étapes sans RHF |

### Patterns observés

**1. Multiplication des états locaux**

Exemple `app/login/page.tsx` :
- Champs : `identifier`, `password`, `isMagicLinkMode`, `showPassword`
- Erreurs : `identifierError`, `passwordError`, `oauthError`
- Loaders : `appleLoading`, `googleLoading`, `magicLoading`, `passwordLoading`
- UX : `magicLinkSent`

Chaque champ + erreur + loader = triplet de state ; pas de `register()` / `formState.errors`.

**2. Validation en cascade if/else**

```typescript
// Pattern récurrent (login, forgot-password, settings)
if (!trimmedIdentifier) {
  setIdentifierError('Indique ton e-mail ou @pseudo.');
  return;
}
if (!password) {
  setPasswordError('Indique ton mot de passe.');
  return;
}
```

**3. Libs métier existantes (atout pour zod)**

| Module | Rôle | Migrable en schéma zod |
|--------|------|------------------------|
| `lib/password-policy.ts` | Regex longueur, maj/min, chiffre, spécial | ✅ `.refine()` ou `.superRefine()` |
| `lib/email-signup-policy.ts` | Emails jetables, format | ✅ `z.string().email()` + custom |
| `lib/arena-onboarding.ts` | Username arena (longueur, charset) | ✅ `z.string().regex(...)` |

Ces modules centralisent déjà la logique métier — la migration zod consistera surtout à **wrapper** ces fonctions plutôt qu'à réécrire la politique.

**4. Settings : anti-pattern majeur**

`app/settings/page.tsx` concentre :
- Formulaire profil (`display_name`, `bio`, `accent_color`)
- Changement email (email + mot de passe actuel)
- Changement mot de passe (ancien + nouveau + confirmation)
- Préférences notifications (`localStorage` + state)
- Onglets UI (`activeTab`)
- Fetch profil + transactions intégrés dans le même composant

→ Candidat prioritaire à **découpage** (sous-composants + RHF par domaine).

**5. Onboarding**

`useOnboarding.ts` :
- Debounce username 320 ms + RPC `check_username_available`
- Upload avatar Storage inline
- Pas de validation schématique sur `displayName` / `bio`

### Ce qui est déjà acceptable

- Politiques mot de passe / email **centralisées** dans `lib/` (pas de regex éparpillées dans le JSX).
- Composant `InlineFieldError` réutilisé (login, forgot-password) — bon pattern UX à conserver avec RHF (`errors.field.message`).

### Recommandation migration (Axe 1)

| Priorité | Cible | Effort |
|----------|-------|--------|
| P0 | `app/settings/page.tsx` — extraire sous-formulaires (profil, MDP, email) | Élevé |
| P1 | `app/onboarding/useOnboarding.ts` — schéma zod username + RHF | Moyen |
| P2 | `app/login/page.tsx` + `app/forgot-password/page.tsx` | Faible |
| P3 | `WithdrawalWizard.tsx` | Moyen |

**Schémas zod initiaux suggérés :** `loginSchema`, `passwordChangeSchema`, `profileSchema`, `onboardingIdentitySchema`.

---

## Axe 2 — Fetching de données et cache (hors temps réel)

### Verdict : 🔴 Bricolage — refonte requise

Aucune couche de cache client. Le pattern dominant :

```
useCallback(loadX) → useEffect(() => void loadX(), [deps]) → supabase.from(...).select(...)
```

Chaque montage de page ou ouverture de modal relance les requêtes. Pas de déduplication, pas de `staleTime`, pas d'invalidation structurée après mutation.

**Hors périmètre react-query (temps réel) :** `hooks/useArenaRealtime.ts`, badges Header Realtime, subscriptions Supabase live — à conserver telles quelles.

### Inventaire des fetchers manuels

| Composant / page | Déclencheur | Requêtes typiques | Cache ? |
|------------------|-------------|-------------------|---------|
| `app/profile/[username]/page.tsx` | Montage (`loadProfile`) | 5–10+ appels séquentiels (profil, followers, beefs RPC, likes…) | ❌ |
| `app/profile/ProfileContent.tsx` | `useEffect` sur `user.id` | Profil complet + stats + beefs + médiation | ❌ |
| `components/FollowListModal.tsx` | Montage modal | `followers` + `fetchUserPublicByIds` + état follow (2e `useEffect`) | ❌ |
| `components/AuraGiversModal.tsx` | `isOpen === true` | RPC `get_universal_aura_givers` / `get_beef_viewers` | ❌ |
| `app/settings/page.tsx` | Montage | `users` profil + `transactions` (50 lignes) | ❌ |
| `app/points/page.tsx` | Montage | `users.points` + `transactions` (80 lignes) en `Promise.all` | ❌ |
| `components/GlobalSearchBar.tsx` | Debounce query | `beefs.ilike` + `user_public_profile.ilike` | ❌ |
| `contexts/ThemeContext.tsx` | `user` change | `users.display_preferences` | ❌ |
| `app/onboarding/useOnboarding.ts` | Montage | `users` select partiel | ❌ |

### Analyse détaillée — profil public

`app/profile/[username]/page.tsx` (~985 lignes) illustre le problème :

1. `supabase.auth.getUser()`
2. Branche auth / anon → `user_public_profile` ou RPC `get_public_profile_by_username`
3. Comptes followers/following (2 requêtes ou RPC `get_public_follow_counts`)
4. Beefs hébergés + participations (requêtes table ou RPC `get_public_profile_beefs_payload`)
5. État follow, likes média, onglets — tout dans le même composant

**Conséquence :** navigation profil A → profil B → retour A = **re-fetch complet**. Ouverture modal abonnés = **re-fetch** même si la liste était déjà chargée sur la page profil.

### Analyse — FollowListModal

```typescript
// components/FollowListModal.tsx — pattern type
const loadList = useCallback(async () => { ... supabase ... }, [userId, type]);
useEffect(() => { void loadList(); }, [loadList]);
// 2e useEffect pour followingIds si user connecté
```

Pas de clé de cache (`['followers', userId]`), pas de partage avec le compteur affiché sur le profil.

### Analyse — transactions / Aura

| Page | Données | Duplication |
|------|---------|-------------|
| `app/settings/page.tsx` | `transactions` limit 50 | Doublon partiel |
| `app/points/page.tsx` | `transactions` limit 80 + solde | Même table, requêtes séparées |

→ Candidat `useQuery(['transactions', userId])` avec invalidation après achat/retrait.

### Ce qui est déjà acceptable

- **`Promise.all`** sur `app/points/page.tsx` (parallélisation solde + tx).
- **`fetchUserPublicByIds`** (`lib/fetch-user-public-profile.ts`) — helper batch pour éviter N+1 sur les profils publics.
- **RPC Postgres** (`get_public_profile_beefs_payload`, `get_public_follow_counts`) — bonne délégation serveur ; react-query s'appuiera dessus sans changer l'API.

### Recommandation migration (Axe 2)

| Priorité | Query key suggérée | Invalidation après |
|----------|-------------------|-------------------|
| P0 | `['profile', username]` | Edit profil settings |
| P0 | `['followers', userId]` / `['following', userId]` | Follow/unfollow |
| P1 | `['transactions', userId]` | Achat points, retrait, gift |
| P1 | `['aura-givers', targetId, type]` | Gift aura |
| P2 | `['search', tab, query]` | — (staleTime court, ex. 30 s) |
| P3 | `['display-preferences', userId]` | Update theme settings |

**Setup minimal :** `QueryClientProvider` dans `app/layout.tsx`, hooks `lib/queries/*.ts`.

---

## Axe 3 — État global (State Management)

### Verdict : 🟡 Refonte partielle

Quatre Context React imbriqués à la racine (`app/layout.tsx`) :

```
AuthProvider
  └ ThemeProvider
      └ ToastProvider
          └ GlobalSearchProvider
              └ MessagesDrawerProvider
                  └ AppShell / pages
```

**zustand** déjà utilisé, mais **uniquement pour l'Arena** :
- `lib/stores/arenaVerdictStore.ts`
- `lib/stores/arenaPulseVoicesStore.ts`

→ Le pattern zustand est connu dans le codebase ; il n'a pas été généralisé au reste de l'app.

### Analyse par contexte

#### `contexts/AuthContext.tsx` — 🟡 Nécessaire mais lourd

**État exposé :** `user`, `session`, `loading`, `userRole`  
**Méthodes :** `signUp`, `signIn`, `signInWithGoogle`, `signInWithApple`, `signInWithMagicLink`, `sendPhoneOtp`, `verifyPhoneOtp`, `signOut`, `resetPassword`

**Problème de perf :**
```typescript
const value = {
  user, session, loading, userRole,
  signUp, signIn, signInWithGoogle, // … non mémoïsées
};
return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
```

- L'objet `value` est **recréé à chaque render** du Provider.
- Les méthodes auth ne sont **pas** enveloppées dans `useCallback`.
- ~35+ composants consomment `useAuth()` → tout changement `user` / `loading` / `userRole` propage un re-render à tous les consommateurs (même ceux qui n'utilisent que `signOut`).

**Verdict :** Garder l'auth dans un contexte (ou migrer session vers zustand + sélecteurs) ; **mémoïser** le value ou scinder en `AuthStateContext` + `AuthActionsContext`.

#### `contexts/GlobalSearchContext.tsx` — 🟢 Déjà optimisé (partiellement)

- Expose uniquement `openSearch` / `closeSearch` (callbacks `useCallback` stables).
- L'état `open` reste local au Provider ; la modal est rendue **dans** le Provider (pas via contexte).
- Les consommateurs de `useGlobalSearch()` ne re-render **pas** quand la modal s'ouvre.

**Limite :** `{children}` du Provider re-render quand `open` change (React tree parent), mais sans impact sur les hooks context des pages.

**Verdict :** Peu prioritaire pour zustand ; optionnel si on veut éviter le re-render des `children` (store + portal).

#### `contexts/MessagesDrawerContext.tsx` — 🔴 Candidat zustand

**État :** `isDrawerOpen`, `targetUserId`  
**Consommateurs :** `Header`, `GlobalMessagesDrawer`, `MessagesUI`, `GlobalDuelAmbush`, etc.

Chaque ouverture/fermeture du tiroir messages change le contexte → **re-render de tous les consommateurs**, y compris le Header.

**Verdict :** Migrer vers `useMessagesDrawerStore` avec sélecteurs (`s => s.isDrawerOpen`) pour limiter les abonnements.

#### `contexts/ThemeContext.tsx` — 🟡 Modéré

**État :** `preferences` (fontSize, reduceAnimations, highContrast)  
**Fetch :** `useEffect` Supabase au changement `user`  
**Effet DOM :** 2e `useEffect` applique classes sur `document.documentElement`

Peu de consommateurs directs, mais `updatePreferences` déclenche re-render + write Supabase.

**Verdict :** zustand + react-query pour les prefs ; effet DOM dans un subscriber ou hook dédié.

### Cartographie des re-renders

| Contexte | Fréquence de changement | Impact estimé |
|----------|------------------------|---------------|
| AuthContext | Login/logout, refresh session | **Élevé** (~35 consommateurs) |
| MessagesDrawerContext | Ouverture tiroir messages | **Moyen-élevé** (Header + drawer) |
| ThemeContext | Rare (settings accessibilité) | **Faible** |
| GlobalSearchContext | Ouverture recherche | **Faible** (value stable) |

### Recommandation migration (Axe 3)

| Priorité | Action |
|----------|--------|
| P0 | `MessagesDrawerContext` → `lib/stores/messagesDrawerStore.ts` |
| P1 | Mémoïser `AuthContext` value OU scinder state/actions |
| P2 | `ThemeContext` prefs → zustand + react-query |
| P3 | GlobalSearch (optionnel) |

**Ne pas migrer en zustand :** logique auth Supabase (`onAuthStateChange`) — rester dans un Provider ou hook dédié ; zustand pour l'état dérivé uniquement.

---

## Matrice risques / breaking changes

| Risque | Mitigation |
|--------|------------|
| Settings monolithique — régression lors du découpage RHF | Migration par onglet ; tests manuels profil/MDP/email |
| Profil public — timing des 10 requêtes séquentielles | react-query `enabled` + parallélisation où possible |
| AuthContext — régression login OAuth | Ne pas déplacer les méthodes auth avant mémoïsation |
| Double source vérité (context + zustand) | Migration atomique par domaine (drawer d'abord) |
| Realtime vs react-query | Documenter : Realtime = push ; react-query = pull/cache |

---

## Plan de migration suggéré (ordre Frappe B)

### Phase B1 — Fondations
1. Installer `zod`, `react-hook-form`, `@hookform/resolvers`, `@tanstack/react-query`
2. `QueryClientProvider` + DevTools (dev only) dans layout
3. Créer `lib/schemas/` (zod) à partir des modules `lib/password-policy`, `lib/email-signup-policy`, `lib/arena-onboarding`

### Phase B2 — Fetching (gain immédiat perf)
1. Queries profil public + followers/following
2. Query transactions (settings + points unifiés)
3. AuraGiversModal, FollowListModal

### Phase B3 — Formulaires
1. Découper settings → RHF + zod par section
2. Onboarding hook → RHF
3. Login / forgot-password

### Phase B4 — État global
1. `messagesDrawerStore` (zustand)
2. Mémoïsation / scission AuthContext
3. Theme prefs → store + query

---

## Conclusion

Les trois axes cibles de la Frappe B sont **en bricolage fonctionnel** plutôt qu'optimisés :

1. **Formulaires** — entièrement manuels ; les libs métier existantes facilitent l'adoption zod mais RHF est absent partout.
2. **Fetching** — Supabase est sollicité à chaque montage ; aucune stratégie cache ; profil public et modales sont les pires offenders.
3. **État global** — Context React racine avec Auth non mémoïsé et MessagesDrawer propagateur de re-renders ; zustand prouvé sur Arena mais non généralisé.

**Aucune des cibles techniques n'est en place** (sauf zustand partiel). La refonte est justifiée et peut être incrémentale en suivant le plan B1→B4 ci-dessus.

---

*Audit généré sans modification du code source — prêt pour validation GO/VALIDÉ avant implémentation.*
