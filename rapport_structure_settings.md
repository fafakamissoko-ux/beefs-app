# Rapport — Structure analytique `app/settings/page.tsx`

**Date :** 31 mai 2026  
**Contexte :** Refonte UX Tier-1 annulée sur le visuel — cartographie pour découpage en onglets/sections  
**Fichier :** `app/settings/page.tsx` (~1259 lignes, monolithe client)  
**Statut :** audit uniquement — **aucun code modifié**

---

## 1. Vue d'ensemble

| Métrique | Valeur |
|----------|--------|
| Lignes | ~1259 |
| Composant exporté | `SettingsPage` (default) |
| Sous-composants module | `focusFirstPasswordFieldError`, `PasswordInlineError` |
| Contextes | `useAuth`, `useTheme` |
| Backend direct | Supabase client, `supabase.auth`, `fetch /api/account/delete` |
| Persistance locale | `localStorage` (`beefs_notif_prefs`, `beefs_mediation_access`, `beefs_seen_features`) |

**Imports morts repérés :** `Link`, `FeatureGuide` (importés, non utilisés dans le JSX).

---

## 2. États (`useState`)

| State | Type / forme initiale | Domaine fonctionnel |
|-------|----------------------|---------------------|
| `profile` | `{ username, display_name, bio, email, invitation_privacy }` | Identité + confidentialité invitations |
| `passwords` | `{ current, new, confirm }` | Changement mot de passe |
| `passwordStep` | `'form' \| 'otp'` (défaut `'form'`) | Machine à états MDP (OTP Supabase) |
| `passwordOtp` | `string` | Code reauthentication |
| `showPasswords` | `{ current, new, confirm }` booleans | Toggle visibilité champs MDP |
| `accentColor` | `string` (`'#E83A14'`) | Couleur d'accent profil (DB + UI) |
| `mediationAccess` | `boolean` | Préférence locale médiation (localStorage) |
| `notifPrefs` | `{ messages, follows, invites, beefs_live, gifts, aura, browser }` | Toggles notifications (localStorage) |
| `loading` | `boolean` | Chargement initial profil |
| `saving` | `boolean` | Flag async global (save profil, MDP, renvoi OTP) |
| `message` | `{ type: 'success' \| 'error', text } \| null` | Toast inline page |
| `passwordFieldErrors` | `Partial<Record<'current'\|'new'\|'confirm'\|'otp', string>>` | Erreurs champs MDP |
| `pointTx` | `PointTx[]` | Historique transactions Lingots |

### Types auxiliaires (hors `useState`)

| Nom | Usage |
|-----|--------|
| `PasswordFieldKey` | Clés erreurs / focus MDP |
| `InvitationPrivacy` | `'everyone' \| 'following' \| 'nobody'` |
| `PointTx` | `{ id, amount, balance_after, type, description, created_at }` |

### Contexte (non `useState` local)

| Hook | Exposé | Usage |
|------|--------|--------|
| `useAuth()` | `user`, `signOut`, `authLoading` | Guard auth, delete account |
| `useTheme()` | `preferences`, `updatePreferences` | fontSize, reduceAnimations, highContrast |

---

## 3. Effets (`useEffect`)

| # | Déclencheur | Action |
|---|-------------|--------|
| 1 | `authLoading`, `user`, `router`, `loadProfile` | Redirect `/login?redirect=/settings` si non connecté ; `loadProfile()` ; hydrate `notifPrefs` + `mediationAccess` depuis localStorage |
| 2 | `user?.id` | Fetch `transactions` (50 derniers) → `pointTx` |

---

## 4. Fonctions & handlers

### 4.1 Niveau module (hors `SettingsPage`)

| Fonction | Rôle |
|----------|------|
| `focusFirstPasswordFieldError(errors)` | Focus + scroll vers premier champ MDP en erreur |
| `PasswordInlineError({ id, message })` | Affichage erreur inline sous input MDP |

### 4.2 `SettingsPage` — nommées

| Fonction | Type | Rôle | I/O principale |
|----------|------|------|----------------|
| `loadProfile` | `useCallback` async | Charge `users` (username, display_name, bio, accent_color, invitation_privacy) | Supabase `users.select` |
| `handleSaveProfile` | async | Persiste profil éditable | Supabase `users.update` (display_name, bio, invitation_privacy) |
| `resetPasswordChangeForm` | sync | Reset formulaire MDP + OTP + erreurs | State local |
| `validateSettingsNewPasswordBlur` | `useCallback` | Validation politique MDP au blur | `validatePasswordPolicy` |
| `validateSettingsConfirmBlur` | `useCallback` | Vérifie égalité new/confirm au blur | State local |
| `handleResendPasswordOtp` | async | Renvoie code reauth | `supabase.auth.reauthenticate()` |
| `handleChangePassword` | async | Change MDP (direct ou via OTP) | `supabase.auth.updateUser` + reauthenticate |
| `toggleNotifPref(key)` | sync | Inverse une pref notif | localStorage `beefs_notif_prefs` |
| `handleDeleteAccount` | async | Suppression compte (double confirm) | `POST /api/account/delete` + `signOut` |

### 4.3 Handlers inline (anonymes dans JSX)

| Emplacement | Action |
|-------------|--------|
| Couleur accent (boutons palette) | `setAccentColor` + `supabase.users.update({ accent_color })` immédiat |
| Input `type="color"` accent | idem |
| Taille texte (small/normal/large) | `updatePreferences({ fontSize })` |
| Toggle animations | `updatePreferences({ reduceAnimations })` |
| Toggle contraste | `updatePreferences({ highContrast })` |
| Bouclier anti-spam (3 options) | `setProfile({ ...profile, invitation_privacy: opt.id })` — **persisté seulement via « Enregistrer » global profil** |
| Toggle notif (×7) | `toggleNotifPref(key)` |
| Réinitialiser guides | `localStorage.removeItem('beefs_seen_features')` + message succès |
| Toggle médiation locale | `setMediationAccess` + `localStorage MEDIATION_ACCESS_STORAGE_KEY` |
| Retour étape OTP MDP | `setPasswordStep('form')`, clear OTP/errors |
| Toggles Eye/EyeOff MDP | `setShowPasswords` |
| onChange champs profil / MDP | `setProfile`, `setPasswords`, clear field errors |

---

## 5. Structure visuelle (JSX)

Ordre de rendu top → bottom dans `return` :

| # | Ligne ~ | Titre / en-tête | Conteneur | Contenu clé |
|---|---------|-----------------|-----------|-------------|
| **0** | 452–458 | **`<h1>` Paramètres** | Header | `AppBackButton`, sous-titre « Gérez votre compte… » |
| **—** | 461–485 | *(pas de h)* | `AnimatePresence` | Bannière succès/erreur globale (`message`) |
| **1** | 488–576 | **`<h3>` Informations du profil** | `motion.div.card` | username (disabled), display_name, bio, email (read-only), bouton **Enregistrer** |
| **2** | 578–824 | **`<h3>` Changer le mot de passe** | `motion.div.card` | current/new/confirm, politique MDP, étape OTP, renvoi code, valider/retour |
| **3** | 826–883 | **`<h3>` Historique des Lingots** | `motion.div.card` | Liste `pointTx`, lien « Recharger les Lingots » → `/buy-points` |
| **4** | 885–1032 | **`<h3>` Affichage & accessibilité** | `motion.div.card` | Palette accent (8 couleurs + picker), taille texte, réduire animations, contraste élevé |
| **5** | 1034–1095 | **`<h3>` Bouclier Anti-Spam** | `motion.div.card` | 3 boutons radio-style : Tout le monde / Abonnements / Personne |
| **6** | 1097–1150 | **`<h3>` Radar & alertes** | `motion.div.card` | 7 switches notif (messages, follows, invites, beefs_live, aura, gifts, browser) |
| **7** | 1152–1171 | **`<h3>` Guides d'utilisation** | `motion.div.card` | Bouton réinitialiser guides (`beefs_seen_features`) |
| **8** | 1173–1225 | **`<h3>` Accès Médiation** | `motion.div` glass | Explicatif localStorage, switch médiation |
| **9** | 1227–1253 | **`<h3>` Zone de danger** | `motion.div` border red | Bouton **Supprimer mon compte** |

**Pattern UI récurrent :** chaque section = `motion.div` + icône lucide dans cercle coloré + `h3` + corps `space-y-*`. Classes : `card rounded-2xl p-6` (majorité) ou variantes glass/red.

---

## 6. Matrice domaine → state → handler (découpage futur)

Proposition de **7 onglets/sections isolées** alignée sur le monolithe actuel :

| Section future | States concernés | Handlers |
|----------------|------------------|----------|
| **Profil** | `profile`, `loading`, `saving`, `message` | `loadProfile`, `handleSaveProfile` |
| **Sécurité** | `passwords`, `passwordStep`, `passwordOtp`, `showPasswords`, `passwordFieldErrors`, `saving`, `message` | `handleChangePassword`, `handleResendPasswordOtp`, `resetPasswordChangeForm`, validators, `focusFirstPasswordFieldError` |
| **Lingots** | `pointTx` | useEffect fetch transactions |
| **Apparence** | `accentColor`, `preferences` (ThemeContext) | inline accent update, `updatePreferences` |
| **Confidentialité** | `profile.invitation_privacy` | `handleSaveProfile` (couplé profil aujourd'hui) |
| **Notifications** | `notifPrefs` | `toggleNotifPref`, hydrate useEffect |
| **Avancé** | `mediationAccess`, `message` | toggle médiation, reset guides, `handleDeleteAccount` |

---

## 7. Couplages & dettes pour le découpage

1. **`saving` partagé** entre profil, MDP et renvoi OTP — risque de lock UI croisé si sections séparées.
2. **`message` toast unique** pour toutes les sections — à scoper par onglet ou remplacer par `useToast` global.
3. **`invitation_privacy`** modifié dans « Bouclier » mais **sauvé via `handleSaveProfile`** dans « Informations du profil » — UX confuse ; pas de save dédié anti-spam.
4. **`accent_color`** sauvé **immédiatement** au clic (pas via Enregistrer profil) — incohérent avec bio/display_name.
5. **Pas d'avatar/bannière** dans settings (upload dans `ProfileContent.tsx`) — hors scope fichier mais impact navigation Identité.
6. **1259 lignes** dans un seul composant — candidats extraction : `PasswordSection`, `NotifPrefsSection`, `AccentThemeSection`, `PointsHistorySection`.

---

## 8. Dépendances externes (imports)

| Catégorie | Fichiers / packages |
|-----------|---------------------|
| Auth | `@/contexts/AuthContext` |
| Thème | `@/contexts/ThemeContext` |
| Data | `@/lib/supabase/client` |
| Validation | `@/lib/password-policy` |
| UI | `@/components/AppBackButton`, framer-motion, lucide-react |
| API | `/api/account/delete` |

---

*Cartographie générée pour planifier un découpage Tier-1 par onglets — sans extraction du code source intégral.*
