# Rapport — Portail auth Tier-1 (Glass + purge profils)

**Date :** 31 mai 2026  
**Statut :** ✅ Refonte appliquée  
**Prérequis DB :** trigger SQL création auto `public.users` + `needs_arena_username = true`

---

## 1. Purge création profil côté front

| Fichier | Action |
|---------|--------|
| `contexts/AuthContext.tsx` | Suppression import + appels `ensurePublicUserProfile` |
| `contexts/AuthContext.tsx` | Suppression `supabase.from('users').insert(...)` dans `signUp` |
| `app/auth/callback/page.tsx` | Suppression import + `await ensurePublicUserProfile(...)` |

**Conservé :** `lib/ensure-public-user-profile.ts` (fichier orphelin — peut être supprimé dans un commit dédié).

**Flux post-auth :** callback lit uniquement `needs_arena_username` → `/onboarding` ou `next|/feed`.

---

## 2. AuthContext — Apple & Magic Link

| Méthode | Implémentation |
|---------|----------------|
| `signInWithApple` | `signInWithOAuth({ provider: 'apple', redirectTo: /auth/callback })` |
| `signInWithMagicLink` | `signInWithOtp({ email, options: { emailRedirectTo: /auth/callback } })` |
| `signUp` | `auth.signUp` uniquement (metadata username, pas d'INSERT `users`) |

Exposées dans `AuthContextType` et le Provider.

---

## 3. Portail universel `/login` (Premium Glass)

| Critère | Détail |
|---------|--------|
| Fond page | `bg-transparent min-h-[100dvh]` — StarField global visible |
| Carte | `bg-black/40 backdrop-blur-md border border-white/10 rounded-3xl` |
| Apple | Bouton pleine largeur, icône Apple |
| Google | Bouton pleine largeur, icône Google |
| E-mail | Champ pill + « Recevoir un Lien Magique » |
| Mot de passe | Toggle « Utiliser un Mot de passe » → champ + connexion |
| `/signup` | Redirection serveur → `/login` |

---

## 4. Onboarding `/onboarding` (Premium Glass)

| Critère | Détail |
|---------|--------|
| Logique | **Conservée** — `useMemo`, debounce 320 ms, RPC `check_username_available`, submit |
| Fond | `bg-transparent min-h-[100dvh]` |
| Carte | Glass identique au login |
| Input pseudo | Pill `rounded-full bg-white/5` |
| Bordure dynamique | Vert (`free`), rouge (`taken`/`invalid`), neutre sinon |
| Avatar | Upload optionnel circulaire → bucket `avatars` au submit |
| CTA | « Rejoindre l'Arène » |

---

## 5. Fichiers modifiés

- `contexts/AuthContext.tsx`
- `app/auth/callback/page.tsx`
- `app/login/page.tsx` (réécriture)
- `app/onboarding/page.tsx` (UI glass + avatar optionnel)
- `app/signup/page.tsx` (redirect `/login`)

---

## 6. Checklist validation manuelle

- [ ] Inscription OAuth Google → profil DB auto → `/onboarding`
- [ ] Inscription Apple → idem
- [ ] Magic Link → callback → onboarding si flag true
- [ ] Email + mot de passe (compte existant)
- [ ] StarField visible à travers login et onboarding
- [ ] Pseudo temps réel (vert/rouge) + submit → `/feed`
- [ ] Aucun INSERT `users` réseau côté client (DevTools)

---

**Fin du rapport.**
