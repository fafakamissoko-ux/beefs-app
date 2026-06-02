# Rapport Nuke & Pave — Aura Teaser / Aura Carte

**Date :** 31 mai 2026  
**Référence audit :** `rapport_audit_nuke_aura.md`  
**Fichiers modifiés :** `app/feed/page.tsx`, `components/BeefCard.tsx`  
**Statut :** ✅ reconstruction appliquée

---

## Synthèse

| Zone | Supprimé | Remplacé par |
|------|----------|--------------|
| **`page.tsx`** | `isLikingCard`, `isLikingTeaser` (`useRef`) | — |
| **`page.tsx`** | `setTimeout(..., 1500)` sur les deux handlers | — |
| **`page.tsx`** | Optimistic partiel teaser (sans `teaser_score`) | Optimistic complet `+1`/`-1` sur score et flag |
| **`BeefCard.tsx`** | `localAuraLock`, `localTeaserAuraLock` (`useRef`) | — |
| **`BeefCard.tsx`** | `setTimeout(..., 1500)` sur verrous UI | — |
| **`BeefCard.tsx`** | Appel réseau conditionné au verrou teaser | `onAuraClick?.()` / `onTeaserAuraClick?.()` systématiques |

---

## Étape 1 — Backend React (`page.tsx`)

### Verrous supprimés

```typescript
// SUPPRIMÉ
const isLikingCard = useRef(false);
const isLikingTeaser = useRef(false);
```

### Nouveau flux unidirectionnel

**`handleAuraClick`** et **`handleTeaserAuraClick`** suivent le même modèle :

1. **Optimistic UI instantanée (0 ms)** — toggle `has_liked_*` + incrément/décrément mathématique du score (`engagement_score` / `teaser_score`).
2. **Requête réseau fire-and-forget** — INSERT ou DELETE selon l'état capturé **avant** le toggle, sans rollback ni attente.

Aucun `setTimeout` de blocage. Aucune garde `useRef` sur les clics.

---

## Étape 2 — Interface (`BeefCard.tsx`)

### Aura carte (l. ~472)

- Animation particule `+1` uniquement si `!has_liked_by_user`.
- **`onAuraClick?.()`** appelé à chaque clic (like **et** unlike).

### Aura teaser modale (l. ~626)

- Animation particule `+1` uniquement si `!has_liked_teaser`.
- **`onTeaserAuraClick?.()`** appelé à chaque clic / Enter-Espace (like **et** unlike).
- Plus de `localTeaserAuraLock` ni de délai 1500 ms.

### Conservé (hors scope blocage)

- `setTimeout(..., 800)` pour **retirer les particules visuelles** — animation pure, n'empêche pas les clics.

---

## Vérification purge

| Élément | `page.tsx` | `BeefCard.tsx` |
|---------|------------|----------------|
| `isLikingCard` / `isLikingTeaser` | ❌ absent | — |
| `localAuraLock` / `localTeaserAuraLock` | — | ❌ absent |
| `setTimeout` 1500 ms (verrou) | ❌ absent | ❌ absent |
| Optimistic `teaser_score` ±1 | ✅ présent | — |
| Unlike teaser fonctionnel | ✅ toggle + DELETE réseau | ✅ appel non bloqué |

---

## Comportement attendu

- Clic Aura / Teaser → mise à jour UI **immédiate** du score et de l'état liked.
- Second clic → unlike immédiat (score −1, icône désactivée).
- Pas de lag artificiel de 1,5 s entre deux actions.
- Le canal Realtime `beefs_changes` (debounce 1500 ms sur `loadBeefs`) reste en place — hors scope de cette purge ; peut réconcilier l'état serveur après vote.

---

## Non modifié (hors mission)

- Abonnement Supabase `beefs_changes` + debounce `loadBeefs(true)` (1500 ms).
- Trigger SQL `teaser_likes` → `teaser_score` en base.
- Modale donateurs (`isTeaserAuraModalOpen`, `isBeefAuraModalOpen`).
