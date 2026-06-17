# Rapport Phase 2 — Onboarding UI (Wizard Premium Glass)

**Date :** 2026-05-31  
**Statut :** Déployé localement (non commité)

---

## 1. Purge du code mort

| Action | Détail |
|--------|--------|
| Supprimé | `app/welcome/page.tsx` (dossier `app/welcome/` entièrement retiré) |
| Redirection legacy | `middleware.ts` : `/welcome` → `/onboarding` (301 interne) pour anciens liens |

### Références mises à jour

| Fichier | Changement |
|---------|------------|
| `components/AppShell.tsx` | Standalone : uniquement `/onboarding` |
| `components/Header.tsx` | Masquage recherche : retrait de `/welcome` |
| `components/OnboardingReminder.tsx` | CTA → `/onboarding` |
| `app/create/page.tsx` | Redirection visiteur non connecté → `/onboarding` |
| `middleware.ts` | Retrait de `/welcome` des `authPaths` |

---

## 2. Reconstruction `app/onboarding/page.tsx`

### Architecture

- **Hook :** `useOnboarding` (Phase 1) — state machine `welcome → identity → bio → complete`
- **Animations :** `framer-motion` (`motion`, `AnimatePresence mode="wait"`)
- **Icônes :** `lucide-react` (Flame, Swords, Shield, Sparkles, Camera, Loader2, CheckCircle, XCircle)

### Conteneur Premium Glass

```
min-h-screen flex items-center justify-center p-4
└── max-w-md w-full rounded-[2.5rem] bg-slate-950/75 backdrop-blur-md border border-white/10 shadow-2xl p-6 sm:p-8
```

### Vues implémentées

| Step | Contenu | Action |
|------|---------|--------|
| `welcome` | Carrousel 4 slides (local `currentSlide` 0–3) | « Suivant » / slide 3 → « Créer mon profil » → `nextStep()` |
| `identity` | Avatar (Camera + file input), displayName, username + statut dispo | « Continuer » (`canProceedToNextStep`) |
| `bio` | Textarea bio, `submitError` | « Entrer dans l'Agora » → `submitOnboarding(user.id)` + Loader2 |

### Design system appliqué

- **Inputs / textarea (verre léger) :** `bg-black/20 border-white/10 rounded-xl focus:border-brand-500`
- **Boutons CTA :** `bg-gradient-to-r from-brand-500 to-orange-500 rounded-xl`
- **Username :** icône dynamique (spinner / CheckCircle vert / XCircle rouge) + hint texte

### Garde-fous conservés

- Redirection `/login?next=/onboarding` si non authentifié
- Redirection `/feed` si `needs_arena_username === false`
- Hydratation profil via `loadProfile(userId)` au montage

---

## 3. Validation TypeScript

```bash
npx tsc --noEmit
```

**Résultat :** ✅ Exit code 0 — aucune erreur d'import ni d'intégration hook/UI.

---

## 4. Prochaine étape suggérée

- Commit & push Phase 2 sur `main`
- Test manuel du tunnel complet (OAuth → carrousel → identité → bio → `/feed`)
- Optionnel : bouton « Retour » entre steps `identity` / `bio` via `prevStep()`
