# Rapport Phase 2.2 — Badge Fiabilité & nettoyage profil

**Date :** 2026-05-31  
**Statut :** UI Sagesse déployée (Premium Glass), code mort retiré, onboarding mis à jour

---

## 1. Badge « Taux de Fiabilité » — `ProfileHeader.tsx`

| Élément | Détail |
|---------|--------|
| Icône | `ShieldCheck` (lucide-react) |
| Calcul | `reliabilityRate = resolved / (resolved + abandoned) × 100` |
| Seuil | `< 3` terminés → « Ref en évaluation » |
| Design | Verre léger : `border-white/10 bg-slate-900/40 backdrop-blur-sm` |
| Couleurs icône | ≥80 % vert, ≥50 % orange, sinon slate |
| Placement | Sous le bloc Aura, avant les métriques sociales |

Visible sur **tous les modes** : `public`, `owner`, `preview`.

---

## 2. Purge & branchement — `ProfileContent.tsx`

### Branchement DB

```typescript
beefs_resolved: data.beefs_resolved ?? 0,
beefs_abandoned: data.beefs_abandoned ?? 0,
```

Source : `users.select('*')` dans `loadProfile`.

### Code mort supprimé

| Supprimé | Détail |
|----------|--------|
| Import `mediationCategoryForBeef` | Plus utilisé |
| Champs `UserStats` | `beefs_unresolved`, `beefs_in_progress` |
| Calcul client | Filtres `mediationCategoryForBeef` sur `mediatedList` |
| `applyMediationBeefPatch` | Recalcul stats client retiré |
| `selectedResolutionFilter` | État + UI filtre |
| Tuiles « Historique des Jugements » | 4 tuiles + grille filtrée |
| « Taux de réussite » | Barre progression verte/bleue |
| « Indice de Sagesse ✦ » | Modale preview privée |

### Conservé

- Onglet stats simplifié (Beefs hébergés, vues totales + note Sagesse header)
- `MediationBeefEditorPanel` sur onglet « Mes Affaires »
- Stubs remplacés par `stats.beefs_resolved` / `stats.beefs_abandoned` réels

---

## 3. Onboarding — Slide 3 (Ref)

**Fichier :** `app/onboarding/page.tsx`

Nouveau texte slide Shield :

> « Chaque règlement de compte est encadré par un Ref. Son Taux de Fiabilité, affiché publiquement sur son profil, garantit l'impartialité des débats et sanctionne les abandons. »

---

## 4. Validation

```bash
npx tsc --noEmit
```

**Résultat :** ✅ Exit code 0

---

## 5. Flux données Sagesse (bout en bout)

```
Beef END → trigger users.beefs_resolved|abandoned
    ↓
Vue user_public_profile + RPC anon + users.*
    ↓
[username]/page.tsx → stats.beefs_*
ProfileContent.tsx → stats.beefs_* (owner)
    ↓
ProfileHeader → badge Fiabilité (Premium Glass)
```

---

## Fichiers modifiés

- `components/profile/ProfileHeader.tsx`
- `app/profile/ProfileContent.tsx`
- `app/onboarding/page.tsx`
- `rapport_phase2_2_profile_ui.md` (ce fichier)

**Prêt pour commit.** Aucune migration SQL requise (Phase 2.1 déjà déployée).
