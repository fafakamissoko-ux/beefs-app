# Rapport UX Auth Final — Phase 12.3

**Date :** 31 mai 2026  
**Statut :** Implémenté  
**Fichiers modifiés :** `contexts/AuthContext.tsx`, `app/login/page.tsx`

---

## 1. Résumé exécutif

La refonte Phase 12.3 supprime la friction du double-bouton sous l'e-mail et unifie le parcours en **un seul formulaire** avec bascule Mot de passe ↔ Lien Magique. La connexion par **@pseudo** est restaurée via le RPC `login_precheck` déjà déployé en base.

---

## 2. AuthContext — restauration `@pseudo`

### Typage

```typescript
signIn: (identifier: string, password: string) => Promise<{ error: unknown }>;
```

### Logique `signIn`

| Étape | Comportement |
|-------|--------------|
| Identifiant sans `@` | Appel RPC `login_precheck({ p_identifier })` → résolution pseudo → email |
| Échec RPC / email absent | `{ error: { message: "Identifiant introuvable ou compte banni." } }` |
| Identifiant avec `@` | Utilisé directement comme email |
| Final | `supabase.auth.signInWithPassword({ email: targetEmail, password })` |

Le RPC en base (`36_users_anon_rls_login_profile_rpc.sql`) retourne `found`, `email`, `is_banned`, etc. L'implémentation front suit le contrat strict demandé : échec si `data[0].email` absent.

---

## 3. Login — formulaire unifié Tier-1

### State simplifié

| Avant | Après |
|-------|-------|
| `email` / `setEmail` | `identifier` / `setIdentifier` |
| `emailError` | `identifierError` |
| `showPasswordField` | **`isMagicLinkMode`** (défaut `false`) |

### Structure UX

```
[ Apple OAuth ]
[ Google OAuth ]
────── ou ──────
<form unique>
  [ Identifiant ]     type email (magic) | text (password)
  [ Mot de passe ]    visible si !isMagicLinkMode
  [ Mot de passe oublié ? ]   si !isMagicLinkMode
  [ Bouton principal ]  "Se connecter" | "Recevoir le lien magique"
</form>
[ Switch texte ]  bascule isMagicLinkMode
```

### Modes

| Mode | `isMagicLinkMode` | Champ identifiant | Submit |
|------|-------------------|-------------------|--------|
| Mot de passe (défaut) | `false` | `text` — placeholder « E-mail ou @pseudo... » | `handlePasswordLogin` → `signIn(trimmedIdentifier, password)` |
| Lien Magique | `true` | `email` — placeholder « toi@exemple.com » | `handleMagicLink` → `signInWithMagicLink(trimmedIdentifier)` |

### Normalisation `@pseudo`

Helper `normalizeIdentifier()` : retire le `@` initial avant envoi (`@beefmaster` → `beefmaster`), compatible avec la détection `!identifier.includes('@')` dans `signIn`.

### Switch footer

Bouton texte sous le formulaire :
- Mode magic → « Utiliser un mot de passe à la place »
- Mode password → « Connexion sans mot de passe (Lien Magique) »

Reset des erreurs et du flag `magicLinkSent` à chaque bascule.

---

## 4. Matrice de validation fonctionnelle

| Scénario | Attendu | Implémenté |
|----------|---------|------------|
| Login email + mot de passe | Connexion directe | ✅ `signInWithPassword` sans RPC |
| Login `@pseudo` + mot de passe | RPC → email → connexion | ✅ via `login_precheck` |
| Pseudo introuvable | Message identifiant | ✅ « Identifiant introuvable ou compte banni. » |
| Mot de passe incorrect | Message mot de passe | ✅ « Identifiant ou mot de passe incorrect. » |
| Mode Lien Magique | OTP email uniquement | ✅ `signInWithMagicLink` + validation email |
| Bascule magic ↔ password | Un seul bouton d'action | ✅ formulaire unifié |
| OAuth Apple / Google | Inchangé | ✅ au-dessus du séparateur « ou » |

---

## 5. Différences vs ancienne UX (Phase 12.2)

- **Supprimé :** grille 2 colonnes « Recevoir un Lien Magique » + « Utiliser un Mot de passe »
- **Supprimé :** formulaire mot de passe conditionnel séparé du champ email
- **Ajouté :** un `<form>` unique avec submit contextuel
- **Ajouté :** switch texte discret en footer
- **Restauré :** résolution pseudo via RPC (absent depuis refonte portail auth)

---

## 6. Limites connues

1. **Lien Magique** : reste **email-only** (contrainte Supabase OTP) — pas de pseudo en mode magic.
2. **Ban explicite** : le RPC expose `is_banned` ; le front retourne le message générique « introuvable ou banni » si l'email est absent du résultat RPC (comportement strict demandé).
3. **Consommateurs `signIn`** : seul `app/login/page.tsx` appelle `signIn` — pas de breaking change ailleurs.

---

## 7. Checklist déploiement

- [ ] Tester login email + password en local/preview
- [ ] Tester login `@pseudo` (avec et sans `@` initial)
- [ ] Tester bascule Lien Magique → envoi OTP + message succès vert
- [ ] Vérifier redirect post-auth (`/feed` ou `?redirect=`)
- [ ] Fusionner la branche dans `main` avant alignement Vercel/prod

---

*Rapport généré après implémentation Phase 12.3 — aucune autre modification de code requise pour ce livrable.*
