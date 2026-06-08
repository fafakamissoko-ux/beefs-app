# Rapport — Hotfix verre CommentsDrawer

**Date :** 31 mai 2026  
**Fichier :** `components/CommentsDrawer.tsx`  
**Objectif :** supprimer la teinte bleutée `slate-950` et laisser `<StarField />` visible à travers le panneau.

---

## Changements appliqués

| Zone | Avant | Après |
|------|-------|-------|
| Overlay (`z-[9999]`) | `bg-black/60 backdrop-blur-sm` | `bg-black/40 backdrop-blur-sm` |
| Panneau principal (`z-[10000]`) | `bg-slate-950/70 backdrop-blur-md` | `bg-black/40 backdrop-blur-sm` |
| Bandeau input (`sticky bottom-0`) | `bg-slate-950/80 backdrop-blur-md` | `bg-black/60 backdrop-blur-md` |

**Header :** inchangé (`bg-transparent` — hérite du verre noir du panneau).

---

## Effet attendu

- Fond neutre noir pur, sans dominante slate/bleue.
- Opacités cumulées réduites : overlay 40 % + panneau 40 % laissent les étoiles globales perceptibles.
- Zone de saisie légèrement plus opaque (60 %) pour la lisibilité du texte.

**Validation manuelle :** ouvrir le drawer sur le feed et vérifier la visibilité des étoiles + contraste du champ input.
