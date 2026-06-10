# Rapport Phase 1 — Transfert Portefeuille (Retraits)

**Date :** 31 mai 2026  
**Statut :** ✅ Appliqué  
**Référence audit :** `rapport_destruction_reconstruction_identite.md`

---

## 1. Objectif

Extraire la logique financière (retraits Lingots) du profil social vers les paramètres, et supprimer le réglage localStorage « Accès Médiation » obsolète.

---

## 2. Étape 1 — `components/settings/WithdrawalWizard.tsx` (créé)

### Props

```typescript
interface WithdrawalWizardProps {
  user: User;
  points: number;
  onPointsDeducted: (euros: number) => void;
}
```

### Éléments migrés depuis `ProfileContent.tsx`

| Catégorie | Détail |
|-----------|--------|
| **States** | `withdrawalStep`, `withdrawalMethod`, `withdrawalAmountEuros`, `withdrawalFields`, `withdrawalLoading`, `withdrawalError`, `withdrawalHistory`, `showEmailSuggestions`, `phoneCountryCode`, `phoneNumber`, `showCountryDropdown` |
| **Constantes** | `ALL_EMAIL_PROVIDERS`, `COUNTRY_CODES` |
| **Helpers** | `getEmailSuggestions()` |
| **Effet** | Fetch `withdrawal_requests` au montage (`user.id`) |
| **Handler** | `handleWithdrawalSubmit` → `/api/withdrawals/request` + `onPointsDeducted(euros)` |
| **JSX** | Intégralité du wizard 4 étapes (summary → form → confirm → success) + historique retraits |

### Design Premium Glass

- Conteneur : `rounded-[2rem] border border-white/10 bg-black/40 backdrop-blur-md shadow-2xl`
- Carte solde : `border-green-500/20 bg-green-950/20`
- Panneaux : `border-white/10 bg-white/5 backdrop-blur-sm`
- Inputs : `rounded-full border-white/10 bg-white/5`
- Bouton succès : libellé « Faire un autre retrait » (contexte Settings)

**Taille :** ~562 lignes

---

## 3. Étape 2 — Purge `app/profile/ProfileContent.tsx`

### Supprimé

- Onglet navigation **« Mes Lingots »** (`setActiveTab('gains')`)
- Bloc JSX `{activeTab === 'gains' && (...)}` (~407 lignes)
- 11 states retraits + constantes email/pays + `handleWithdrawalSubmit`
- `useEffect` chargement `withdrawal_requests` (condition `activeTab === 'gains'`)
- Type `'gains'` retiré de `activeTab` → `'stats' | 'debates'`
- Query URL `?tab=gains` ignorée (plus de mapping)
- Imports inutilisés : `Wallet`, `Euro`, `ChevronDown`, `ArrowLeft`
- Skeleton loading : 3 onglets → **2 onglets**

### Conservé (profil 100 % social)

- Header identité (avatar, bannière, Aura, métriques sociales)
- Onglets **Statistiques** · **Mes Affaires**
- Preview public, upload média, BeefCard, stats médiation

**Taille avant/après :** ~1 675 → **~1 053 lignes** (−622 lignes)

---

## 4. Étape 3 — Injection `app/settings/page.tsx`

### Portefeuille (onglet `wallet`)

```tsx
{activeTab === 'wallet' && user && (
  <div className="space-y-6">
    <WithdrawalWizard
      user={user}
      points={walletPoints}
      onPointsDeducted={(euros) => setWalletPoints((prev) => prev - euros * 100)}
    />
    {/* Carte Historique des Lingots (transactions) — inchangée */}
  </div>
)}
```

- Nouvel état **`walletPoints`** chargé via `loadProfile` (`users.points`)
- Select enrichi : `username, display_name, bio, accent_color, invitation_privacy, points`

### Purge médiation locale

| Élément supprimé | Détail |
|------------------|--------|
| `MEDIATION_ACCESS_STORAGE_KEY` | Constante `beefs_mediation_access` |
| `mediationAccess` state | — |
| Hydratation localStorage | Bloc dans `useEffect` initial |
| Carte JSX | « Accès Médiation » (section `preferences`) |

**Références restantes `beefs_mediation_access` dans le codebase :** **0**

**Taille settings :** ~1 202 lignes (carte médiation −~55 lignes, injection wizard + état points)

---

## 5. Vérifications

| Check | Résultat |
|-------|----------|
| `npx tsc --noEmit` | ✅ OK |
| API retraits `/api/withdrawals/request` | ✅ Inchangée (même payload) |
| OTP / mot de passe Settings | ✅ Non touché |
| Bouclier Anti-Spam (`invitation_privacy`) | ✅ Conservé |
| Fichiers tronqués | ❌ Non — profil, settings et wizard complets |

---

## 6. Parcours utilisateur post-migration

| Avant | Après |
|-------|-------|
| `/profile` → onglet « Mes Lingots » → retraits | `/settings` → onglet **Portefeuille** → `WithdrawalWizard` + historique tx |
| `/profile?tab=gains` | Ignoré (profil social uniquement) |
| Settings › Préférences › Accès Médiation | **Supprimé** |

---

## 7. Prochaines étapes (hors Phase 1)

- Redirect `/profile?tab=gains` → `/settings` (onglet wallet) — optionnel UX
- Extraction `ProfileLayoutShell` (Phase 1 layout profil public/privé)
- Changement d’email sécurisé (Phase 3 audit identité)

---

**Certification :** composant `WithdrawalWizard` créé · profil purgé · portefeuille injecté dans Settings · médiation localStorage supprimée.
