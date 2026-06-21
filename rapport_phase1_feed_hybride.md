# Rapport Phase 1 — Feed Layout Hybride

**Date :** 2026-05-31  
**Statut :** Mobile snap-y plein conteneur + Desktop grille sans snap

---

## 1. Nettoyage UI

| Élément | Statut |
|---------|--------|
| `mobileViewMode` | Absent (supprimé en commit précédent) |
| Boutons `<List />` / `<LayoutGrid />` | Absents |
| Fond étoilé `StarField` | Conservé |

---

## 2. Conteneur hybride — `#feed-scroll-container`

```tsx
className="flex-1 min-h-0 w-full overflow-y-auto hide-scrollbar flex flex-col snap-y snap-mandatory items-stretch px-0 pt-0 pb-[calc(7rem+env(safe-area-inset-bottom))] md:grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:gap-5 md:snap-none md:items-start md:pb-32 md:p-6 md:pt-4"
```

| Viewport | Comportement |
|----------|--------------|
| **Mobile** | Colonne unique, `snap-y snap-mandatory`, safe-area bottom |
| **Desktop (md+)** | Grille 2→4 colonnes, `md:snap-none`, padding standard |

Enveloppe par carte (BeefCard, skeletons, appât visiteur) :

```tsx
className="relative shrink-0 flex justify-center h-full w-full snap-start snap-always md:h-auto md:block md:snap-align-none"
```

---

## 3. Carte hybride — `BeefCard.tsx`

**`motion.div` :**
```tsx
className="group relative h-full w-full shrink-0 cursor-pointer overflow-hidden bg-transparent md:aspect-[3/4] md:h-auto md:max-h-[70dvh] md:rounded-[1.5rem]"
```

**`mediaBlockRef` :**
```tsx
className="absolute inset-0 z-0 h-full w-full overflow-hidden bg-transparent md:rounded-[1.5rem]"
```

| Viewport | Rendu |
|----------|-------|
| **Mobile** | `h-full w-full`, bords droits (immersion bord à bord) |
| **Desktop** | `aspect-[3/4] max-h-[70dvh]`, coins `rounded-[1.5rem]` |

---

## 4. Validation

```bash
npx tsc --noEmit
```

**Résultat :** ✅ Aucune référence résiduelle à `mobileViewMode`.

---

## Fichiers modifiés

- `app/feed/page.tsx`
- `components/BeefCard.tsx`
- `rapport_phase1_feed_hybride.md` (ce fichier)

**IntersectionObserver** inchangé sur `[data-beef-id]` → `isActiveVideo`.
