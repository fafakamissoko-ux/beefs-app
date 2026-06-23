# Rapport Phase B3.3 — Formulaires Sécurité (E-mail & Mot de passe)

**Date :** 31 mai 2026  
**Phase :** Frappe B — Refonte Settings (react-hook-form + zod + react-query)  
**Statut :** ✅ Terminé

---

## Objectif

Extraire les formulaires de changement d’e-mail et de mot de passe hors du monolithe `app/settings/page.tsx`, en préservant **à l’identique** la logique `supabase.auth` (réauth, OTP, reauthenticate).

---

## Fichiers créés

| Fichier | Rôle |
|---------|------|
| `components/settings/EmailSettingsForm.tsx` | Changement d’e-mail (RHF + `emailChangeSchema`) |
| `components/settings/PasswordSettingsForm.tsx` | Changement de mot de passe (RHF + `passwordChangeSchema` + flux OTP) |

## Fichiers modifiés

| Fichier | Changement |
|---------|------------|
| `app/settings/page.tsx` | Intégration onglet Sécurité ; suppression handlers/états legacy |

---

## `EmailSettingsForm.tsx`

### Stack

- `useForm<EmailChangeFormValues>` + `zodResolver(emailChangeSchema)`
- `useMutation` pour la persistance Auth
- `useToast` pour feedback (remplace `emailError` / bannière globale)
- État local `pendingNewEmail` pour l’écran « confirmation envoyée »

### `mutationFn` — logique préservée

```typescript
// 1. Ré-authentification (identique à handleChangeEmail)
await supabase.auth.signInWithPassword({ email: currentEmail, password: data.password });
// → throw new Error('Mot de passe actuel incorrect.') si échec

// 2. Mutation e-mail
await supabase.auth.updateUser({ email: data.new_email });
```

### Validation zod

- Format e-mail + `validateSignupEmail` + `isDisposableEmailDomain` (via `emailChangeSchema`)

### UX

- Onglet **Sécurité** : formulaire complet
- Onglet **Profil** : affichage lecture seule + lien vers Sécurité

---

## `PasswordSettingsForm.tsx`

### Stack

- `useForm<PasswordChangeFormValues>` + `zodResolver(passwordChangeSchema)`
- 3 mutations distinctes :
  - `changePasswordMutation` — étape formulaire
  - `confirmOtpMutation` — validation avec `nonce`
  - `resendOtpMutation` — renvoi code

### `mutationFn` — logique préservée

**Étape formulaire :**

```typescript
await supabase.auth.updateUser({
  password: data.new_password,
  current_password: data.current_password,
});
// Si code === 'reauthentication_needed' | 'reauth_nonce_missing' :
//   await supabase.auth.reauthenticate();
//   → passage en étape OTP
```

**Étape OTP :**

```typescript
await supabase.auth.updateUser({
  password: data.new_password,
  current_password: data.current_password,
  nonce: otp,
});
```

**Renvoi OTP :**

```typescript
await supabase.auth.reauthenticate();
```

### États UI conservés

- `passwordStep`: `'form' | 'otp'`
- `passwordOtp` + validation manuelle du code
- Toggle visibilité mot de passe (Eye / EyeOff)
- Hint politique (`PASSWORD_POLICY_SHORT_HINT`)
- Erreurs credentials → `setError('current_password', …)` (équivalent `passwordFieldErrors.current`)

### Validation zod

- Politique mot de passe via `validatePasswordPolicy` (schéma)
- Confirmation identique via `.refine()` sur le schéma

---

## Nettoyage monolithe (`app/settings/page.tsx`)

### Supprimé

| Élément | Type |
|---------|------|
| `handleChangeEmail`, `handleChangePassword`, `handleResendPasswordOtp` | Handlers |
| `resetPasswordChangeForm`, `validateSettingsNewPasswordBlur`, `validateSettingsConfirmBlur` | Helpers |
| `passwords`, `passwordStep`, `passwordOtp`, `showPasswords`, `passwordFieldErrors` | useState |
| `emailForm`, `emailChangeStatus`, `emailError`, `saving` | useState |
| `PasswordFieldKey`, `focusFirstPasswordFieldError`, `PasswordInlineError` | Types / composants locaux |
| Imports `Lock`, `EyeOff`, `AlertCircle`, `validatePasswordPolicy`, `PASSWORD_POLICY_SHORT_HINT` | (Eye conservé pour préférences) |

### Onglet Sécurité — structure

```tsx
<EmailSettingsForm currentEmail={user?.email} />
<PasswordSettingsForm />
```

---

## Validation TypeScript

```bash
npx tsc --noEmit
```

**Résultat :** exit code **0** ✅

---

## Bilan refonte Settings (B3.1 → B3.3)

| Zone | Composant | Statut |
|------|-----------|--------|
| Profil (display_name, bio) | `ProfileSettingsForm` | ✅ B3.1 |
| E-mail | `EmailSettingsForm` | ✅ B3.3 |
| Mot de passe | `PasswordSettingsForm` | ✅ B3.3 |
| Bouclier anti-spam | monolithe | À extraire |
| Préférences / wallet / danger | monolithe | Inchangé |

---

*Fin du rapport Phase B3.3.*
