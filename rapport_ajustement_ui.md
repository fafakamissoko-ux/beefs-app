# Rapport — Ajustements UI profil (Ref + retrait Vox Populi)

**Date :** 31 mai 2026  
**Statut :** terminé — `npx tsc --noEmit` OK

---

## 1. `ProfileHeader.tsx`

| Avant | Après |
|-------|-------|
| Label métrique `beefs_hosted` : **Médiations** | **Ref** |

Fichier : `components/profile/ProfileHeader.tsx` (ligne ~146)

---

## 2. Profil public — `app/profile/[username]/page.tsx`

### Onglets `ProfileTabs`

| id | Label avant | Label après |
|----|-------------|-------------|
| `debates` | Médiations | **Ref** |
| `participations` | Affaires | Affaires (inchangé) |
| `reviews` | Vox Populi | **Supprimé** |

- Type `activeTab` : `'debates' | 'participations'` (plus `'reviews'`)
- `onTabChange` aligné sur ce union

### Contenu supprimé

- Bloc `{activeTab === 'reviews' && (...)}` (liste `mediatorReviews`, étoiles, `ProfileUserLink`)
- État `mediatorReviews` et appels `fetchMediatorViewerReviews`
- Ancres hash `#reviews` / `#vox-populi`

### Imports nettoyés

- `Star`, `ProfileUserLink`, `fetchMediatorViewerReviews`, `MediatorViewerReviewDisplay`

---

## 3. Profil privé — `app/profile/ProfileContent.tsx`

### Modale aperçu public

Bloc supprimé sous `ProfileHeader mode="preview"` :

- Commentaire `{/* Vox Populi */}`
- Condition `(stats.beefs_hosted > 0 || mediatorReviews.length > 0) && (...)` (liste évaluations)

### Nettoyage associé

- État `mediatorReviews` + fetch au chargement profil
- Imports : `Star`, `ProfileUserLink`, `fetchMediatorViewerReviews`, `MediatorViewerReviewDisplay`

**Conservé :** bloc « Indice de Sagesse » (condition `stats.beefs_resolved >= 3`)

---

## 4. Validation TypeScript

```
npx tsc --noEmit → OK
```

Aucune régression sur `onTabChange` ni sur les types d’onglets actifs.

---

## 5. Périmètre non modifié

- Page résumé beef / dépôt d’avis spectateur (hors profil)
- Onglet **Stats** du profil privé (tuiles médiations / désertions)
- Libellé « Affaires » pour `beefs_participated` dans le header

---

*Fin du rapport — ajustement UI profil Ref / purge Vox Populi.*
