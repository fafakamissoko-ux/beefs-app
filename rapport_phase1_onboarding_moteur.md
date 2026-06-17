# Rapport Phase 1 — Moteur onboarding & sync trigger auth

**Date :** 31 mai 2026  
**Statut :** terminé — `npx tsc --noEmit` OK  
**Scope :** logique pure + archive SQL (pas d'UI)

---

## 1. Migration archive — `103_sync_auth_trigger.sql`

**Chemin :** `supabase/migrations/103_sync_auth_trigger.sql`

| Élément | Contenu |
|---------|---------|
| Fonction | `public.handle_new_user()` — `SECURITY DEFINER` |
| Trigger | `on_auth_user_created` — `AFTER INSERT ON auth.users` |
| INSERT | `id`, `email`, `username` (`temp_*`), `display_name`, `avatar_url`, `needs_arena_username: true` |
| Idempotence | `ON CONFLICT (id) DO NOTHING` |

**Note :** fichier de **versionnement uniquement** — trigger déjà actif en prod ; non exécuté via CLI dans cette phase.

---

## 2. State machine — `app/onboarding/useOnboarding.ts`

### Étapes

```typescript
type Step = 'welcome' | 'identity' | 'bio' | 'complete';
```

Ordre : `welcome` → `identity` → `bio` → `complete`

### Règles `canProceedToNextStep`

| Step | Condition |
|------|-----------|
| `welcome` | toujours `true` |
| `identity` | `displayName.trim()` non vide + username valide + dispo (`free`) |
| `bio` | `bio.trim()` non vide |
| `complete` | identity + bio valides + non `submitting` |

### Validation username

- Sanitize / validate via `lib/arena-onboarding.ts`
- Debounce **320 ms** → RPC `check_username_available`
- État : `UsernameAvailability` = `'idle' | 'checking' | 'free' | 'taken' | 'invalid'`

### `submitOnboarding(userId)`

1. Re-valide display name, username, bio
2. Upload avatar optionnel → bucket `avatars`
3. `UPDATE users` : `username`, `display_name`, `bio`, `needs_arena_username: false`, `avatar_url?`
4. `router.replace('/feed')`
5. Gestion erreur unique `23505` → retour step `identity`

---

## 3. API exposée par `useOnboarding()`

| Export | Type / rôle |
|--------|-------------|
| `step` | `Step` — étape courante |
| `setStep` | `(Step) => void` — saut direct (UI avancée) |
| `nextStep` | `() => void` — avance si `canProceedToNextStep` |
| `prevStep` | `() => void` — recule dans `STEPS` |
| `canProceedToNextStep` | `boolean` |
| `avatarFile` | `File \| null` |
| `avatarPreview` | `string \| null` — URL blob ou existante |
| `setAvatarFromFile` | `(File \| null) => void` |
| `displayName` | `string` |
| `setDisplayName` | `(string) => void` |
| `rawUsernameInput` | `string` — saisie brute |
| `username` | `string` — sanitized (memo) |
| `setUsernameInput` | `(raw: string) => void` |
| `bio` | `string` |
| `setBio` | `(string) => void` |
| `usernameAvailability` | `UsernameAvailability` |
| `initialUsername` | `string \| null` — username DB au chargement |
| `submitting` | `boolean` |
| `submitError` | `string \| null` |
| `setSubmitError` | `(string \| null) => void` |
| `loadProfile` | `(userId: string) => Promise<void>` — hydrate depuis `users` |
| `submitOnboarding` | `(userId: string) => Promise<void>` |
| `constants` | `{ ARENA_USERNAME_MIN, ARENA_USERNAME_MAX }` |

Types exportés : `Step`, `UsernameAvailability`

---

## 4. Validation TypeScript

```
npx tsc --noEmit → OK
```

---

## 5. Prochaine phase (hors scope)

- Brancher `useOnboarding` dans `app/onboarding/page.tsx` (Premium Glass UI)
- `page.tsx` actuelle reste inchangée dans cette phase

---

*Phase 1 moteur — trigger versionné + hook state machine prêt pour l'UI.*
