# Rapport squelette — Settings (`app/settings/page.tsx`)

**Date :** 31 mai 2026  
**Nature de l’intervention :** restructuration **strictement structurelle** (navigation par onglets Tier-1)  
**Fichier cible :** `app/settings/page.tsx`

---

## 1. Objectif

Isoler les blocs JSX existants dans une interface à onglets (menu + contenu), avec icônes Lucide React, **sans altérer la logique métier** (OTP mot de passe, retraits/lingots, handlers, effets).

---

## 2. Navigation par onglets — mise en place

### Type et état

```typescript
type SettingTab = 'profile' | 'security' | 'wallet' | 'preferences' | 'danger';
const [activeTab, setActiveTab] = useState<SettingTab>('profile');
```

- **Ajout unique d’état :** `activeTab` (navigation UI uniquement).
- **Onglet par défaut :** `profile`.

### Icônes Lucide importées

| Import | Usage menu |
|--------|------------|
| `User` | Profil |
| `Shield` | Sécurité |
| `Wallet` | Portefeuille |
| `Settings` (alias `SettingsIcon`) | Préférences |
| `AlertTriangle` | Zone de danger (`text-red-400` si inactif) |

Source : `lucide-react` — ligne d’import enrichie, aucune icône métier interne aux cartes modifiée.

### Layout

| Viewport | Comportement |
|----------|--------------|
| **Mobile** | Menu horizontal `flex-row`, `overflow-x-auto`, `hide-scrollbar` |
| **Desktop** | Grille `md:grid-cols-[16rem_1fr]`, menu latéral `md:flex-col`, `md:w-64` |
| **Conteneur** | `max-w-6xl` (au lieu de `max-w-4xl`) pour accueillir sidebar + contenu |

### Style des boutons d’onglet

- **Actif :** `bg-white/10`, texte blanc, icône blanche, `aria-current="page"`.
- **Inactif :** `text-gray-400`, icône grise (rouge pour danger), hover léger `bg-white/[0.04]`.

---

## 3. Mapping onglets → sections JSX (contenu inchangé)

| Onglet | Sections affichées (titres h3 existants) |
|--------|------------------------------------------|
| `profile` | « Informations du profil » · « Bouclier Anti-Spam » (confidentialité) |
| `security` | « Changer le mot de passe » |
| `wallet` | « Historique des Lingots » (sous-titre : achats, directs, cadeaux, **retraits**) |
| `preferences` | « Affichage & accessibilité » (couleur d’accent + préférences d’affichage) · « Radar & alertes » (notifications) · « Guides d’utilisation » · « Accès Médiation » |
| `danger` | « Zone de danger » |

> **Note structurelle :** « Guides d’utilisation » et « Accès Médiation » n’étaient pas listés explicitement dans le brief initial mais restent regroupés sous `preferences` pour éviter toute perte de fonctionnalité — **aucune ligne interne de ces blocs n’a été modifiée**.

Affichage conditionnel : `{activeTab === '…' && ( <motion.div>…</motion.div> )}` autour de chaque carte existante.

---

## 4. Certification — logique métier intacte

### Handlers conservés (aucune modification de corps de fonction)

- `loadProfile`
- `handleSaveProfile`
- `resetPasswordChangeForm`
- `validateSettingsNewPasswordBlur`
- `validateSettingsConfirmBlur`
- `handleResendPasswordOtp`
- `handleChangePassword`
- `toggleNotifPref`
- `handleDeleteAccount`

### États métier conservés (13 + 1 navigation)

| État | Rôle |
|------|------|
| `profile` | Profil + confidentialité |
| `passwords` | Mot de passe |
| `passwordStep` | Flux OTP (`form` \| `otp`) |
| `passwordOtp` | Code OTP |
| `showPasswords` | Visibilité champs |
| `accentColor` | Couleur d’accent |
| `mediationAccess` | Accès médiation locale |
| `notifPrefs` | Préférences notifications |
| `loading` / `saving` | Chargement / sauvegarde |
| `message` | Toast succès/erreur |
| `passwordFieldErrors` | Validation inline mot de passe |
| `pointTx` | Historique lingots |
| **`activeTab`** | **Nouveau — navigation UI seulement** |

### Effets et hooks

- Tous les `useEffect` / `useCallback` existants sont **intacts**.
- Helpers hors composant (`focusFirstPasswordFieldError`, `PasswordInlineError`) **intacts**.

### Ce qui n’a **pas** été touché

- Corps des formulaires OTP / changement de mot de passe
- Requêtes Supabase (`loadProfile`, transactions lingots)
- Toggles notifications, médiation, confidentialité
- Suppression de compte (`handleDeleteAccount`)
- Composants enfants (`FeatureGuide`, `AppBackButton`, etc.)

---

## 5. Diff structurel résumé

```
[Header + message global]
└── Grid (menu | contenu)
    ├── <nav> 5 boutons icône + label
    └── <div space-y-6>
        ├── profile  → cartes profil + bouclier
        ├── security → carte mot de passe
        ├── wallet   → carte historique lingots
        ├── preferences → affichage + radar + guides + médiation
        └── danger   → zone de danger
```

---

## 6. Prochaines étapes suggérées (hors scope squelette)

1. Extraire chaque onglet dans un sous-composant (`SettingsProfileTab`, etc.).
2. Persister `activeTab` dans l’URL (`?tab=security`) pour deep-linking.
3. Tests E2E : flux OTP mot de passe et affichage historique retraits depuis l’onglet Portefeuille.

---

**Statut :** squelette navigation par onglets **appliqué** — logique métier **non altérée**.
