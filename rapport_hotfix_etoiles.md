# Rapport — Hotfix étoiles CommentsDrawer

**Date :** 31 mai 2026  
**Fichiers modifiés :** `components/Arena/shared/StarField.tsx`, `components/CommentsDrawer.tsx`

---

## Problème

Le `backdrop-blur` du tiroir floutait le `<StarField />` global (`fixed -z-10`), rendant les étoiles illisibles derrière le panneau.

## Étape 1 — StarField mode overlay

**Avant :** composant sans props, toujours `fixed inset-0 -z-10 bg-[#050505]`.

**Après :** prop optionnelle `isOverlay?: boolean` (défaut `false`).

| Mode | Position | Fond |
|------|----------|------|
| `isOverlay={false}` | `fixed inset-0 -z-10` | `bg-[#050505]` |
| `isOverlay={true}` | `absolute inset-0 z-0` | transparent |

Gradient radial et `StarLayer` inchangés dans les deux modes.

**Rétrocompatibilité :** `<StarField />` dans `app/layout.tsx` conserve le comportement global existant.

## Étape 2 — Injection dans CommentsDrawer

- Import : `import { StarField } from '@/components/Arena/shared/StarField'`
- `<StarField isOverlay={true} />` injecté en premier enfant du panneau `motion.div` (`z-[10000]`)
- Le panneau `fixed` sert de containing block pour le `absolute inset-0` de l’overlay
- Header (`z-10`), liste et input restent au-dessus des étoiles

## Validation manuelle

- [ ] Feed : fond étoilé global inchangé hors drawer
- [ ] Drawer ouvert : étoiles nettes **dans** le panneau (non floutées par le blur externe)
- [ ] Header, commentaires et input lisibles par-dessus
