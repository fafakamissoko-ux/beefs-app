# Rapport Phase B3.1 — Schémas Zod & formulaire Profil Settings

**Date :** 31 mai 2026  
**Phase :** Frappe B — Moteur de Données (refonte formulaires Settings)  
**Statut :** ✅ Terminé

---

## Objectif

Initier la refonte des formulaires Settings avec **react-hook-form** + **@hookform/resolvers/zod**, en centralisant la validation dans `lib/schemas/index.ts` et en extrayant le formulaire profil du monolithe `app/settings/page.tsx`.

---

## Fichiers créés

| Fichier | Rôle |
|---------|------|
| `lib/schemas/index.ts` | Schémas Zod centralisés (profil, e-mail, mot de passe) |
| `components/settings/ProfileSettingsForm.tsx` | Formulaire profil autonome (RHF + mutation react-query) |

## Fichiers modifiés

| Fichier | Changement |
|---------|------------|
| `app/settings/page.tsx` | Remplacement du bloc display_name / bio / bouton save par `<ProfileSettingsForm />` ; suppression de `handleSaveProfile` |

---

## Étape 1 — `lib/schemas/index.ts`

### Schémas exportés

| Schéma | Champs | Politique métier via `.refine()` |
|--------|--------|----------------------------------|
| `profileSchema` | `display_name` (2–30), `bio` (max 160), `accent_color` | Contraintes zod natives |
| `emailChangeSchema` | `new_email`, `password` | `validateSignupEmail` + `isDisposableEmailDomain` |
| `passwordChangeSchema` | `current_password`, `new_password`, `confirm_password` | `validatePasswordPolicy` + égalité confirm |

### Types inférés

- `ProfileFormValues`
- `EmailChangeFormValues`
- `PasswordChangeFormValues`

### Adaptation TypeScript (password)

Le snippet Architecte comparait `validatePasswordPolicy(val)` à `true`, ce qui provoquait **TS2367** (`res` est `{ ok: boolean }`, jamais un booléen nu). Correction minimale :

```typescript
.refine((val) => validatePasswordPolicy(val).ok === true, ...)
```

Comportement métier identique ; compilation `tsc --noEmit` ✅.

---

## Étape 2 — `ProfileSettingsForm.tsx`

### Stack

- `useForm<ProfileFormValues>` + `zodResolver(profileSchema)`
- `useMutation` (TanStack Query) pour la persistance
- `useToast` pour le feedback utilisateur
- Invalidation cache `['owner-profile', userId]` (aligné Phase B2)

### Design

Classes glass réutilisées du monolithe (`SETTINGS_INPUT`, `SETTINGS_TEXTAREA`, `SETTINGS_BTN_PRIMARY`), compteur bio **160** caractères (schéma zod).

### Mutation Supabase — adaptation DB

Le template Architecte ciblait `user_public_profile.update()`. En base, **`user_public_profile` est une vue SELECT-only** (`GRANT SELECT`, pas d’UPDATE — cf. `supabase_migrations/init.sql`).

**Mutation réelle :**

```typescript
supabase.from('users').update({ display_name, bio }).eq('id', userId)
```

Cohérent avec l’ancien `handleSaveProfile` et avec `ProfileContent` (lecture/écriture sur `users`).

### Props

```typescript
interface ProfileSettingsFormProps {
  userId: string;
  initialData: { display_name, bio, accent_color };
  onSaved?: (data) => void;  // sync état parent settings
}
```

---

## Intégration monolithe (`app/settings/page.tsx`)

Onglet **Profil** — carte « Informations du profil » :

1. **Conservé** : username (readonly), section changement d’e-mail
2. **Extrait** : nom affiché, bio, bouton enregistrer → `ProfileSettingsForm`
3. **Supprimé** : `handleSaveProfile`, imports/constants inutilisés (`Save`, `SETTINGS_TEXTAREA`)

Le bouclier anti-spam et les autres onglets restent inchangés (phases B3.2+).

---

## Validation TypeScript

```bash
npx tsc --noEmit
```

**Résultat :** exit code **0** ✅

---

## Prochaines étapes suggérées (B3.2+)

| Composant cible | Schéma | État actuel |
|-----------------|--------|-------------|
| `EmailChangeForm` | `emailChangeSchema` | `useState` + pas de `validateSignupEmail` |
| `PasswordChangeForm` | `passwordChangeSchema` | validation manuelle + OTP reauth |
| Bouclier anti-spam | schéma dédié `invitationPrivacySchema` | mutation directe |

---

*Fin du rapport Phase B3.1.*
